import { expect, test, type Page } from '@playwright/test';

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
 * **The fourth hypothesis for `docs/TECH_DEBT.md` #187, which that row names and nobody ran.**
 *
 * #187 records three hypotheses for the deck's 3 px label spread — control height, type scale, one
 * outlier control — each built, each measured, each falsified. It then names the next one and says
 * why it was skipped: _"the icons. Deck items carry `size-3`/`size-4` icons and some carry none; in
 * an `items-center` flex line the tallest child sets the line box, so two items with different icon
 * heights centre their text differently even at identical control height. The probe would be to
 * null every icon and re-measure — which is cheap and was not done."_ This is that probe.
 *
 * **It is a harness and asserts nothing about the product** (ADR-0081 §3). The one thing it does
 * assert is about itself: that the deck was found and that the control read produced more than one
 * distinct label top on at least one row. Without that, a treatment reading zero spread is
 * indistinguishable from a run where the spread was never there — which is the ADR-0093 shape, and
 * the reason this file has a `nonVacuous` field rather than a comment claiming it is fine.
 *
 * **Control first, then treatment, on the same page and the same layout.** The two reads differ by
 * one mutation and nothing else. Re-measuring after a reload would let the plan, the pen or the wrap
 * arrangement differ between the halves, and a 3 px question cannot survive that.
 *
 * **What nulling an icon does, stated because it decides how to read the output.** `display: none`
 * removes the icon from the flex line entirely, so the line box is then set by the label alone. If
 * the icons are the cause, every label top on a row converges. If the spread survives, the
 * hypothesis is falsified and the cause is something the label itself carries — which the per-item
 * diagnostic below is for: it reports each item's icon box beside its own label top, so a reader can
 * see whether the items that sit 3 px apart are the ones whose icons differ, even in a run where the
 * null test is ambiguous.
 *
 * The geometry, the row grouping and the visible-label selection are lifted from
 * `m0-repaired.spec.ts` **verbatim** rather than re-derived. That file records two probes disagreeing
 * about when the deck exists and a label read that counted `sr-only` spans; a second opinion about
 * which span is the label is how this run would come to disagree with the numbers it is compared to.
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
];

const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

/** Lifted verbatim from `m0-repaired.spec.ts`. One definition of "the label", or the runs drift. */
const HELPERS = `
  const round = (n) => Math.round(n);
  const isHidden = (el) =>
    el.classList.contains('sr-only') || el.getBoundingClientRect().width <= 1;
  const labelOf = (el) => {
    const spans = [...el.querySelectorAll('span')].filter(
      (s) => s.children.length === 0 && (s.textContent ?? '').trim() !== '' && !isHidden(s),
    );
    return spans.length ? spans[spans.length - 1] : null;
  };
  const deckOf = () => {
    const d = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
    if (!d) throw new Error('m7-icons: no deck — [aria-label="Plan commands"] is absent');
    return d;
  };
  const readRows = () => {
    const deck = deckOf();
    const items = [...deck.querySelectorAll('[data-toolbar-item]')];
    if (items.length === 0) throw new Error('m7-icons: deck has no items');
    const rows = [];
    for (const el of items) {
      const top = round(el.getBoundingClientRect().top);
      const row = rows.find((r) => Math.abs(r.top - top) <= 4);
      if (row) row.items.push(el);
      else rows.push({ top, items: [el] });
    }
    rows.sort((a, b) => a.top - b.top);
    const perRow = rows.map((r) => {
      const tops = [...new Set(r.items.map((el) => {
        const l = labelOf(el);
        return l ? round(l.getBoundingClientRect().top) : null;
      }).filter((t) => t !== null))].sort((a, b) => a - b);
      return {
        rowTop: r.top,
        items: r.items.length,
        labelTops: tops,
        spreadPx: tops.length > 1 ? tops[tops.length - 1] - tops[0] : 0,
      };
    });
    return {
      wrapLines: rows.length,
      deckHeight: round(deck.getBoundingClientRect().height),
      worstRowSpread: perRow.reduce((m, r) => Math.max(m, r.spreadPx), 0),
      perRow,
    };
  };
`;

/** Per item: its own label top beside its own icon box. The diagnostic, not the verdict. */
async function readItems(page: Page): Promise<unknown> {
  return page.evaluate(`(() => {
    ${HELPERS}
    const deck = deckOf();
    return [...deck.querySelectorAll('[data-toolbar-item]')].map((el) => {
      const l = labelOf(el);
      const icons = [...el.querySelectorAll('svg')]
        .filter((s) => s.getBoundingClientRect().height > 0)
        .map((s) => round(s.getBoundingClientRect().height));
      return {
        id: el.getAttribute('data-toolbar-item'),
        labelTop: l ? round(l.getBoundingClientRect().top) : null,
        itemTop: round(el.getBoundingClientRect().top),
        itemHeight: round(el.getBoundingClientRect().height),
        iconHeights: icons,
      };
    });
  })()`);
}

