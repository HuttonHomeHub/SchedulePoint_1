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
/**
 * **1440's expectation changed from 117 to 41 during the epic, and that is not a moved goalpost.**
 *
 * M1 fixed 1920 and 1646 and could not reach 1440: seven controls still exceeded the 569.6 px
 * available, so this case asserted the row stayed at **117 px** — deliberately, because a milestone
 * claiming to fix "the wrap" while leaving a width broken would be claiming more than its own
 * measurement supported.
 *
 * M4 then bounded the plan's facts at `max-w-64`, handing 231 px back to the dock, and 1440 came
 * to one line as a **consequence rather than a target**: 117 → 41 px, canvas 484 → 560. The
 * assertion is updated to the new truth rather than relaxed — it is still an equality, and it would
 * still fail if either milestone regressed.
 */
const CASES = [
  { width: 1920, height: 1080, expectFoot: 41, note: 'was already one line' },
  { width: 1646, height: 1097, expectFoot: 41, note: 'M1 — was 77' },
  // **1440 wraps again, and that is a decision rather than a regression.** M1 reached one line at
  // every width by making `Zoom to selection` icon-only. M4 then widened the dock by 231 px, which
  // made the label affordable at 1920 and 1646 — and the product owner chose the label over 36 px
  // of canvas at a width neither of their machines uses. The equality is kept where it holds and
  // the number is stated where it does not, rather than the case being deleted or loosened to a
  // bound that would stop discriminating (the `dock.spec.ts` lesson, one file over).
  { width: 1440, height: 900, expectFoot: 77, note: 'labelled — 41 at rest, 77 with a selection' },
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
      // **Located by what it contains, never by index.** This read was `foot.children[1]`, which
      // encoded the facts-then-dock order — and M3 swapped them, so the gate went red reporting an
      // empty object bar against a perfectly correct one. An index is a layout assumption wearing a
      // selector's clothes, which is the standing rule after ADR-0091 one level along.
      const dock = [...(foot?.children ?? [])].find((c) => c.querySelector('[data-toolbar-item]'));
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

/**
 * **M2's falsification condition** (foot-row-and-deck): the foot row joins the `chrome` surface
 * scope, and *"if the row is not 41 px at rest at all three widths, M2 is withdrawn"*.
 *
 * The whole argument for answering the product owner's "same colour as the others" with a **scope**
 * rather than a card is that a scope costs no geometry: `Surface` contributes
 * `bg-background text-foreground` and `data-surface` and nothing else. If that were wrong the row
 * would grow, and the diagram would pay for a colour change — which is the trade this epic exists
 * to refuse.
 *
 * Asserting the scope as well as the height matters: the height alone passes equally against a
 * change that never applied, and ADR-0102's finding was precisely that a surface can go unreached
 * for a long time with nothing reporting it.
 */
test('M2: the chrome scope reaches the foot row and costs it no height', async ({ page }) => {
  clearMeasurement('m2-result');
  test.setTimeout(600_000);

  await page.setViewportSize({ width: 1920, height: 1080 });
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 12 }]);
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

    const read = await page.evaluate(() => {
      const r = (n: number): number => Math.round(n * 10) / 10;
      const foot = document.querySelector('[data-activities-bar]');
      const band = document.querySelector('[data-surface="chrome"]');
      if (!foot) throw new Error('foot row not found');
      const cs = getComputedStyle(foot);
      return {
        footH: r(foot.getBoundingClientRect().height),
        scope: foot.closest('[data-surface]')?.getAttribute('data-surface') ?? '(page)',
        background: cs.backgroundColor,
        color: cs.color,
        borderTop: `${cs.borderTopWidth} ${cs.borderTopColor}`,
        // The band's own background, so "matches the others" is a comparison rather than a claim.
        bandBackground: band ? getComputedStyle(band).backgroundColor : null,
        selected: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
      };
    });
    results.push({ width: c.width, ...read });

    expect(read.selected, `${c.width}: at rest, nothing selected`).toBe(0);
    expect(read.footH, `${c.width}: the row keeps its height`).toBe(41);
    expect(read.scope, `${c.width}: the row is on the chrome scope`).toBe('chrome');
    expect(read.background, `${c.width}: it paints the band's ground`).toBe(read.bandBackground);
  }

  writeMeasurement('m2-result', results);
});

/**
 * **M3 and M4, measured** — the swap, and whether the two-line facts actually wrap.
 *
 * M4 is the one at risk of being a no-op, and the risk is worth stating before the numbers: the
 * facts row is `shrink-0` with `basis: auto`, so `flex-wrap` only ever *permits* wrapping. If
 * nothing constrains the row it takes its natural width and stays on one line, and the change is a
 * class nobody can see. The product owner asked for two lines; the honest question is whether they
 * get them, and at which widths.
 */
test('M3/M4: the order swapped, and where the facts actually wrap', async ({ page }) => {
  clearMeasurement('m3m4-result');
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

  const read = (state: string, width: number) =>
    page.evaluate(
      ({ label, w }: { label: string; w: number }) => {
        const r = (n: number): number => Math.round(n * 10) / 10;
        const foot = document.querySelector('[data-activities-bar]');
        const cv = document.querySelector('canvas');
        if (!foot) throw new Error('foot row not found');
        const kids = [...foot.children].map((c) => {
          const b = c.getBoundingClientRect();
          return {
            x: r(b.x),
            w: r(b.width),
            text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28),
          };
        });
        const factsRow = document.querySelector('[data-schedule-state]');
        return {
          state: label,
          width: w,
          footH: r(foot.getBoundingClientRect().height),
          canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
          // Leading child first: the swap is visible as which region owns the smaller x.
          order: kids.map((k) => k.text.slice(0, 18)),
          factsRowH: factsRow ? r(factsRow.getBoundingClientRect().height) : null,
          factsRowW: factsRow ? r(factsRow.getBoundingClientRect().width) : null,
          selected: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
        };
      },
      { label: state, w: width },
    );

  const results: Array<Record<string, unknown>> = [];
  for (const c of CASES) {
    await page.setViewportSize({ width: c.width, height: c.height });
    await page.reload();
    await page.waitForTimeout(1400);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(500);
    results.push(await read('rest', c.width));
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    results.push(await read('selected', c.width));
  }

  writeMeasurement('m3m4-result', results);
});
