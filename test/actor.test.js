import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { detectIndia } from '../src/india.js';
import { htmlToText } from '../src/text.js';
import { SOURCES, fetchCompany } from '../src/sources.js';
import { buildFilter } from '../src/filter.js';
import { runPipeline, resolveCompanies } from '../src/run.js';

const fx = async (n) => JSON.parse(await readFile(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-26T00:00:00Z');

test('detectIndia: explicit, implied, and look-alikes', () => {
    assert.deepEqual(detectIndia(['Bangalore, India']), { isIndia: true, cities: ['Bengaluru'] });
    assert.equal(detectIndia(['Gurgaon']).isIndia, true);
    assert.deepEqual(detectIndia(['Gurgaon']).cities, ['Gurugram']);
    assert.equal(detectIndia(['Indianapolis, Indiana']).isIndia, false);
    assert.equal(detectIndia(['Delhi, New York, USA']).isIndia, false);
    assert.equal(detectIndia(['London'], 'IN').isIndia, true);
    assert.equal(detectIndia(['tamil nadu']).isIndia, true);
    assert.equal(detectIndia(['Remote - EMEA']).isIndia, false);
    assert.equal(detectIndia([]).isIndia, false);
});

test('htmlToText keeps structure and decodes entities', () => {
    assert.equal(htmlToText('<p>A &amp; B</p><ul><li>one</li><li>two</li></ul>'), 'A & B\n\n- one\n- two');
    assert.equal(htmlToText('<script>x()</script>hi&#39;s &#x41;'), "hi's A");
    assert.equal(htmlToText(null), '');
});

test('greenhouse parser', async () => {
    const jobs = SOURCES.greenhouse.parse(await fx('greenhouse'), { ats: 'greenhouse', token: 'groww' });
    assert.equal(jobs.length, 3);
    const [a, b, c] = jobs;
    assert.equal(a.id, 'greenhouse:groww:4970739101');
    assert.equal(a.company, 'Groww');
    assert.equal(a.isIndia, true);
    assert.deepEqual(a.cities, ['Bengaluru']);
    assert.equal(a.postedAt, '2026-09-14T07:49:28.000Z');
    assert.match(a.description, /^About Groww:\n\nWe are a passionate group & team\.\n\n- Audit things$/);
    assert.equal(b.isIndia, false);
    assert.equal(c.isIndia, true, 'office location counts');
    assert.equal(c.isRemote, true);
});

test('lever parser', async () => {
    const jobs = SOURCES.lever.parse(await fx('lever'), { ats: 'lever', token: 'cred', name: 'CRED' });
    assert.equal(jobs[0].company, 'CRED');
    assert.equal(jobs[0].isIndia, true);
    assert.equal(jobs[0].employmentType, 'full time');
    assert.match(jobs[0].description, /what will you do:\n- own collection performance/);
    assert.equal(jobs[1].isIndia, false);
    assert.equal(jobs[1].salary, 'GBP 10-20 per-year-salary');
    assert.deepEqual(SOURCES.lever.parse({ ok: false }, { token: 'x' }), []);
});

test('ashby parser hides unlisted jobs and reads secondary locations', async () => {
    const jobs = SOURCES.ashby.parse(await fx('ashby'), { ats: 'ashby', token: 'atlan' });
    assert.deepEqual(jobs.map((j) => j.id), ['ashby:atlan:c6', 'ashby:atlan:us']);
    assert.equal(jobs[0].isIndia, true);
    assert.equal(jobs[0].isRemote, true);
    assert.equal(jobs[1].isIndia, true);
    assert.deepEqual(jobs[1].cities, ['Bengaluru']);
});

test('fetchCompany: 404, retry then success, unknown ats', async () => {
    const r404 = await fetchCompany({ ats: 'lever', token: 'nope' }, { fetchImpl: async () => ({ status: 404, ok: false }) });
    assert.match(r404.error, /404/);
    let calls = 0;
    const flaky = async () => (++calls < 2 ? { status: 503, ok: false } : { status: 200, ok: true, json: async () => [] });
    const ok = await fetchCompany({ ats: 'lever', token: 'x' }, { fetchImpl: flaky });
    assert.equal(ok.error, null);
    assert.equal(calls, 2);
    assert.match((await fetchCompany({ ats: 'workday', token: 'x' })).error, /unknown ats/);
});

test('smartrecruiters: paginates and builds public job links', async () => {
    const mk = (id) => ({ id, name: `Job ${id}`, company: { identifier: 'BoschGroup', name: 'Bosch Group' }, releasedDate: '2026-11-25T18:38:12.714Z', typeOfEmployment: { label: 'Full-time' }, function: { label: 'Engineering' }, location: { city: 'Kurli', country: 'in', fullLocation: 'Kurli, MH, India', address: 'Chakan - Pune', remote: false, hybrid: true } });
    const urls = [];
    const fetchImpl = async (url) => {
        urls.push(url);
        const offset = Number(new URL(url).searchParams.get('offset'));
        const content = offset === 0 ? [mk('1'), mk('2')] : [mk('3')];
        return { status: 200, ok: true, json: async () => ({ totalFound: 3, content }) };
    };
    const { jobs, error } = await fetchCompany({ ats: 'smartrecruiters', token: 'BoschGroup' }, { fetchImpl, indiaOnly: true });
    assert.equal(error, null);
    assert.equal(jobs.length, 3);
    assert.equal(urls.length, 2);
    assert.match(urls[0], /country=in/);
    assert.match(urls[1], /offset=2/);
    assert.equal(jobs[0].url, 'https://jobs.smartrecruiters.com/BoschGroup/1');
    assert.equal(jobs[0].isIndia, true);
    assert.deepEqual(jobs[0].cities, ['Pune']);
    assert.equal(jobs[0].workplaceType, 'Hybrid');
});

test('filter: keywords, cities, age, exclude', () => {
    const job = { isIndia: true, isRemote: false, cities: ['Pune'], title: 'Senior Data Engineer', description: 'kafka', postedAt: '2026-11-20T00:00:00Z' };
    assert.equal(buildFilter({}, NOW)(job), true);
    assert.equal(buildFilter({ keywords: ['designer', 'ENGINEER'] }, NOW)(job), true);
    assert.equal(buildFilter({ keywords: ['kafka'] }, NOW)(job), false);
    assert.equal(buildFilter({ keywords: ['kafka'], searchDescription: true }, NOW)(job), true);
    assert.equal(buildFilter({ excludeKeywords: ['senior'] }, NOW)(job), false);
    assert.equal(buildFilter({ cities: ['pune'] }, NOW)(job), true);
    assert.equal(buildFilter({ cities: ['Mumbai'] }, NOW)(job), false);
    assert.equal(buildFilter({ postedWithinDays: 3 }, NOW)(job), false);
    assert.equal(buildFilter({ postedWithinDays: 7 }, NOW)(job), true);
    assert.equal(buildFilter({ remoteOnly: true }, NOW)(job), false);
    assert.equal(buildFilter({}, NOW)({ ...job, isIndia: false }), false);
    assert.equal(buildFilter({ indiaOnly: false }, NOW)({ ...job, isIndia: false }), true);
});

test('resolveCompanies merges, parses strings, dedupes', () => {
    const d = [{ ats: 'lever', token: 'cred' }];
    assert.deepEqual(resolveCompanies({ companies: ['Lever:CRED', 'greenhouse:stripe', 'bad'] }, d).map((c) => `${c.ats}:${c.token}`), ['lever:cred', 'greenhouse:stripe']);
    assert.equal(resolveCompanies({ includeDefaultCompanies: false }, d).length, 0);
});

async function harness(input, memory) {
    const files = { greenhouse: await fx('greenhouse'), lever: await fx('lever'), ashby: await fx('ashby') };
    const fetchImpl = async (url) => {
        if (url.includes('broken')) return { status: 500, ok: false };
        const key = url.includes('greenhouse') ? 'greenhouse' : url.includes('lever') ? 'lever' : 'ashby';
        return { status: 200, ok: true, json: async () => files[key] };
    };
    const pushed = [];
    const seenStore = { get: async () => memory.seen, set: async (v) => { memory.seen = v; } };
    const defaults = [{ ats: 'greenhouse', token: 'groww' }, { ats: 'lever', token: 'cred' }, { ats: 'ashby', token: 'atlan' }, { ats: 'lever', token: 'broken' }];
    const stats = await runPipeline(input, defaults, { fetchImpl, seenStore, now: NOW, log: {}, push: async (j) => { pushed.push(j); return input.stopAfter ? pushed.length < input.stopAfter : true; } });
    return { stats, pushed };
}

test('pipeline: India only, newest first, failed board does not sink the run', async () => {
    const { stats, pushed } = await harness({ concurrency: 2 }, {});
    assert.equal(stats.jobsFetched, 7);
    assert.equal(stats.companiesFailed, 1);
    assert.equal(pushed.length, 5);
    assert.ok(pushed.every((j) => j.isIndia && j.scrapedAt));
    const dates = pushed.map((j) => j.postedAt);
    assert.deepEqual(dates, [...dates].sort().reverse());
});

test('pipeline: onlyNew returns nothing the second time, maxItems and spend limit respected', async () => {
    const memory = {};
    assert.equal((await harness({ onlyNew: true }, memory)).pushed.length, 5);
    assert.equal(memory.seen.length, 5);
    assert.equal((await harness({ onlyNew: true }, memory)).pushed.length, 0);
    assert.equal((await harness({ maxItems: 2 }, {})).pushed.length, 2);
    const limited = await harness({ stopAfter: 3 }, {});
    assert.equal(limited.stats.jobsPushed, 2, 'the item that hit the limit is not counted as delivered');
    const noDesc = await harness({ includeDescription: false }, {});
    assert.ok(noDesc.pushed.every((j) => j.description === undefined));
});
