import { expect, test } from '@playwright/test';

import { clearMeasurement, writeMeasurement } from './output';
import {
  createHierarchy,
  diagramList,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **M1's falsification condition, run against the shipped code.**
 *
 * Written before the milestone was built and recorded in
 * `docs/specs/workspace-foot-and-deck/m0-measurement.md`:
 *
 *   > If the foot row is not 41 px at 1646 with one activity selected, M1 is withdrawn.
 *
 * The claim under test is narrow on purpose. M1 fixes 1920 and **1646**, and does **not** fix 1440
 * — `m0-candidates.spec.ts` showed nothing tested reaches one line there, because seven controls
 * still exceed the 569.6 px available. A milestone that claimed to fix "the wrap" would be claiming
 * something its own measurement does not support, so 1440 is asserted to be *unchanged* rather than
 * quietly omitted.
 *
 * **The Explorer's width is pinned by reading it, not assumed.** It is user-resizable 200–420 px
 * (`m0-verify`), a range comparable to the 261.8 px shortfall, so a gate that ignores it would be
 * flaky for a reason unrelated to the code. This records the width it ran at with every number.
 */
const CASES = [
  { width: 1920, height: 1080, expectFoot: 41, note: 'was already one line' },
  { width: 1646, height: 1097, expectFoot: 41, note: 'THE fix — was 77' },
  { width: 1440, height: 900, expectFoot: 117, note: 'deliberately unfixed — was 117' },
];

test('M1: the object bar on one line at 1646, and honest about 1440', async ({ page }) => {
  clearMeasurement('m1-result');
  test.setTimeout(600_000);

  await page.setViewportSize({ width: 1920, height: 1080 });
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

  const results: Array<Record<string, unknown>> = [];
  for (const c of CASES) {
    await page.setViewportSize({ width: c.width, height: c.height });
    await page.reload();
    await page.waitForTimeout(1400);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(500);
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);

    const read = await page.evaluate(() => {
      const r = (n: number): number => Math.round(n * 10) / 10;
      const foot = document.querySelector('[data-activities-bar]');
      const cv = document.querySelector('canvas');
      const sep = document.querySelector('[role="separator"][aria-orientation="vertical"]');
      const dock = foot?.children[1];
      const items = dock ? [...dock.querySelectorAll('[data-toolbar-item]')] : [];
      return {
        footH: foot ? r(foot.getBoundingClientRect().height) : null,
        canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
        explorerWidth: sep?.getAttribute('aria-valuenow') ?? null,
        selected: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
        itemIds: items.map((e) => e.getAttribute('data-toolbar-item')),
        itemsW: r(items.reduce((s, e) => s + e.getBoundingClientRect().width, 0)),
      };
    });
    results.push({ ...c, ...read });

    // The selection must genuinely exist, or a one-line row proves only that the bar is absent —
    // the ambiguity that made the first M0 probe worthless.
    expect(read.selected, `${c.width}: an activity is selected`).toBe(1);
    expect(read.footH, `${c.width} (${c.note})`).toBe(c.expectFoot);
    // The withdrawn control is gone in Early mode, and Zoom to selection is still reachable.
    expect(read.itemIds).not.toContain('clear-visual-placement');
    expect(read.itemIds).toContain('zoom-to-selection');
  }

  writeMeasurement('m1-result', results);
});
