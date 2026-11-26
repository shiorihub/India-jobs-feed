import { readFile } from 'node:fs/promises';
import { Actor, log } from 'apify';
import { runPipeline } from './run.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const defaults = JSON.parse(await readFile(new URL('./companies.json', import.meta.url), 'utf8'));

// A named store survives between runs, which is what makes "only new jobs" work on a schedule.
const kv = input.onlyNew ? await Actor.openKeyValueStore(`india-jobs-seen-${input.stateKey || 'default'}`) : null;
const seenStore = kv && { get: () => kv.getValue('seen'), set: (ids) => kv.setValue('seen', ids) };

const stats = await runPipeline(input, defaults, {
    fetchImpl: fetch,
    log,
    seenStore,
    push: async (job) => {
        // With pay-per-event pricing the platform charges per dataset item and
        // reports when the user's spending limit for this run has been reached.
        const result = await Actor.pushData(job);
        return !result?.eventChargeLimitReached;
    },
});

log.info('Done', stats);
await Actor.setValue('RUN_STATS', stats);
await Actor.exit(`Saved ${stats.jobsPushed} jobs from ${stats.companies - stats.companiesFailed}/${stats.companies} companies`);
