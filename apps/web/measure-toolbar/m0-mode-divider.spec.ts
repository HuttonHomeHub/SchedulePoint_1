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
 * **M0-T2 — what does a visible divider between the two mode switches cost?**
 * (`docs/specs/mode-toggles/`, `docs/TECH_DEBT.md` #201.)
 *
 * #201 is that `Early mode | Visual mode | Diagram | Gantt` render as ONE `role="group"` with one
 * accessible name and four identical gaps, so a reader — sighted or not — is given no signal that
 * these are two independent two-way switches rather than one four-way choice. The fix has two
 * halves: **accessible names** for two sub-groups (which cost zero width) and a **visible hairline**
 * between them (which does not). This harness measures only the second, because only the second can
 * be refused.
 *
 * **It injects chrome the product does not yet contain, and says so** (ADR-0081 §3). Nothing here is
 * an assertion about the product; every figure is a prediction about a build that does not exist. M3
 * re-measures against the shipped markup, and a divergence between the two is the finding rather
 * than an embarrassment.
 *
 * **The verdict rule was committed before this ran** — `docs/specs/mode-toggles/falsification.md`,
 * its own commit, its own timestamp. That ordering exists because ADR-0097 Landing C's harness
 * produced a PROCEED from an `undefined` and from a 37 px placeholder plan name. This file does not
 * decide anything; it reports the five figures that rule names, and `m0-measurement.md` quotes the
 * rule rather than paraphrasing it.
 *
 * **Why a new file rather than extending `m1-merged-probe.spec.ts`**, which the plan named: that
 * file's docblock is ADR-0114's record of three separate occasions on which it measured one thing
 * under another thing's name, and editing it would overwrite that record. The technique is borrowed
 * — a clone mounted **inside the band**, so every ancestor-dependent style resolves as it does in
 * the product — and the file is new. Recorded as a deviation rather than done silently.
 *
 * **Baseline and candidate are read in ONE session against ONE fixture.** Comparing two runs would
 * reintroduce the failure ADR-0099 records: a sweep measures the tree it runs against, and two runs
 * are two trees. The injection is applied to the LIVE toolbar, `aboveCanvas` is read with it in
 * place, and it is then removed and the baseline re-read — so a drift between the two readings is
 * visible as the baseline not matching itself.
 */

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
];

/**
 * Long, and deliberately so. ADR-0097 Landing C's harness reported "307 px of slack, PROCEED" off a
 * 37 px placeholder; `falsification.md` makes a short name a VOID condition for this run.
 */
const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

/**
 * `Toolbar.tsx:199` — the inter-group chrome, verbatim. Kept as the three separate values rather
 * than as the summed 13, because the sum is the *prediction* under test and a constant named `13`
 * would make the harness agree with it by construction.
 */
const CANDIDATE_CHROME = { marginLeft: 4, borderLeft: 1, paddingLeft: 8 };

