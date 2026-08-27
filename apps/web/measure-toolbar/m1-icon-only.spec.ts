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
 * **After the falsification fired: is there a fix that costs nothing anywhere?**
 *
 * `m1-deck-load` killed the approved shape. Returning `zoom-to-selection` and `isolate-logic` to
 * the command deck takes it from two lines to three at 1646 — **58 px of canvas** — to save the
 * 36 px the foot row's wrap costs. A net loss of 22 px at the width this epic exists to serve, and
 * the eighth consecutive width expectation in this repository contradicted by its own measurement.
 *
 * So the two remaining shapes are measured here rather than argued:
 *
 * - **Icon-only on the OBJECT BAR.** Keep both commands where they are and drop their labels.
 *   ADR-0090 and ADR-0110 both spent milestones winning labels back, so this is a real cost — but
 *   it is paid on two controls rather than on every command at 1646.
 * - **Icon-only on the DECK.** Move them, but unlabelled, so the deck's `find` card grows by ~72 px
 *   rather than ~239 px against 275 px of line-1 slack at 1646.
 *
 * `ICON_ONLY` already exists in `Deck.tsx` as a closed set for exactly this trade, and the object
 * bar's own docblock argues the opposite for its surface — *"a compact bar of a handful of commands
 * where the name IS the affordance"*. Both are reasonable; only one of them is affordable, and
 * which is a measurement.
 *
 * Simulated by hiding the label spans of the real controls. Not how it would be built — the budget,
 * not the implementation (ADR-0081 §3).
 */
const OBJECT_BAR_VARIANTS: ReadonlyArray<{
  name: string;
  hide: readonly string[];
  iconOnly: readonly string[];
}> = [
  { name: 'today', hide: [], iconOnly: [] },
  {
    name: 'E: omit clear-visual + icon-only zoom & isolate (stay on the bar)',
    hide: ['clear-visual-placement'],
    iconOnly: ['zoom-to-selection', 'isolate-logic'],
  },
  {
    name: 'F: omit clear-visual + icon-only zoom only',
    hide: ['clear-visual-placement'],
    iconOnly: ['zoom-to-selection'],
  },
  {
    name: 'G: icon-only zoom & isolate, keep clear-visual',
    hide: [],
    iconOnly: ['zoom-to-selection', 'isolate-logic'],
  },
];

test('M1 alternatives: icon-only, on the bar and on the deck', async ({ page }) => {
  clearMeasurement('m1-icon-only');
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

  const applyBar = (v: { hide: readonly string[]; iconOnly: readonly string[] }) =>
    page.evaluate(
      ({ hide, iconOnly }: { hide: readonly string[]; iconOnly: readonly string[] }) => {
        const foot = document.querySelector('[data-activities-bar]');
        const dock = foot?.children[1];
        if (!dock) return;
        for (const el of dock.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
          el.style.removeProperty('display');
          for (const s of el.querySelectorAll<HTMLElement>('span'))
            s.style.removeProperty('display');
        }
        for (const id of hide) {
          const el = dock.querySelector<HTMLElement>(`[data-toolbar-item="${id}"]`);
          if (el) el.style.display = 'none';
        }
        for (const id of iconOnly) {
          const el = dock.querySelector<HTMLElement>(`[data-toolbar-item="${id}"]`);
          if (!el) continue;
          for (const s of el.querySelectorAll<HTMLElement>('span')) {
            if (s.className.toString().includes('sr-only')) continue;
            if ((s.textContent ?? '').trim() && s.querySelector('svg') === null)
              s.style.display = 'none';
          }
        }
      },
      v,
    );

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
          variant: label,
          width: w,
          footH: foot ? r(foot.getBoundingClientRect().height) : null,
          canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
          items: shown.length,
          itemsW: r(shown.reduce((s, e) => s + e.getBoundingClientRect().width, 0)),
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
    for (const v of OBJECT_BAR_VARIANTS) {
      await applyBar(v);
      await page.waitForTimeout(320);
      results.push(await read(v.name, width));
    }
    await applyBar({ hide: [], iconOnly: [] });
  }

  writeMeasurement('m1-icon-only', results);
  expect(results.length).toBe(OBJECT_BAR_VARIANTS.length * 3);
});
