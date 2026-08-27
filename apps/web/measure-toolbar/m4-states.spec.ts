import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **The ux gate's blocking finding, measured rather than accepted.**
 *
 * M4 bounds the plan's facts at `max-w-64` and claims two 16 px lines are 32 px, under the 40 px
 * collapse button that sets the row's floor — so the row stays 41 px and the diagram pays nothing.
 * Every reading behind that claim was taken **after `recalculate()`**, and the review pointed out
 * what that excludes: `ScheduleStateRegion` and `PenStatusOutlet` are siblings inside the *same*
 * bounded `flex-wrap` container (`plan-facts.tsx:141` and `:156`), and the first renders nothing at
 * all in the `current` state. So the fixture exercised the one combination where two of the row's
 * five content sources are absent.
 *
 * If the finding holds, the row grows in an ordinary **stale** state — no selection required — which
 * is a strictly worse version of the defect this epic exists to close: ADR-0114's wrap needed a
 * planner to click a bar, and this would need only an uncalculated edit.
 *
 * The epic's own rule is that a number decides. This makes the plan stale by adding an activity
 * after a recalculation and reads the row in both states.
 */
const CASES = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 900 },
];

test('M4 states: does a stale schedule grow the foot row?', async ({ page }) => {
  clearMeasurement('m4-states');
  test.setTimeout(600_000);

  await page.setViewportSize({ width: 1646, height: 1097 });
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const read = (state: string, width: number) =>
    page.evaluate(
      ({ label, w }: { label: string; w: number }) => {
        const r = (n: number): number => Math.round(n * 10) / 10;
        const foot = document.querySelector('[data-activities-bar]');
        const row = document.querySelector('[data-schedule-state]');
        // The bound now sits on the facts wrapper INSIDE the row (M4 fix), so report both: the row
        // is what decides the foot's height, the wrapper is what the two-line treatment governs.
        const bounded = row?.firstElementChild ?? null;
        const cv = document.querySelector('canvas');
        if (!foot || !row) throw new Error('foot row or facts row missing');
        // Distinct top offsets among the bounded container's own children = how many lines it took.
        const lines = new Set(
          [...row.children]
            .filter((c) => c.getBoundingClientRect().height > 0)
            .map((c) => Math.round(c.getBoundingClientRect().y)),
        ).size;
        return {
          state: label,
          width: w,
          scheduleState: row.getAttribute('data-schedule-state'),
          footH: r(foot.getBoundingClientRect().height),
          canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
          factsRowH: r(row.getBoundingClientRect().height),
          factsRowW: r(row.getBoundingClientRect().width),
          factsLines: lines,
          boundedW: bounded ? r(bounded.getBoundingClientRect().width) : null,
          boundedH: bounded ? r(bounded.getBoundingClientRect().height) : null,
          text: (row.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 90),
        };
      },
      { label: state, w: width },
    );

  const results: Array<Record<string, unknown>> = [];
  for (const c of CASES) {
    await page.setViewportSize(c);
    await page.reload();
    await page.waitForTimeout(1400);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(600);
    results.push(await read('current (what every earlier reading used)', c.width));
  }

  // Make the schedule stale: add an activity and do NOT recalculate.
  // `ensurePen` first — the reload loop above drops the lease, and a write without it is a 423.
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Blind and reinforce', laneIndex: 2, durationDays: 9 },
  ]);

  for (const c of CASES) {
    await page.setViewportSize(c);
    await page.reload();
    await page.waitForTimeout(1600);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(800);
    results.push(await read('STALE — edits not calculated', c.width));
  }

  /* ---------------------------------------------------------------------------------------
   * **Seeding an activity did not make the plan stale** — `data-schedule-state` stayed `current`
   * in all six readings above, because `deriveScheduleState`'s `edits` counter comes from the
   * client's own pending mutations, not from a row appearing via the API. So those readings are
   * INCONCLUSIVE about the review's finding rather than a disproof of it, and saying so matters:
   * a green probe that never reached the state it was named for is the ambiguity this epic has
   * already been bitten by twice.
   *
   * The question is answerable without driving the app into that state, because it is a question
   * about layout: **if this content renders inside the bounded container, does the row grow?** So
   * the real stale sentence and a Recalculate-sized control are injected into the real container
   * and the browser is asked. `plan-status-bar.test.tsx:165` gives the longest copy verbatim.
   * ------------------------------------------------------------------------------------------ */
  const injected: Array<Record<string, unknown>> = [];
  for (const c of CASES) {
    await page.setViewportSize(c);
    await page.reload();
    await page.waitForTimeout(1400);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(600);
    const before = await read('before injection', c.width);
    await page.evaluate(() => {
      const row = document.querySelector('[data-schedule-state]');
      if (!row) throw new Error('facts row missing');
      // Mirrors `ScheduleStateRegion`'s stale branch: an `ml-auto inline-flex gap-2` wrapper
      // holding the sentence and an `h-5 px-2 text-xs` button.
      const region = document.createElement('span');
      region.setAttribute('data-probe-stale', '');
      region.className = 'ml-auto inline-flex items-center gap-2';
      region.innerHTML =
        '<span class="whitespace-nowrap">Could not calculate — 3 edits still pending</span>' +
        '<button class="h-5 gap-1 px-2 text-xs border rounded-md inline-flex items-center">Recalculate</button>';
      row.appendChild(region);
    });
    await page.waitForTimeout(300);
    injected.push({
      ...(await read('WITH the stale region injected', c.width)),
      before: before.footH,
    });
    await page.evaluate(() => document.querySelector('[data-probe-stale]')?.remove());
  }

  writeMeasurement('m4-states', [...results, ...injected]);
  expect(results.length).toBe(CASES.length * 2);
});
