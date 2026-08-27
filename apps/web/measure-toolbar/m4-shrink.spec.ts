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
 * **M4 shipped as a no-op, and this measures what would make it real.**
 *
 * `flex-wrap` + `gap-y-0` on the facts row permits wrapping and nothing constrains it: the row is
 * `shrink-0` with `basis: auto`, so it takes its natural 481.4 px and stays on one line at every
 * width and in both states. Measured, not suspected — `m3m4-result.json` shows `481.4x24` six times
 * out of six. A capability with no way to be reached is ADR-0081's defect, and shipping the class
 * alone would have been exactly that, dressed as a fix.
 *
 * The obvious repair is to let the facts YIELD width when the row is tight. That is not obviously
 * safe: the dock beside them is `flex-1` with `flex-basis: 0%`, and flex shrink is weighted by
 * basis — so a shrinkable facts block might take width from itself, or the dock might collapse to
 * nothing and overflow its own contents. Which of those happens is a question about the flex
 * algorithm on this exact tree, and this epic's record on answering those from first principles is
 * nine attempts, eight wrong.
 *
 * So each candidate is applied to the real elements and read. Not how it would be built.
 */
const CANDIDATES = [
  { name: 'today (shipped M4: wrap allowed, shrink-0)', facts: {}, outer: {} },
  {
    name: 'A: facts row shrinkable',
    facts: { 'flex-shrink': '1', 'min-width': '0' },
    outer: {},
  },
  {
    name: 'B: facts row AND its wrapper shrinkable',
    facts: { 'flex-shrink': '1', 'min-width': '0' },
    outer: { 'flex-shrink': '1', 'min-width': '0' },
  },
  // A and B both changed nothing, and the reason is that there is no shrinking pressure to
  // respond to: the dock beside the facts is `flex-1` with `basis: 0%`, so it GROWS into whatever
  // is left and absorbs the whole deficit by wrapping its own items. The facts are never squeezed,
  // whatever their shrink factor. They can only wrap if they are explicitly bounded.
  { name: 'C: facts bounded at 250px', facts: { 'max-width': '250px' }, outer: {} },
  { name: 'D: facts bounded at 300px', facts: { 'max-width': '300px' }, outer: {} },
];

test('M4: what actually lets the facts wrap when the row is tight', async ({ page }) => {
  clearMeasurement('m4-shrink');
  test.setTimeout(600_000);

  await page.setViewportSize({ width: 1440, height: 900 });
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

  const apply = (c: { facts: Record<string, string>; outer: Record<string, string> }) =>
    page.evaluate(
      ({ facts, outer }: { facts: Record<string, string>; outer: Record<string, string> }) => {
        const row = document.querySelector<HTMLElement>('[data-schedule-state]');
        const wrapper = row?.parentElement;
        if (row) row.style.cssText = '';
        if (wrapper) wrapper.style.cssText = '';
        for (const [k, v] of Object.entries(facts)) row?.style.setProperty(k, v);
        for (const [k, v] of Object.entries(outer)) wrapper?.style.setProperty(k, v);
      },
      c,
    );

  const read = (name: string, width: number) =>
    page.evaluate(
      ({ label, w }: { label: string; w: number }) => {
        const r = (n: number): number => Math.round(n * 10) / 10;
        const foot = document.querySelector('[data-activities-bar]');
        const row = document.querySelector('[data-schedule-state]');
        const cv = document.querySelector('canvas');
        const dock = foot?.children[0];
        const items = dock
          ? [...dock.querySelectorAll('[data-toolbar-item)]'.replace(')]', ']'))]
          : [];
        return {
          candidate: label,
          width: w,
          footH: foot ? r(foot.getBoundingClientRect().height) : null,
          canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
          factsW: row ? r(row.getBoundingClientRect().width) : null,
          factsH: row ? r(row.getBoundingClientRect().height) : null,
          dockW: dock ? r(dock.getBoundingClientRect().width) : null,
          dockItems: items.length,
          // Did anything overflow its own box? The failure mode a shrinking dock would produce.
          dockScrollW: dock ? r((dock as HTMLElement).scrollWidth) : null,
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
      await apply(c);
      await page.waitForTimeout(320);
      results.push(await read(c.name, width));
    }
    await apply(CANDIDATES[0]!);
  }

  writeMeasurement('m4-shrink', results);
  expect(results.length).toBe(CANDIDATES.length * 3);
});
