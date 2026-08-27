import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  diagramList,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Which candidate actually unwraps the object bar — measured by removing controls, not by adding
 * up their widths.**
 *
 * `m0-verify` established that freeing 231.4 px from the facts buys **nothing** at 1646: the dock
 * still lays out on two lines, the row is still 77 px and the canvas is still 757. That is the
 * ADR-0114 M2 phenomenon — a wrapping row breaks between ITEMS, so freed width need not buy a line
 * — and it is the seventh consecutive width expectation in this repository contradicted by its own
 * measurement. Arithmetic is therefore not admissible evidence here.
 *
 * So each candidate is applied by hiding the real controls in the real row and reading what the
 * browser does. `display: none` is not how any of them would be built; this establishes the
 * BUDGET, not the implementation (ADR-0081 §3).
 */
const CANDIDATES: ReadonlyArray<{ name: string; hide: readonly string[] }> = [
  { name: 'today', hide: [] },
  { name: 'A: omit clear-visual-placement (shaded in Early)', hide: ['clear-visual-placement'] },
  {
    name: 'B: A + zoom-to-selection to the deck',
    hide: ['clear-visual-placement', 'zoom-to-selection'],
  },
  {
    name: 'C: A + zoom-to-selection + isolate-logic to the deck',
    hide: ['clear-visual-placement', 'zoom-to-selection', 'isolate-logic'],
  },
  {
    name: 'D: C without omitting clear-visual-placement',
    hide: ['zoom-to-selection', 'isolate-logic'],
  },
];

test('M0 candidates: what actually takes the object bar back to one line', async ({ page }) => {
  clearMeasurement('m0-candidates');
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

  const apply = (hide: readonly string[]) =>
    page.evaluate((ids: readonly string[]) => {
      const foot = document.querySelector('[data-activities-bar]');
      const dock = foot?.children[1];
      if (!dock) return;
      for (const el of dock.querySelectorAll<HTMLElement>('[data-toolbar-item]'))
        el.style.removeProperty('display');
      for (const id of ids) {
        const el = dock.querySelector<HTMLElement>(`[data-toolbar-item="${id}"]`);
        if (el) el.style.display = 'none';
      }
    }, hide);

  const read = (name: string, width: number) =>
    page.evaluate(
      ({ label, w }: { label: string; w: number }) => {
        const r = (n: number): number => Math.round(n * 10) / 10;
        const foot = document.querySelector('[data-activities-bar]');
        const dock = foot?.children[1];
        const cv = document.querySelector('canvas');
        const shown = dock
          ? [...dock.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter(
              (e) => e.style.display !== 'none',
            )
          : [];
        return {
          candidate: label,
          width: w,
          footH: foot ? r(foot.getBoundingClientRect().height) : null,
          canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
          items: shown.length,
          itemsW: r(shown.reduce((s, e) => s + e.getBoundingClientRect().width, 0)),
          dockW: dock ? r(dock.getBoundingClientRect().width) : null,
          lines: shown.length
            ? new Set(shown.map((e) => Math.round(e.getBoundingClientRect().y))).size
            : 0,
        };
      },
      { label: name, w: width },
    );

  const results: Array<Record<string, unknown>> = [];
  for (const width of [1920, 1646, 1440]) {
    await page.setViewportSize({
      width,
      height: width === 1440 ? 900 : width === 1646 ? 1097 : 1080,
    });
    await page.reload();
    await page.waitForTimeout(1400);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(500);
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    for (const c of CANDIDATES) {
      await apply(c.hide);
      await page.waitForTimeout(300);
      results.push(await read(c.name, width));
    }
    await apply([]);
  }

  writeMeasurement('m0-candidates', results);
  expect(results.length).toBe(CANDIDATES.length * 3);
});
