import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** The shape `context.storageState()` returns and `browser.newContext()` accepts. */
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **What a coarse projection costs `e2e-workspace-fit`** — M0-T3, the number CQ-3 turns on
 * (a projection of the existing sweep, or a sibling suite).
 *
 * **A THROWAWAY PROTOTYPE.** The plan's M0-T3 says to prototype, time it, write the verdict and
 * delete it. It is committed only so the number has a provenance a reader can re-run, and M0-T5
 * removes it.
 *
 * The measurement that matters is not "how long does a sweep take" — the sweep is milliseconds.
 * It is **how a second pointer context gets a signed-in page**. `command-surface.spec.ts:131`
 * builds its page with `browser.newPage()` in `beforeAll`, and its fixture is ~25 s of real
 * sign-up, hierarchy, plan, seed and recalculation. A coarse pass needs its own **context**
 * (`hasTouch` is a context option, not a page one), so the naive projection pays that 25 s twice.
 *
 * This times both shapes:
 *
 * - **naive** — a second context that runs the whole fixture again;
 * - **storageState** — a second context seeded with the first's cookies, navigating straight to the
 *   plan URL the fine page is already on.
 *
 * It also proves the trap the spec's own risk note names: a context built this way reports
 * `pointer: coarse` **only** because `hasTouch` was passed to `newContext`, and `test.use()` would
 * not have reached it.
 */

async function buildFixture(page: Page): Promise<string> {
  const orgSlug = await onboard(page, Date.now() + 41);
  await createHierarchy(page);
  await newPlan(page, 'Projection cost');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 12 }]);
  return page.url();
}

/** The sweep itself, reduced to what it costs: one pass, one count. */
async function sweepCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
    if (!deck) throw new Error('projection-cost: no deck');
    return [...deck.querySelectorAll('button,a,[role="button"]'), ...deck.querySelectorAll('input')]
      .length;
  });
}

async function coarseVia(
  browser: Browser,
  planUrl: string,
  storageState: StorageState,
): Promise<{ ms: number; pointer: string; controls: number }> {
  const t0 = Date.now();
  const ctx = await browser.newContext({
    viewport: { width: 1646, height: 1097 },
    hasTouch: true,
    storageState,
  });
  const p = await ctx.newPage();
  await p.goto(planUrl);
  await p.waitForSelector('[role="toolbar"][aria-label="Plan commands"]', { timeout: 60_000 });
  const pointer = await p.evaluate(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
  );
  const controls = await sweepCount(p);
  const ms = Date.now() - t0;
  await ctx.close();
  return { ms, pointer, controls };
}

test('M0-T3 — what a coarse projection costs', async ({ browser }) => {
  test.setTimeout(600_000);
  clearMeasurement('m0-projection-cost');

  // Baseline: the fine page and its full fixture, timed.
  const fineStart = Date.now();
  const fineCtx = await browser.newContext({ viewport: { width: 1646, height: 1097 } });
  const finePage = await fineCtx.newPage();
  const planUrl = await buildFixture(finePage);
  const fineFixtureMs = Date.now() - fineStart;
  const fineControls = await sweepCount(finePage);
  const state = await fineCtx.storageState();

  // Shape 1 — storageState reuse: no sign-up, straight to the plan. Three runs.
  const reuse: Array<{ ms: number; pointer: string; controls: number }> = [];
  for (let i = 0; i < 3; i += 1) reuse.push(await coarseVia(browser, planUrl, state));

  // Shape 2 — naive: a second context that pays the whole fixture again. One run; the point is
  // its order of magnitude, and running it three times would cost 75 s to learn nothing more.
  const naiveStart = Date.now();
  const naiveCtx = await browser.newContext({
    viewport: { width: 1646, height: 1097 },
    hasTouch: true,
  });
  const naivePage = await naiveCtx.newPage();
  await buildFixture(naivePage);
  const naiveMs = Date.now() - naiveStart;
  const naivePointer = await naivePage.evaluate(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
  );
  await naiveCtx.close();
  await fineCtx.close();

  const reuseMs = reuse.map((r) => r.ms).sort((a, b) => a - b);
  writeMeasurement('m0-projection-cost', {
    fineFixtureMs,
    fineControls,
    reuse: {
      min: reuseMs[0],
      median: reuseMs[1],
      max: reuseMs[2],
      pointer: reuse[0]?.pointer,
      controls: reuse[0]?.controls,
    },
    naive: { ms: naiveMs, pointer: naivePointer },
    f5ThresholdMs: 90_000,
  });
  expect(reuse[0]?.pointer).toBe('coarse');
});