test('M0-T2: the mode divider, baseline and candidate, at four widths', async ({ page }) => {
  clearMeasurement('m0-mode-divider');
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
  // `recalculate` ends in a reload, which drops the pen. Re-taking it is not tidiness: ADR-0115
  // records every figure in that epic being read in the one state where the pen region renders
  // nothing, and `falsification.md` makes a missing pen a VOID condition for this run.
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan mode' })).toBeVisible();

  const report: Record<string, unknown> = {
    planName: PLAN_NAME,
    candidateChrome: CANDIDATE_CHROME,
    predictedNetPx:
      CANDIDATE_CHROME.marginLeft + CANDIDATE_CHROME.borderLeft + CANDIDATE_CHROME.paddingLeft,
  };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    report[`${viewport.width}`] = await page.evaluate((chrome) => {
      const round = (n: number): number => Math.round(n);

      const header = document.querySelector('header');
      const modeToolbar = document.querySelector('[role="toolbar"][aria-label="Plan mode"]');
      const canvas = document.querySelector('canvas');
      if (!header || !modeToolbar)
        throw new Error('m0-mode-divider: header or mode toolbar absent');

      const headerGrid = header.firstElementChild as HTMLElement | null;
      const modeCluster = modeToolbar.parentElement;
      if (!headerGrid || !modeCluster) throw new Error('m0-mode-divider: containers absent');

      /**
       * The two `Plan view` items, located by `data-toolbar-item` and never by their visible copy.
       * ADR-0091's retrospective ends with exactly that rule: three journeys broke across one epic
       * because they found a toolbar control by the words on it.
       *
       * **What gets the chrome is a WRAPPER around this pair, not one of the controls** — and the
       * first version of this harness got that wrong in a way worth keeping. It applied the three
       * properties to the `Diagram` button itself and reported **+5 px against a predicted +13**.
       * The missing 8 px was not a discovery about the layout: `paddingLeft: 8px` on a control that
       * already carries `px-2` **replaces** its padding rather than adding a group's, so only the
       * margin and the border survived. `Toolbar.tsx:199` styles the `role="group"` div, so the only
       * faithful injection is a div. Caught because the delta disagreed with the prediction and the
       * probe prints the node it touched — which is the check `m1-merged-probe.spec.ts` records
       * missing three times in one file, here on its first run.
       */
      const viewItems = ['view-tsld', 'view-gantt'].map((id) => {
        const el = modeToolbar.querySelector<HTMLElement>(`[data-toolbar-item="${id}"]`);
        if (!el) throw new Error(`m0-mode-divider: ${id} not found in the mode toolbar`);
        // The node the group would contain is the item's own wrapper where it has one (a `render`
        // item is wrapped in `<span class="inline-flex items-center">`), else the control.
        const wrapper = el.closest<HTMLElement>('span.inline-flex');
        return wrapper && wrapper.parentElement?.getAttribute('role') === 'group' ? wrapper : el;
      });
      const groupParent = viewItems[0]!.parentElement;
      if (!groupParent) throw new Error('m0-mode-divider: the view items have no parent');

      const host = header.parentElement ?? header;

      /** What a row of these nodes REQUIRES: `max-content`, every gap counted once, nothing shrunk. */
      const requiredWidth = (nodes: Element[], gapPx: number): number => {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;top:-9999px;left:0;display:flex;align-items:center;width:max-content;gap:${gapPx}px;`;
        for (const n of nodes) probe.appendChild(n.cloneNode(true));
        host.appendChild(probe);
        const w = probe.offsetWidth;
        probe.remove();
        return round(w);
      };

      /**
       * The live row's line count, derived from its own tallest child rather than from a constant.
       * A fixed 56 would be an assumption about padding that `min-h-14 py-1` on the band makes
       * false — and the failure mode this whole milestone guards against is a second line, so the
       * count is the reading that matters most.
       */
      const readLines = (row: HTMLElement | null): { height: number; lines: number | null } => {
        if (!row) throw new Error('m0-mode-divider: row absent');
        const tallest = Math.max(
          0,
          ...[...row.children].map((c) => (c as HTMLElement).getBoundingClientRect().height),
        );
        const height = row.getBoundingClientRect().height;
        return { height: round(height), lines: tallest > 0 ? Math.round(height / tallest) : null };
      };

      const read = (): Record<string, unknown> => ({
        container: round(header.getBoundingClientRect().width),
        headerRowRequired: requiredWidth([...headerGrid.children], 12),
        perOccupantMode: requiredWidth([modeCluster], 0),
        modeToolbarLines: readLines(modeToolbar as HTMLElement),
        headerLines: readLines(headerGrid),
        aboveCanvas: canvas ? Math.round(canvas.getBoundingClientRect().top * 10) / 10 : null,
      });

      const baseline = read();

      /**
       * ── The candidate: a real second `role="group"` around the view pair ───────────────────
       *
       * Built to match `Toolbar.tsx:191-200` exactly — `flex flex-wrap items-center gap-1` plus the
       * `i > 0` chrome — and inserted where the pair sits, with the pair moved inside it. That
       * reproduces the two effects a split has and an inline style on one control cannot: the
       * group's own `gap-1` now governs the space *between* the two view items, and the 8 px of
       * `pl-2` lands outside the buttons rather than replacing their padding.
       */
      const anchor = viewItems[0]!;
      const wrapper = document.createElement('div');
      wrapper.setAttribute('role', 'group');
      wrapper.setAttribute('aria-label', 'Plan view');
      wrapper.style.cssText =
        `display:flex;flex-wrap:wrap;align-items:center;gap:4px;` +
        `margin-left:${chrome.marginLeft}px;border-left:${chrome.borderLeft}px solid;` +
        `padding-left:${chrome.paddingLeft}px;`;
      groupParent.insertBefore(wrapper, anchor);
      for (const item of viewItems) wrapper.appendChild(item);
      const candidate = read();
      // Put them back exactly where they were, in order, and remove the wrapper.
      for (const item of viewItems) groupParent.insertBefore(item, wrapper);
      wrapper.remove();

      // The baseline read a second time, AFTER the injection was removed. If it does not match the
      // first reading, the harness perturbed the thing it measured and the run is not comparable —
      // which is the one failure a single-reading probe cannot report about itself.
      const baselineAgain = read();

      return {
        injectedInto: {
          selector: 'a real role="group" wrapper around [view-tsld, view-gantt]',
          text: viewItems.map((n) => (n.textContent ?? '').trim()).join(' | '),
        },
        baseline,
        candidate,
        baselineAgain,
        deltas: {
          perOccupantMode:
            (candidate.perOccupantMode as number) - (baseline.perOccupantMode as number),
          headerRowRequired:
            (candidate.headerRowRequired as number) - (baseline.headerRowRequired as number),
          aboveCanvas:
            candidate.aboveCanvas === null || baseline.aboveCanvas === null
              ? null
              : (candidate.aboveCanvas as number) - (baseline.aboveCanvas as number),
        },
      };
    }, CANDIDATE_CHROME);
  }

  writeMeasurement('m0-mode-divider', report);
});
