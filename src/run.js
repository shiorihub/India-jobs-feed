// The whole pipeline, with storage and network passed in so it can be tested offline.
import { fetchCompany } from './sources.js';
import { buildFilter, mapLimit } from './filter.js';

export function resolveCompanies(input, defaults) {
    const custom = (Array.isArray(input.companies) ? input.companies : [])
        .map((c) => (typeof c === 'string' ? c.split(':') : [c.ats, c.token, c.name]))
        .map(([ats, token, name]) => ({ ats: String(ats || '').trim().toLowerCase(), token: String(token || '').trim(), name }))
        .filter((c) => c.ats && c.token);
    const all = [...(input.includeDefaultCompanies === false ? [] : defaults), ...custom];
    const seen = new Set();
    return all.filter((c) => {
        const key = `${c.ats}:${c.token.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * @param {object} deps
 * @param {(job: object) => Promise<boolean|void>} deps.push return false to stop (e.g. user's spend limit reached)
 * @param {{get: Function, set: Function}} [deps.seenStore] remembers job ids between runs for onlyNew mode
 */
export async function runPipeline(input, defaults, { fetchImpl, push, seenStore, log = console, now = Date.now() }) {
    const companies = resolveCompanies(input, defaults);
    const keep = buildFilter(input, now);
    const maxItems = input.maxItems > 0 ? input.maxItems : Infinity;
    const onlyNew = input.onlyNew === true && seenStore;
    const seen = new Set(onlyNew ? (await seenStore.get()) || [] : []);
    const stats = { companies: companies.length, companiesFailed: 0, jobsFetched: 0, jobsMatched: 0, jobsPushed: 0, errors: [] };

    const results = await mapLimit(companies, input.concurrency > 0 ? input.concurrency : 8, async (company) => {
        const res = await fetchCompany(company, { fetchImpl, indiaOnly: input.indiaOnly !== false });
        if (res.error) {
            stats.companiesFailed++;
            stats.errors.push(`${company.ats}:${company.token} ${res.error}`);
            log.warning?.(`Skipped ${company.ats}:${company.token}: ${res.error}`);
        }
        return res.jobs;
    });

    const jobs = results.flat();
    stats.jobsFetched = jobs.length;
    const matched = jobs.filter(keep).sort((a, b) => (b.postedAt || '').localeCompare(a.postedAt || ''));
    stats.jobsMatched = matched.length;

    const currentIds = new Set(matched.map((j) => j.id));
    for (const job of matched) {
        if (stats.jobsPushed >= maxItems) break;
        if (onlyNew && seen.has(job.id)) continue;
        const out = input.includeDescription === false ? { ...job, description: undefined } : job;
        const ok = await push({ ...out, scrapedAt: new Date(now).toISOString() });
        if (ok === false) break;
        seen.add(job.id);
        stats.jobsPushed++;
    }
    // Forget ids of jobs that have closed, so the store cannot grow without bound.
    if (onlyNew) await seenStore.set([...seen].filter((id) => currentIds.has(id)));
    return stats;
}
