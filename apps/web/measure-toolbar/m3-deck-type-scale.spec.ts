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
 * **What does one type scale on the command deck cost in lines?**
 *
 * `Deck.tsx` overrides a plain command's label to `text-micro` — but only on the `ToolbarButton`
 * branch. Every `render` item (each `▾` trigger) bypasses it and keeps `toolbarControlVariants`'
 * `text-sm`, so `Go to today` paints at 10 px beside `View ▾` at 14 px on the same row. That is the
 * ADR-0110 D2 shape — one `if` with a side effect on presentation — and it was left knowingly, with
 * the comment saying that changing the type scale too "would make the shipped width unattributable
 * to the number that justified the change". The geometry change has since shipped and been
 * measured, so that reason has lapsed.
 *
 * **Unifying means labels get BIGGER**, and the deck wraps rather than hides (ADR-0109 D1), so the
 * risk is lines rather than lost commands. This is the third epic running on this surface whose
 * width expectation was contradicted by measuring it, so the number comes before the edit.
 *
 * **The falsification condition, written before the run** (`docs/specs/object-bar-defects/` D3):
 * if the deck gains a visual line at 1920 or at 1646, the change is WITHDRAWN and re-opened as a
 * type-ramp decision. It is not shipped as a tidy-up that costs a band of canvas.
 *
 * Run it twice — once on the current code, once with the override deleted — and compare
 * `lines` and `labelSizes`. Asserts nothing beyond reaching the screen; it is a harness
 * (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
];

/** A real plan name, because the identity block's width is the deck's neighbour. */
const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

test('M3: the deck type scale, in lines', async ({ page }) => {
  clearMeasurement('m3-deck-type-scale');
  test.setTimeout(300_000);

  await page.setViewportSize(VIEWPORTS[0]!);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, PLAN_NAME);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const report: Record<string, unknown> = { planName: PLAN_NAME };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    report[`${viewport.width}`] = await page.evaluate(() => {
      const round = (n: number): number => Math.round(n);

      const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      if (!deck) throw new Error('the command deck was not found — the probe has no subject');

      const cards = [...deck.querySelectorAll(':scope > [role="group"]')];

      /**
       * **Lines are counted from distinct card tops, not from a height ÷ row-height guess.**
       * A wrapping flex container puts every item on a line at the same `top`, so the number of
       * distinct tops IS the number of lines — and it stays right if a card's own height changes,
       * which a division would not.
       */
      const tops = [...new Set(cards.map((c) => round(c.getBoundingClientRect().top)))].sort(
        (a, b) => a - b,
      );

      /**
       * Every label's computed size, keyed by the control it belongs to.
       *
       * The label is the last text-bearing span, which is how `Deck` addresses it
       * (`[&>span:last-of-type]`). Reading the COMPUTED value rather than the class is the point:
       * the defect is that two branches resolve to two different numbers, and a class list cannot
       * say that.
       */
      const labelSizes: {
        item: string;
        text: string;
        px: string;
        disabled: boolean;
        hasSrSpan: boolean;
      }[] = [];
      for (const el of deck.querySelectorAll('[data-toolbar-item]')) {
        const spans = [...el.querySelectorAll('span')].filter(
          (s) => (s.textContent ?? '').trim() !== '' && !s.className.includes('sr-only'),
        );
        const label = spans[spans.length - 1];
        if (!label) continue;
        /**
         * **`hasSrSpan` is the second cause, and the reason this probe was widened mid-run.**
         *
         * The first pass recorded a `render` flag meant to separate the two populations, and it
         * reported `false` for every item — `data-toolbar-item` sits on the focusable control, and
         * a split button's primary half is a `<button>` too, so the test could not tell them apart.
         * It is dropped rather than fixed, because the numbers it was meant to explain turned out
         * to have a different explanation.
         *
         * `Deck`'s override targets `> span:last-of-type`. `ToolbarButton` renders icon → label →
         * `sr-only` reason → `sr-only` description, so the moment a control carries a reason or an
         * `srDescription` the override lands on an **invisible** span and the visible label falls
         * through to `text-sm`. That makes a label's SIZE a function of whether it is shaded.
         */
        const srSpans = [...el.querySelectorAll(':scope > span')].filter((sp) =>
          sp.className.includes('sr-only'),
        );
        labelSizes.push({
          item: el.getAttribute('data-toolbar-item') ?? '?',
          text: (label.textContent ?? '').trim().slice(0, 24),
          px: getComputedStyle(label).fontSize,
          disabled: el.getAttribute('aria-disabled') === 'true',
          hasSrSpan: srSpans.length > 0,
        });
      }

      const distinct = [...new Set(labelSizes.map((l) => l.px))].sort();

      return {
        viewportWidth: window.innerWidth,
        deckWidth: round(deck.getBoundingClientRect().width),
        deckHeight: round(deck.getBoundingClientRect().height),
        lines: tops.length,
        cardTops: tops,
        cards: cards.map((c) => ({
          caption: (c.querySelector('[data-toolbar-item^="caption:"]')?.textContent ?? '').trim(),
          width: round(c.getBoundingClientRect().width),
          top: round(c.getBoundingClientRect().top),
        })),
        // The headline: one entry means one scale. Two means the defect is live.
        distinctLabelSizes: distinct,
        labelSizes,
      };
    });
  }

  writeMeasurement('m3-deck-type-scale', report);
});
