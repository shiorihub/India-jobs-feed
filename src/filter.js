const norm = (s) => (s || '').toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []).map((s) => norm(String(s)).trim()).filter(Boolean);

/** Builds a predicate from the actor input. All given filters must match. */
export function buildFilter(input, now = Date.now()) {
    const keywords = list(input.keywords);
    const exclude = list(input.excludeKeywords);
    const cities = list(input.cities);
    const cutoff = input.postedWithinDays > 0 ? now - input.postedWithinDays * 86400000 : null;
    const searchDescription = input.searchDescription === true;

    return (job) => {
        if (input.indiaOnly !== false && !job.isIndia) return false;
        if (input.remoteOnly === true && !job.isRemote) return false;
        if (cities.length && !job.cities.some((c) => cities.includes(norm(c)))) return false;
        const hay = norm(`${job.title} ${job.department || ''} ${job.team || ''} ${searchDescription ? job.description : ''}`);
        if (keywords.length && !keywords.some((k) => hay.includes(k))) return false;
        if (exclude.some((k) => norm(job.title).includes(k))) return false;
        if (cutoff !== null) {
            const t = Date.parse(job.postedAt || job.updatedAt || '');
            if (Number.isNaN(t) || t < cutoff) return false;
        }
        return true;
    };
}

/** Runs async work over items with a fixed number of workers. */
export async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            out[i] = await fn(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}
