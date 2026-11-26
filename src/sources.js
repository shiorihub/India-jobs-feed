// One fetcher per ATS. Each uses the vendor's documented public job-board API,
// which exists so that job listings can be syndicated. No login, no HTML scraping.
import { detectIndia } from './india.js';
import { decodeEntities, htmlToText } from './text.js';

const iso = (d) => {
    if (d === null || d === undefined || d === '') return null;
    const t = new Date(d);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

function base(ats, company, raw) {
    const { isIndia, cities } = detectIndia(raw.locations, raw.countryCode);
    return {
        id: `${ats}:${company.token}:${raw.id}`,
        ats,
        company: raw.companyName || company.name || company.token,
        companyToken: company.token,
        title: (raw.title || '').trim(),
        department: raw.department || null,
        team: raw.team || null,
        employmentType: raw.employmentType || null,
        workplaceType: raw.workplaceType || null,
        location: raw.locations[0] || null,
        allLocations: uniq(raw.locations),
        cities,
        isIndia,
        isRemote: raw.isRemote ?? /remote/i.test(`${raw.workplaceType || ''} ${raw.locations.join(' ')}`),
        salary: raw.salary || null,
        postedAt: iso(raw.postedAt),
        updatedAt: iso(raw.updatedAt),
        url: raw.url,
        applyUrl: raw.applyUrl || raw.url,
        description: raw.description || '',
    };
}

export const SOURCES = {
    greenhouse: {
        url: (token) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`,
        parse(json, company) {
            return (json.jobs || []).map((j) => base('greenhouse', company, {
                id: j.id,
                companyName: j.company_name,
                title: j.title,
                department: j.departments?.[0]?.name,
                locations: uniq([j.location?.name, ...(j.offices || []).flatMap((o) => [o.location, o.name])]),
                postedAt: j.first_published,
                updatedAt: j.updated_at,
                url: j.absolute_url,
                description: htmlToText(decodeEntities(j.content || '')),
            }));
        },
    },
    lever: {
        url: (token) => `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
        parse(json, company) {
            if (!Array.isArray(json)) return [];
            return json.map((j) => {
                const lists = (j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n\n');
                const s = j.salaryRange;
                return base('lever', company, {
                    id: j.id,
                    title: j.text,
                    department: j.categories?.department,
                    team: j.categories?.team,
                    employmentType: j.categories?.commitment,
                    workplaceType: j.workplaceType,
                    locations: uniq([j.categories?.location, ...(j.categories?.allLocations || [])]),
                    countryCode: j.country,
                    salary: s?.min || s?.max ? `${s.currency || ''} ${s.min ?? ''}-${s.max ?? ''} ${s.interval || ''}`.trim() : null,
                    postedAt: j.createdAt,
                    url: j.hostedUrl,
                    applyUrl: j.applyUrl,
                    description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join('\n\n').trim(),
                });
            });
        },
    },
    ashby: {
        url: (token) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`,
        parse(json, company) {
            const addr = (a) => {
                const p = a?.postalAddress || {};
                return [p.addressLocality, p.addressRegion, p.addressCountry].filter(Boolean).join(', ');
            };
            return (json.jobs || []).filter((j) => j.isListed !== false).map((j) => base('ashby', company, {
                id: j.id,
                title: j.title,
                department: j.department,
                team: j.team,
                employmentType: j.employmentType,
                workplaceType: j.workplaceType,
                isRemote: j.isRemote,
                locations: uniq([
                    j.location, addr(j.address),
                    ...(j.secondaryLocations || []).flatMap((l) => [l.location, addr(l.address)]),
                ]),
                salary: j.compensation?.compensationTierSummary || j.compensation?.scrapeableCompensationSalarySummary || null,
                postedAt: j.publishedAt,
                url: j.jobUrl,
                applyUrl: j.applyUrl,
                description: j.descriptionPlain || htmlToText(j.descriptionHtml),
            }));
        },
    },
    smartrecruiters: {
        // The listing endpoint is paginated and carries no description text.
        url: (token, { indiaOnly, offset = 0 } = {}) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(token)}/postings?limit=100&offset=${offset}${indiaOnly ? '&country=in' : ''}`,
        paginate: (json, offset) => (offset + (json.content || []).length < (json.totalFound || 0) && (json.content || []).length > 0 ? offset + json.content.length : null),
        parse(json, company) {
            return (json.content || []).map((j) => {
                const l = j.location || {};
                return base('smartrecruiters', company, {
                    id: j.id,
                    companyName: j.company?.name,
                    title: j.name,
                    department: j.department?.label || j.function?.label,
                    employmentType: j.typeOfEmployment?.label,
                    workplaceType: l.remote ? 'Remote' : l.hybrid ? 'Hybrid' : null,
                    isRemote: l.remote === true,
                    locations: uniq([l.fullLocation, l.city, l.address]),
                    countryCode: l.country,
                    postedAt: j.releasedDate,
                    url: `https://jobs.smartrecruiters.com/${encodeURIComponent(j.company?.identifier || company.token)}/${j.id}`,
                    description: '',
                });
            });
        },
    },
};

/**
 * Fetches and normalises every open job on one company board.
 * @returns {Promise<{jobs: object[], error: string|null}>}
 */
export async function fetchCompany(company, { fetchImpl = fetch, timeoutMs = 30000, retries = 2, indiaOnly = false, maxPages = 30 } = {}) {
    const source = SOURCES[company.ats];
    if (!source) return { jobs: [], error: `unknown ats "${company.ats}"` };

    const getJson = async (url) => {
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
                if (res.status === 404) return { error: 'board not found (404)' };
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return { json: await res.json() };
            } catch (err) {
                lastError = err.message || String(err);
                if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
            }
        }
        return { error: lastError };
    };

    const jobs = [];
    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
        const { json, error } = await getJson(source.url(company.token, { indiaOnly, offset }));
        // Keep whatever earlier pages returned; report the failure alongside.
        if (error) return { jobs, error };
        jobs.push(...source.parse(json, company));
        const next = source.paginate ? source.paginate(json, offset) : null;
        if (next === null) break;
        offset = next;
    }
    return { jobs, error: null };
}
