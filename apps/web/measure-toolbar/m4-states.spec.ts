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

  writeMeasurement('m4-states', results);
  expect(results.length).toBe(CASES.length * 2);
});
