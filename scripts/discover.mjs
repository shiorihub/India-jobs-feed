// Checks candidate company names against each ATS and prints the boards that
// currently list India jobs, ready to merge into src/companies.json.
// Usage: node scripts/discover.mjs names.txt [minIndiaJobs]
import { readFile } from 'node:fs/promises';
import { fetchCompany, SOURCES } from '../src/sources.js';
import { mapLimit } from '../src/filter.js';

const [file, min = '3'] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/discover.mjs names.txt [minIndiaJobs]'); process.exit(1); }

const names = (await readFile(file, 'utf8')).split(/\s+/).filter(Boolean);
const known = new Set(JSON.parse(await readFile(new URL('../src/companies.json', import.meta.url), 'utf8')).map((c) => `${c.ats}:${c.token.toLowerCase()}`));
const tasks = names.flatMap((token) => Object.keys(SOURCES).map((ats) => ({ ats, token }))).filter((c) => !known.has(`${c.ats}:${c.token.toLowerCase()}`));

const found = (await mapLimit(tasks, 6, async (company) => {
    const { jobs } = await fetchCompany(company, { retries: 0, indiaOnly: true, maxPages: 1, timeoutMs: 15000 });
    const india = jobs.filter((j) => j.isIndia).length;
    return india >= Number(min) ? { ...company, india } : null;
})).filter(Boolean);

for (const { india, ...c } of found.sort((a, b) => b.india - a.india)) console.log(`  ${JSON.stringify(c)},  // ${india} India jobs`);
console.error(`${found.length} new boards from ${names.length} names`);
