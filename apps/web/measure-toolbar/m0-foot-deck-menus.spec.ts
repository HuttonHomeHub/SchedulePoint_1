import { expect, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
  diagramList,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **M0 for the five deferred plan-workspace observations** (`docs/specs/workspace-foot-and-deck/`).
 *
 * The product owner sent three screenshots of the plan workspace and eight observations. Three were
 * defects and shipped in `web-v0.108.2`. These are the other five, all of which are questions about
 * *layout* rather than reports of breakage — and this repository's record on answering those from a
 * drawing is bad: **six consecutive epics (ADR-0090 D3, ADR-0091 D4, ADR-0092 M5, ADR-0093,
 * ADR-0113, ADR-0114 M2) had their width expectation contradicted by their own measurement**, and
 * ADR-0090's first recorded consequence is that it was wrong three times for having been drafted
 * without a shell. So nothing is specified until it is counted.
 *
 * The five, in the product owner's words:
 *
 *  1. "Do you think the bottom toolbar should be the same colour etc as the others to tie them in?"
 *  2. "would the toolbar be better on the left and the activity summary on the right?"
 *  3. "could the activies be two lines keeping the same height of the toolbar still?"
 *  4. "Should the bottom tool bar always be visable but buttons grey out if not available"
 *  5. "if we have the sapce now maybe we should get some out of the drop downs espically at the
 *     bigger scale"
 *
 * **What this harness bypasses: nothing.** It drives the real sign-up → client → project → plan
 * journey against a real API with the pen enforced, and reads the real DOM. It asserts only that it
 * reached the screen; every number is reported, not gated (ADR-0081 §3).
 *
 * **Two things it deliberately does NOT measure, and why.**
 *
 * - It does not measure a *proposed* layout. Q1–Q4 are changes to a row this harness can only see
 *   in its current form. What it measures instead is the **budget** each proposal has to live
 *   inside — the row's real height, its real slack, the real computed treatment of the band it
 *   would be matched to — so a design is costed against facts rather than against an assumed
 *   6.6 px/character metric (the ADR-0090 failure).
 * - For Q5 it does not guess a promoted button's width. It **clones a real labelled control**,
 *   swaps its text, measures it in place, and removes it — so the number comes from the real CVA in
 *   the real typeface. `apps/web` has never declared a `@font-face` (ADR-0097), so a width computed
 *   off a nominal metric is a width in a font nobody is guaranteed to have.
 */
const VIEWPORTS = [
  { width: 1920, height: 1080, note: '24" monitor at 100%' },
  { width: 1646, height: 1097, note: 'Surface Pro 2880x1920 at 175% — the product owner’s screen' },
  { width: 1440, height: 900, note: 'the narrowest width the deck is expected to label' },
];

const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

/** Candidate labels for Q5, read off the registry rather than invented. Widths measured, not assumed. */
const PROMOTION_CANDIDATES = [
  'Zoom in',
  'Zoom out',
  'Fit to plan',
  'Go to today',
  'Legend',
  'Float paths',
  'Critical path',
  'Baseline',
  'Export image',
  'Export data',
  'Print programme',
  'Keyboard shortcuts',
];

test('M0: the foot row, the band treatment, the deck’s slack and the ▾ menus', async ({ page }) => {
  clearMeasurement('m0-foot-deck-menus');
  test.setTimeout(600_000);

  await page.setViewportSize({ width: VIEWPORTS[0]!.width, height: VIEWPORTS[0]!.height });
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, PLAN_NAME);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    { name: 'Blind and reinforce', laneIndex: 2, durationDays: 9 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  /* ---------------------------------------------------------------- the read */

  const readAll = (candidates: readonly string[]): Promise<unknown> =>
    page.evaluate((labels: readonly string[]) => {
      const r = (n: number): number => Math.round(n * 10) / 10;
      const box = (el: Element) => {
        const b = el.getBoundingClientRect();
        return { x: r(b.x), y: r(b.y), w: r(b.width), h: r(b.height) };
      };
      const treat = (el: Element) => {
        const s = getComputedStyle(el);
        return {
          background: s.backgroundColor,
          color: s.color,
          borderTop: `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderTopColor}`,
          borderBottom: `${s.borderBottomWidth} ${s.borderBottomStyle} ${s.borderBottomColor}`,
          radius: s.borderRadius,
          shadow: s.boxShadow === 'none' ? 'none' : s.boxShadow.slice(0, 60),
          font: `${s.fontSize}/${s.lineHeight}`,
          surface: el.closest('[data-surface]')?.getAttribute('data-surface') ?? '(page)',
        };
      };

      /* --- the two bands, for Q1 ----------------------------------------- */
      const bandEl = document.querySelector('[data-surface="chrome"]');
      if (!bandEl)
        throw new Error('no [data-surface="chrome"] — the chrome band could not be located');
      const footEl = document.querySelector('[data-activities-bar]');
      if (!footEl) throw new Error('no [data-activities-bar] — the foot row could not be located');

      /* --- the foot row’s own children, for Q2/Q3/Q4 ---------------------- */
      const footKids = [...footEl.children].map((c) => {
        const cs = getComputedStyle(c);
        return {
          tag: c.tagName,
          cls: c.className.toString().slice(0, 90),
          ...box(c),
          // Q2 is "swap the two sides", and whether that makes anything MOVE is a question about
          // flex sizing, not about order. ADR-0114 chose facts-leading on the stated ground that a
          // leading dock would slide the facts sideways whenever a selection appeared — a claim
          // that is only true if the dock's width depends on its content.
          flexGrow: cs.flexGrow,
          flexShrink: cs.flexShrink,
          flexBasis: cs.flexBasis,
          minWidth: cs.minWidth,
          text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 70),
        };
      });
      const footStyle = getComputedStyle(footEl);
      const footPadX =
        parseFloat(footStyle.paddingLeft || '0') + parseFloat(footStyle.paddingRight || '0');
      const footGap = parseFloat(footStyle.columnGap || footStyle.gap || '0');
      const footUsed = footKids.reduce((s, k) => s + k.w, 0);
      const footChrome = footPadX + footGap * Math.max(0, footKids.length - 1);

      /* --- the facts, for Q3 ---------------------------------------------- */
      // The facts region is whichever foot child carries the status text. Located structurally,
      // never by copy (the standing rule after ADR-0091, which this row's own attribute records
      // having been broken three times).
      const factsEl =
        footEl.querySelector('[data-plan-facts]') ??
        [...footEl.children].find((c) => (c.textContent ?? '').trim().length > 0) ??
        null;
      const facts = factsEl
        ? {
            ...box(factsEl),
            text: (factsEl.textContent ?? '').trim().replace(/\s+/g, ' '),
            lineHeight: parseFloat(getComputedStyle(factsEl).lineHeight || '0') || null,
            fontSize: getComputedStyle(factsEl).fontSize,
            leafCount: factsEl.querySelectorAll('*').length,
            // The DEEPEST text-bearing nodes, with the font each actually renders at. The first
            // version of this read reported the wrapper's inherited `16px/24px`, which is not the
            // size any word on this row is drawn at — and Q3 ("could the facts be two lines and
            // keep the row's height?") is entirely a question about line-height.
            leaves: [...factsEl.querySelectorAll('*')]
              .filter(
                (c) =>
                  (c.textContent ?? '').trim().length > 0 &&
                  ![...c.children].some((k) => (k.textContent ?? '').trim().length > 0),
              )
              .map((c) => {
                const cs = getComputedStyle(c);
                return {
                  ...box(c),
                  text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
                  fontSize: cs.fontSize,
                  lineHeight: cs.lineHeight,
                };
              }),
          }
        : null;

      /* --- the deck, for Q5 ----------------------------------------------- */
      const deckEl = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      if (!deckEl) throw new Error('no Plan commands toolbar — the deck could not be located');
      const cards = [...deckEl.querySelectorAll('[data-deck-card], [class*="toolbarCard"]')];
      const cardBoxes = (cards.length ? cards : [...deckEl.children]).map((c) => ({
        ...box(c),
        text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30),
      }));
      const lineTops = [...new Set(cardBoxes.map((c) => Math.round(c.y)))].sort((a, b) => a - b);
      const lines = lineTops.map((top) => {
        const onLine = cardBoxes.filter((c) => Math.round(c.y) === top);
        const used = onLine.reduce((s, c) => s + c.w, 0);
        return {
          top,
          cards: onLine.length,
          used: r(used),
          rightmost: r(Math.max(...onLine.map((c) => c.x + c.w))),
        };
      });

      const items = [...deckEl.querySelectorAll('[data-toolbar-item]')].map((el) => {
        const labelEl = [...el.querySelectorAll('span')].find(
          (s) => !s.className.toString().includes('sr-only') && (s.textContent ?? '').trim(),
        );
        return {
          id: el.getAttribute('data-toolbar-item'),
          ...box(el),
          labelled: Boolean(labelEl),
          label: (labelEl?.textContent ?? '').trim().slice(0, 30),
          disabled:
            el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled,
        };
      });

      /* --- what a promoted command would cost, for Q5 --------------------- */
      // Clone a REAL labelled control, swap its text, measure, remove. No nominal metric, no
      // assumed font: this is the shipped CVA rendered in whatever typeface the machine resolved.
      const donor = items.find((i) => i.labelled && !i.disabled);
      const donorEl = donor ? deckEl.querySelector(`[data-toolbar-item="${donor.id}"]`) : null;
      const promotion: Array<{ label: string; width: number }> = [];
      let donorLabel: string | null = null;
      if (donorEl) {
        const clone = donorEl.cloneNode(true) as HTMLElement;
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.left = '-9999px';
        donorEl.parentElement?.appendChild(clone);
        const target = [...clone.querySelectorAll('span')].find(
          (s) => !s.className.toString().includes('sr-only') && (s.textContent ?? '').trim(),
        );
        donorLabel = (target?.textContent ?? '').trim();
        for (const label of labels) {
          if (target) target.textContent = label;
          promotion.push({ label, width: r(clone.getBoundingClientRect().width) });
        }
        clone.remove();
      }

      /* --- the workspace's vertical budget --------------------------------- */
      const canvasEl =
        document.querySelector('canvas') ?? document.querySelector('[data-canvas-scene]');

      return {
        viewport: { w: window.innerWidth, h: window.innerHeight },
        q1_bandTreatment: {
          chromeBand: { ...box(bandEl), ...treat(bandEl) },
          footRow: { ...box(footEl), ...treat(footEl) },
        },
        q2q4_footRow: {
          ...box(footEl),
          children: footKids,
          used: r(footUsed),
          chrome: r(footChrome),
          slack: r(footEl.getBoundingClientRect().width - footUsed - footChrome),
        },
        q3_facts: facts,
        q5_deck: {
          ...box(deckEl),
          lines,
          cards: cardBoxes,
          itemCount: items.length,
          labelled: items.filter((i) => i.labelled).length,
          items,
          donorLabel,
          promotion,
        },
        canvas: canvasEl ? box(canvasEl) : null,
      };
    }, candidates);

  /* --------------------------------------------------- the ▾ menus (Q5) */

  /**
   * **This probe was wrong twice, and both corrections are recorded because each looked right.**
   *
   * v1 queried `[role="menuitem"],[role="option"],…` across the whole DOCUMENT. The canvas carries
   * a parallel focusable listbox for assistive technology (ADR-0026 D7) whose rows are
   * `role="option"`, so every menu came back holding the plan's activities — and four triggers
   * reported nothing BUT that noise, which reads identically to "this menu is empty".
   *
   * v2 enumerated only the elements the click ADDED. That removed the canvas noise and still
   * reported `View`, `Filter` and `Go to date` as empty. `diag-popovers.spec.ts` settled why by
   * looking instead of reasoning: those three are `ToolbarPopover`/`usePopoverPanel`, which mounts
   * a `[role="dialog"]`, while the ones that worked are `Menu`, which portals a `[role="menu"]`.
   *
   * v3 asks the question the diagnostic proved answerable for both kinds: after the click, find the
   * open `[role="dialog"]` or `[role="menu"]` and enumerate **inside it**. Scoping to the panel is
   * what makes the canvas listbox unreachable by construction rather than by a filter.
   *
   * The trigger set is `[aria-haspopup]`, which deliberately excludes the four group captions —
   * those are disclosure buttons that FOLD their card, and the diagnostic hit exactly that trap by
   * locating "View" by role+name and collapsing the View group instead of opening its menu.
   */
  const readMenus = async (): Promise<unknown> => {
    const triggers = await page
      .locator('[role="toolbar"][aria-label="Plan commands"] [aria-haspopup]')
      .all();
    const out: Array<Record<string, unknown>> = [];
    for (const t of triggers) {
      const name = (await t.getAttribute('aria-label')) ?? (await t.innerText()).trim();
      const label = name.replace(/\s+/g, ' ').slice(0, 30);
      try {
        await t.click({ timeout: 4000 });
        await page.waitForTimeout(300);
        const entries = await page.evaluate(() => {
          const panels = [...document.querySelectorAll('[role="dialog"],[role="menu"]')];
          const panel = panels[panels.length - 1];
          if (!panel) return { kind: 'none', entries: [] as unknown[] };
          const nodes = [
            ...panel.querySelectorAll(
              'button,a,input,[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"],[role="switch"]',
            ),
          ];
          return {
            kind: panel.getAttribute('role'),
            panelLabel: panel.getAttribute('aria-label'),
            entries: nodes.map((n) => ({
              tag: n.tagName,
              role: n.getAttribute('role'),
              type: n.getAttribute('type'),
              label:
                n.getAttribute('aria-label') ??
                ((n.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 44) ||
                  (n.closest('label')?.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 44)),
              disabled:
                n.getAttribute('aria-disabled') === 'true' || (n as HTMLButtonElement).disabled,
              w: Math.round(n.getBoundingClientRect().width),
            })),
          };
        });
        out.push({ trigger: label, ...entries });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(160);
      } catch (e) {
        out.push({ trigger: label, error: String(e).slice(0, 90) });
      }
    }
    return out;
  };

  /* ------------------------------------------------------------ the sweep */

  const results: Array<Record<string, unknown>> = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500);
    const rest = await readAll(PROMOTION_CANDIDATES);
    const menus = await readMenus();

    // With an activity selected — the state Q4 is about, and the only state in which the object
    // bar exists at all today.
    // **The first version clicked `[role="option"]` and selected nothing**, so every Q4 reading came
    // back `dockItemCount: 0` — indistinguishable from "the object bar does not exist", which is the
    // very thing Q4 asks about. Those options are the canvas's parallel a11y layer (ADR-0026 D7);
    // the gesture the shipped suites use is focus-the-listbox-then-keyboard (ADR-0080).
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const selected = await page.evaluate(() => {
      const r = (n: number): number => Math.round(n * 10) / 10;
      const foot = document.querySelector('[data-activities-bar]');
      if (!foot) return { error: 'foot row gone while selected' };
      const b = foot.getBoundingClientRect();
      const dockItems = [...foot.querySelectorAll('[data-toolbar-item]')].map((el) => {
        const bb = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-toolbar-item'),
          w: r(bb.width),
          y: Math.round(bb.y),
          disabled:
            el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled,
        };
      });
      const rows = [...new Set(dockItems.map((i) => i.y))].sort((a, b2) => a - b2);
      return {
        footHeight: r(b.height),
        // Without this a zero-item dock cannot be told apart from a failed selection — the exact
        // ambiguity that made the first run of this probe worthless.
        selectedOptions: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
        dockChildren: [...(foot.children[1]?.children ?? [])].map((c) => ({
          tag: c.tagName,
          w: r(c.getBoundingClientRect().width),
          text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
        })),
        dockItemCount: dockItems.length,
        dockItemsWidth: r(dockItems.reduce((s, i) => s + i.w, 0)),
        wrappedLines: rows.length,
        items: dockItems,
      };
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    results.push({ viewport: vp, rest, menus, selected });
  }

  writeMeasurement('m0-foot-deck-menus', results);
  expect(results).toHaveLength(VIEWPORTS.length);
});