test('M7: does nulling every deck icon close the 3 px label spread?', async ({ page }) => {
  clearMeasurement('m7-icon-hypothesis');
  test.setTimeout(300_000);

  await page.setViewportSize(VIEWPORTS[0]!);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, PLAN_NAME);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    { name: 'Blind and reinforce', laneIndex: 2, durationDays: 16 },
  ]);
  await recalculate(page, orgSlug);
  // `recalculate` reloads and the reload drops the pen. The deck is pen-gated, so a run with the pen
  // free measures a different set of enabled controls — `m0-repaired` records that exact mistake.
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const report: Record<string, unknown> = { planName: PLAN_NAME, penHeld: true, byViewport: {} };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    const control = await page.evaluate(`(() => { ${HELPERS} return readRows(); })()`);
    const controlItems = await readItems(page);

    // ── The mutation, and the only one: every painted icon inside a deck item leaves the flex line.
    const nulled = await page.evaluate(`(() => {
      ${HELPERS}
      const deck = deckOf();
      let n = 0;
      for (const el of deck.querySelectorAll('[data-toolbar-item]')) {
        for (const svg of el.querySelectorAll('svg')) {
          svg.setAttribute('data-probe-nulled', '');
          svg.style.setProperty('display', 'none', 'important');
          n += 1;
        }
      }
      void document.body.offsetHeight;
      return n;
    })()`);

    const treatment = await page.evaluate(`(() => { ${HELPERS} return readRows(); })()`);
    const treatmentItems = await readItems(page);

    // Put it back, so the next viewport's control is a control and not the previous treatment.
    await page.evaluate(`(() => {
      for (const svg of document.querySelectorAll('svg[data-probe-nulled]')) {
        svg.style.removeProperty('display');
        svg.removeAttribute('data-probe-nulled');
      }
      void document.body.offsetHeight;
    })()`);

    const c = control as { worstRowSpread: number; wrapLines: number };
    const t = treatment as { worstRowSpread: number; wrapLines: number };

    (report.byViewport as Record<string, unknown>)[`${viewport.width}`] = {
      iconsNulled: nulled,
      control,
      treatment,
      // **The non-vacuity check, first.** A treatment spread of 0 means nothing if the control was
      // already 0 — the run would be reporting that a defect it never reproduced is absent.
      nonVacuous: c.worstRowSpread > 0,
      // **Stated, because it changes how the verdict reads.** Removing the icons narrows every item,
      // so the row can re-wrap; if it does, the two halves are not measuring the same arrangement
      // and the spread comparison is between different rows.
      wrapChanged: c.wrapLines !== t.wrapLines,
      verdict:
        c.worstRowSpread === 0
          ? 'VACUOUS — the control shows no spread to close'
          : t.worstRowSpread === 0
            ? 'ICONS ARE THE CAUSE — spread closes when they leave the line'
            : t.worstRowSpread < c.worstRowSpread
              ? 'PARTIAL — the icons contribute, something else remains'
              : 'FALSIFIED — the spread survives without any icon in the line',
      controlItems,
      treatmentItems,
    };
  }

  // ── The POSITIVE CONTROL, and it is the only thing that can rescue a vacuous run.
  //
  // Every read above found a spread of zero, so the null test could not test anything: there was no
  // spread for removing the icons to close. That is a real answer about the product and no answer at
  // all about the mechanism — and a run that reports "the defect is absent" while being structurally
  // incapable of detecting its cause is exactly the shape this repository keeps recording (a green
  // suite that cannot tell "the rule holds" from "the population was empty").
  //
  // So: shrink ONE item's icon to 12 px — the `size-3` the row names — and see whether a spread
  // appears. If it does, the mechanism is demonstrated on today's code and #187's fourth hypothesis
  // is CONFIRMED rather than merely unreproducible. If it does not, the hypothesis is falsified like
  // the other three and the cause of the original 3 px is still unknown.
  await page.setViewportSize(VIEWPORTS[1]!);
  await page.waitForTimeout(600);
  const positive = await page.evaluate(`(() => {
    ${HELPERS}
    const before = readRows();
    const deck = deckOf();
    // The first labelled item that paints an icon. Named in the output, so the run says which item
    // it perturbed rather than leaving the reader to guess which "one item" meant.
    let target = null;
    for (const el of deck.querySelectorAll('[data-toolbar-item]')) {
      const svg = el.querySelector('svg');
      if (!svg || !labelOf(el)) continue;
      if (svg.getBoundingClientRect().height <= 0) continue;
      target = el;
      break;
    }
    if (!target) throw new Error('m7-icons: no labelled item with a painted icon to perturb');
    for (const svg of target.querySelectorAll('svg')) {
      svg.style.setProperty('height', '12px', 'important');
      svg.style.setProperty('width', '12px', 'important');
    }
    void document.body.offsetHeight;
    const after = readRows();
    return {
      targetId: target.getAttribute('data-toolbar-item'),
      shrunkToPx: 12,
      before,
      after,
      appeared: after.worstRowSpread > before.worstRowSpread,
      verdict:
        after.worstRowSpread > before.worstRowSpread
          ? 'MECHANISM CONFIRMED — a shorter icon on one item moves that item’s label'
          : 'MECHANISM FALSIFIED — icon height does not move the label on today’s deck',
    };
  })()`);
  report.positiveControl = positive;

  writeMeasurement('m7-icon-hypothesis', report);
});
