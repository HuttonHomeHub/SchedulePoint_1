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
 * **M0-T1/T3/T4 — the repaired instrument.**
 *
 * `m0-header-and-treatment.spec.ts` was written this morning and three of its readings are
 * artefacts. It is superseded rather than edited, because its wrong numbers were reported to the
 * product owner and a file that quietly starts disagreeing with them is worse than one openly
 * replaced.
 *
 * What was wrong, each verified against the code before this was written:
 *
 * 1. **The deck-height probe measured the wrong element.** It derived the deck from
 *    `document.querySelector('[data-toolbar-item]')` — the FIRST in document order, which is
 *    `mode-early` in the **mode** toolbar on the identity row. So it converted twelve stacked deck
 *    items and then measured a row containing none of them, and reported `36 → 36`. That number was
 *    given to the product owner as evidence that inlining buys no height; it is evidence of
 *    nothing. Here the deck is located by `[role="toolbar"][aria-label="Plan commands"]` and its
 *    absence **throws** — TECH_DEBT #185 records two harnesses disagreeing about when the deck
 *    exists, and a probe that silently returns null on a real screen is how that went unresolved.
 *
 * 2. **The baseline count read hidden spans.** It took the last leaf `<span>` with text, and
 *    `ToolbarButton` renders `sr-only` `disabledReason` and `srDescription` spans **after** the
 *    label (`ToolbarButton.tsx:134-144`). Every pen-gated or described item reported the position of
 *    something nobody can see. The visible label is now selected by excluding `sr-only` and
 *    zero-width rects; the described ids are reported so the contamination is visible in the output
 *    itself; and the count is grouped **per visual row**, because the complaint is about one row and
 *    a global count answers a question nobody asked.
 *
 * 3. **The status bar was located by its copy** (`/Data date/`) — the anti-pattern
 *    `activity-bottom-panel.tsx:165-172` records having bitten three times, committed in that
 *    file's own neighbour on the same day it was read.
 *
 * `aboveCanvas` comes from the canvas's own `getBoundingClientRect().top`, never by summing bands:
 * ADR-0091's retrospective records a band-summing harness losing a whole band to a `.filter()` and
 * reporting a plausible number for the whole of a milestone.
 *
 * **The geometry probe prices the geometry, not the implementation.** It overrides styles in both
 * directions. It cannot answer where a split button's caret goes once stacked, which is a real
 * design question M1 has to settle; it can only say what the two shapes cost.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
];

const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

/** Injected into the page. One definition, shared by both probes, so they cannot drift. */
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
    if (!d) throw new Error('m0-repaired: no deck — [aria-label="Plan commands"] is absent');
    return d;
  };
