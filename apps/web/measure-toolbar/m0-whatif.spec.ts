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
 * **The what-if half of M0** (`docs/specs/workspace-foot-and-deck/`).
 *
 * `m0-foot-deck-menus.spec.ts` measured the foot row as it is and turned up something nobody had
 * reported: selecting a single activity makes the row **wrap**, costing the diagram 36 px at 1646
 * and 76 px at 1440. It also measured the plan's facts at 481.4 px across eight leaves of
 * 12 px/16 px — and the row's height floor is the 40 px collapse button, not the facts.
 *
 * That makes the product owner's Q3 ("could the activities be two lines keeping the same height of
 * the toolbar still?") testable rather than arguable, and possibly the cure for the wrap: two lines
 * of 16 px line-height is 32 px, still under the button's 40 px, so the row should not grow — while
 * the facts' width roughly halves and hands the difference to the dock.
 *
 * **This probe does not reason about that. It constrains the real facts element in the real
 * browser and reads what happens**, because the last six epics on this surface each had a width
 * expectation contradicted by their own measurement, and a seventh arithmetic argument is worth
 * nothing here.
 *
 * A what-if is not a proposal: forcing `max-width` on a node is not how the change would be built.
 * It establishes the BUDGET — whether the height floor holds and whether the freed width closes the
 * dock's shortfall — so a design can be costed before it is written. Stated here rather than left
 * implicit, per ADR-0081 §3.
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 900 },
];

test('M0 what-if: two-line facts, and what the diagram gets back', async ({ page }) => {
  clearMeasurement('m0-whatif');
  test.setTimeout(600_000);

  await page.setViewportSize(VIEWPORTS[0]!);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    { name: 'Blind and reinforce', laneIndex: 2, durationDays: 9 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const read = (tag: string): Promise<unknown> =>
    page.evaluate((label: string) => {
      const r = (n: number): number => Math.round(n * 10) / 10;
      const foot = document.querySelector('[data-activities-bar]');
      const band = document.querySelector('[data-surface="chrome"]');
      const cv = document.querySelector('canvas');
      if (!foot || !band) throw new Error('foot row or chrome band missing');
      const facts = foot.children[0] as HTMLElement | undefined;
      const dock = foot.children[1] as HTMLElement | undefined;
      const dockItems = dock ? [...dock.querySelectorAll('[data-toolbar-item]')] : [];
      const rowsOf = (els: Element[]): number =>
        new Set(els.map((e) => Math.round(e.getBoundingClientRect().y))).size;
      return {
        tag: label,
        footH: r(foot.getBoundingClientRect().height),
        bandH: r(band.getBoundingClientRect().height),
        canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
        factsW: facts ? r(facts.getBoundingClientRect().width) : null,
        factsH: facts ? r(facts.getBoundingClientRect().height) : null,
        // The inner row's own height is the number Q3 turns on. The wrapper can stay 24 px tall
        // while the row inside it overflows, which is exactly how the first run lied.
        factsRowH: (() => {
          if (!facts) return null;
          const cands = [facts, ...facts.querySelectorAll<HTMLElement>('*')].filter(
            (el) => getComputedStyle(el).display.includes('flex') && el.children.length > 1,
          );
          const row = cands.sort((a, b) => b.children.length - a.children.length)[0];
          return row ? r(row.getBoundingClientRect().height) : null;
        })(),
        dockW: dock ? r(dock.getBoundingClientRect().width) : null,
        dockItems: dockItems.length,
        dockItemsW: r(dockItems.reduce((s, e) => s + e.getBoundingClientRect().width, 0)),
        dockLines: dockItems.length ? rowsOf(dockItems) : 0,
        selected: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
      };
    }, tag);

  /**
   * Force the facts to wrap by capping the width of **the flex row that actually holds them**.
   *
   * **The first version capped `foot.children[0]` and proved nothing.** That node is an outer
   * wrapper (`flex shrink-0 items-center`); the facts themselves are a nested
   * `flex min-h-6 shrink-0 items-center gap-4 px-3 text-xs` row whose `Fact` spans are
   * `whitespace-nowrap`. Capping the parent while the child is `shrink-0` makes the child overflow,
   * not wrap — so `factsH` stayed 24 px in every "two-line" reading, which is the probe reporting
   * that it had not done the thing it was named for. Caught by reading the height column rather
   * than the width one.
   *
   * The row is located structurally — the descendant with the most element children — never by its
   * copy, which is the standing rule after ADR-0091 and which the sibling probe broke this week.
   */

  const capFacts = (px: number | null): Promise<void> =>
    page.evaluate((w: number | null) => {
      const foot = document.querySelector('[data-activities-bar]');
      const outer = foot?.children[0] as HTMLElement | undefined;
      if (!outer) return;
      const candidates = [outer, ...outer.querySelectorAll<HTMLElement>('*')].filter(
        (el) => getComputedStyle(el).display.includes('flex') && el.children.length > 1,
      );
      const row = candidates.sort((a, b) => b.children.length - a.children.length)[0] ?? outer;
      if (w === null) {
        row.style.removeProperty('max-width');
        row.style.removeProperty('flex-wrap');
        row.style.removeProperty('flex-shrink');
      } else {
        row.style.maxWidth = `${w}px`;
        row.style.flexWrap = 'wrap';
        row.style.flexShrink = '1';
      }
    }, px);

  const results: Array<Record<string, unknown>> = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize(vp);
    // **A reload, because Escape did not clear the selection between viewports.** The first two
    // runs reported `sel: 1` and a ten-item dock in every row labelled "rest" after the first
    // viewport, so the at-rest baseline at 1646 and 1440 was silently a selected one. Escape's
    // selection rung is the last of ADR-0080's ladder and wants the diagram focused; focusing the
    // listbox and pressing it was not enough, and rather than keep guessing at the gesture the
    // probe now removes the state it is trying not to have.
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(600);

    const restOneLine = await read('rest / facts 1 line');
    await capFacts(250);
    await page.waitForTimeout(250);
    const restTwoLine = await read('rest / facts capped 250');
    await capFacts(null);
    await page.waitForTimeout(200);

    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);

    const selOneLine = await read('selected / facts 1 line');
    await capFacts(250);
    await page.waitForTimeout(300);
    const selTwoLine = await read('selected / facts capped 250');
    await capFacts(180);
    await page.waitForTimeout(300);
    const selThree = await read('selected / facts capped 180');
    await capFacts(null);

    // **The selection survived the first run's Escape**, so every later "rest" reading was
    // actually a selected one (visible as `sel: 1` beside `dockItems: 10` in a row labelled
    // "rest"). Escape's selection rung needs the diagram focused (ADR-0080), and focus had moved.
    await diagramList(page).focus();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    results.push({ viewport: vp, restOneLine, restTwoLine, selOneLine, selTwoLine, selThree });
  }

  writeMeasurement('m0-whatif', results);
  expect(results).toHaveLength(VIEWPORTS.length);
});
