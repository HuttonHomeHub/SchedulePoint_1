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
 * **Where does the plan header row wrap now that the mode cluster has lost two buttons?**
 *
 * `e2e-workspace-fit/pen-status.spec.ts` asserts the row is one line at 1646 and 1440 and **two**
 * at 1280, and its own docblock says why the two-line width has to be there: without it the case
 * "would only ever prove the row fits, which is half a claim". One-planning-surface M-F-T5 deleted
 * the `Early | Visual` pair, and 1280 became one line — a gain, and one that costs the gate its
 * falsifying width.
 *
 * So this finds the new boundary by sweep rather than by arithmetic, which is the rule this surface
 * has contradicted seven times running. Asserts nothing (ADR-0081 §3).
 */
const WIDTHS = [1440, 1280, 1152, 1100, 1060, 1024, 990, 960, 900, 860, 820, 768];

test('the header row, swept for its wrap boundary', async ({ page }) => {
  test.setTimeout(240_000);
  clearMeasurement('m-f-header-wrap');

  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, `Riverside Quarter phase two ${stamp}`);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Dig', laneIndex: 0, durationDays: 5 }]);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  const readings: unknown[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(350);
    const reading = await page.evaluate(() => {
      // Same locator the gate uses (`pen-status.spec.ts`) — the header's first child.
      const row = document.querySelector('header')?.firstElementChild as HTMLElement | null;
      if (!row) return null;
      const tallest = Math.max(
        0,
        ...[...row.children].map((c) => (c as HTMLElement).getBoundingClientRect().height),
      );
      const box = row.getBoundingClientRect();
      return {
        lines: tallest > 0 ? Math.round(box.height / tallest) : 0,
        rowHeight: Math.round(box.height),
        rowWidth: Math.round(box.width),
        contentWidth: [...row.children].reduce(
          (sum, c) => sum + (c as HTMLElement).getBoundingClientRect().width,
          0,
        ),
      };
    });
    readings.push({ width, ...(reading ?? { lines: null }) });
  }

  expect(readings.length).toBe(WIDTHS.length);
  writeMeasurement('m-f-header-wrap', { takenAt: new Date().toISOString(), readings });
});