`;

async function readGeometry(page: Page): Promise<unknown> {
  return page.evaluate(`(() => {
    ${HELPERS}
    const deck = deckOf();
    const items = [...deck.querySelectorAll('[data-toolbar-item]')];
    if (items.length === 0) throw new Error('m0-repaired: deck has no items');

    // Visual rows, by each item's own top edge. Same row if tops agree within 4 px — a tolerance,
    // because a taller card in the same flex line sits a pixel or two off its neighbours.
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
        distinctLabelTops: tops.length,
        labelTops: tops,
        spreadPx: tops.length > 1 ? tops[tops.length - 1] - tops[0] : 0,
        controlHeights: [...new Set(r.items.map((el) => round(el.getBoundingClientRect().height)))].sort((a, b) => a - b),
      };
    });

    return {
      deckHeight: round(deck.getBoundingClientRect().height),
      itemCount: items.length,
      wrapLines: rows.length,
      totalItemWidth: round(items.reduce((s, el) => s + el.getBoundingClientRect().width, 0)),
      stacked: items.filter((el) => getComputedStyle(el).flexDirection === 'column').length,
      inline: items.filter((el) => getComputedStyle(el).flexDirection !== 'column').length,
      distinctControlHeights: [...new Set(items.map((el) => round(el.getBoundingClientRect().height)))].sort((a, b) => a - b),
      worstRowSpread: perRow.reduce((m, r) => Math.max(m, r.spreadPx), 0),
      perRow,
      // Named, so the contamination the old probe hid is visible in the output rather than only in
      // this docblock.
      described: items
        .filter((el) => el.hasAttribute('aria-describedby'))
        .map((el) => el.getAttribute('data-toolbar-item')),
    };
  })()`);
}

test('M0 repaired: baselines per row, deck height in both geometries, bands by hook', async ({
  page,
}) => {
  clearMeasurement('m0-repaired');
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
  // `recalculate` reloads, which drops the pen. Take it back: the deck is pen-gated, so a probe run
  // with the pen free measures a different set of enabled controls — and the old run did exactly
  // that without noticing.
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const report: Record<string, unknown> = { planName: PLAN_NAME, penHeld: true };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    const bands = await page.evaluate(`(() => {
      ${HELPERS}
      const canvas = document.querySelector('canvas');
      const bar = document.querySelector('[data-activities-bar]')
        ?? document.querySelector('[aria-label="Activities panel"]')?.firstElementChild
        ?? null;
      // data-schedule-state is the status bar's own root attribute (plan-status-bar.tsx:195), not
      // copy. There is no data-plan-status-bar: the first draft of this probe invented one, which
      // would have reported a null and a false "no such band" for the whole run.
      // No backticks in here — this comment lives inside a template literal.
      const status = document.querySelector('[data-schedule-state]');
      const box = (el) => (el ? { w: round(el.getBoundingClientRect().width), h: round(el.getBoundingClientRect().height) } : null);
      return {
        // From the canvas's OWN top edge, never by summing bands.
        aboveCanvas: canvas ? round(canvas.getBoundingClientRect().top) : null,
        canvasHeight: box(canvas) ? box(canvas).h : null,
        activitiesBar: box(bar),
        statusBar: box(status),
        statusBarLocatedByHook: status !== null,
      };
    })()`);

    const stackedGeometry = await readGeometry(page);

    // ── Probe the OTHER geometry: inline every stacked deck item, re-read, then put it back.
    await page.evaluate(`(() => {
      ${HELPERS}
      const deck = deckOf();
      for (const el of deck.querySelectorAll('[data-toolbar-item]')) {
        if (getComputedStyle(el).flexDirection !== 'column') continue;
        el.setAttribute('data-probe-converted', '');
        el.style.setProperty('flex-direction', 'row', 'important');
        el.style.setProperty('height', '2.25rem', 'important');
        el.style.setProperty('gap', '0.375rem', 'important');
        el.style.setProperty('align-items', 'center', 'important');
      }
      void document.body.offsetHeight;
    })()`);
    await page.waitForTimeout(250);
    const inlineGeometry = await readGeometry(page);
    await page.evaluate(`(() => {
      for (const el of document.querySelectorAll('[data-probe-converted]')) {
        el.removeAttribute('style');
        el.removeAttribute('data-probe-converted');
      }
      void document.body.offsetHeight;
    })()`);
    await page.waitForTimeout(250);

    // ── The THIRD geometry: keep stacking, unify the control height. The analyst's reading is
    // that `items-stretch` over three control heights (32/36/40) is what places the same label
    // differently, and that one height is the fix the other two causes depend on. Untested until
    // now, and it is the option that fixes the complaint WITHOUT reversing mockup decision 1.
    await page.evaluate(`(() => {
      ${HELPERS}
      const deck = deckOf();
      for (const el of deck.querySelectorAll('[data-toolbar-item]')) {
        el.setAttribute('data-probe-converted', '');
        el.style.setProperty('height', '2.5rem', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
      }
      void document.body.offsetHeight;
    })()`);
    await page.waitForTimeout(250);
    const unifiedHeightGeometry = await readGeometry(page);
    await page.evaluate(`(() => {
      for (const el of document.querySelectorAll('[data-probe-converted]')) {
        el.removeAttribute('style');
        el.removeAttribute('data-probe-converted');
      }
      void document.body.offsetHeight;
    })()`);
    await page.waitForTimeout(250);

    // ── The FOURTH geometry, and the one CQ-1 is really about: stack EVERYTHING. The complaint is
    // caused by the mix — at 1646 inline items put their label at 137, captions at 140, and stacked
    // buttons 12 px lower at 149 — so only picking ONE treatment fixes it. Inlining everything was
    // probed above and reverses mockup decision 1; this is the direction that keeps it.
    //
    // It prices the geometry and NOT the implementation: a split button's caret has to go
    // somewhere once its trigger stacks, and a style override cannot answer that. M1 must.
    await page.evaluate(`(() => {
      ${HELPERS}
      const deck = deckOf();
      for (const el of deck.querySelectorAll('[data-toolbar-item]')) {
        if (getComputedStyle(el).flexDirection === 'column') continue;
        el.setAttribute('data-probe-converted', '');
        el.style.setProperty('flex-direction', 'column', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('gap', '0.125rem', 'important');
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('line-height', '1', 'important');
      }
      void document.body.offsetHeight;
    })()`);
    await page.waitForTimeout(250);
    const stackAllGeometry = await readGeometry(page);
    await page.evaluate(`(() => {
      for (const el of document.querySelectorAll('[data-probe-converted]')) {
        el.removeAttribute('style');
        el.removeAttribute('data-probe-converted');
      }
      void document.body.offsetHeight;
    })()`);
    await page.waitForTimeout(250);

    report[`${viewport.width}`] = {
      bands,
      stackedGeometry,
      inlineGeometry,
      unifiedHeightGeometry,
      stackAllGeometry,
    };
  }

  const path = writeMeasurement('m0-repaired', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
