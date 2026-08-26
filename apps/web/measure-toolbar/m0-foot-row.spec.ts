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
 * **M0 — can one stable foot row hold the facts, the object actions and the dock?**
 *
 * The product owner's complaint is that the foot "juggles": the plan facts and the object-action
 * bar swap sides when the activities panel expands, and at 1646 the collapsed row appears to run
 * off the right edge. The proposal is one row that never moves — actions pinned left, dock in the
 * middle, facts right — which only works if the contents fit.
 *
 * Four consecutive epics have had a width expectation on this surface contradicted by its own
 * measurement, twice this week. So the conditions are written **here, before the run**, and the
 * verdicts are computed from the readings rather than read off them afterwards.
 *
 * ## The falsification conditions
 *
 * **C1 — the 1646 overflow is real.** Predicted: at 1646, collapsed, with a selection, the row's
 * `scrollWidth` exceeds its `clientWidth` and at least one action's right edge sits beyond the
 * container's. If they are equal, the screenshot showed something else and the defect diagnosis is
 * withdrawn.
 *
 * **C2 — the streamlined row fits at 1920.** After withdrawing the pen sentence, shortening three
 * labels and folding the four pen-gated editor doors into one `Edit ▾`, the row's required width
 * must leave at least as much slack as the **armed-tool statement** measures — because ADR-0092's
 * guarantee is that arming a tool costs the canvas 0 px, and it can only hold if the strip has
 * somewhere to go. Slack below that figure withdraws the single-row design in favour of two bands.
 *
 * **C3 — three deck cards still do not fit at 1920.** Predicted from the ADR-0110/0113 readings
 * (638 / 662 / 608 / 674 px, container 1862): VIEW + FIND + PLAN ≈ 1998, over by ~136. If they DO
 * fit against today's shipped deck, the recommendation against moving Author reverses, and the
 * consolidation pass is unnecessary rather than merely first.
 *
 * ## What it does NOT establish
 *
 * The label savings are measured by cloning each control and rewriting its text, so they are the
 * text's contribution alone. A real `Edit ▾` split button adds a caret region this cannot model —
 * `ToolbarSplitButton`'s caret is a sibling of its primary (ADR-0110 D5 records a gate missing it
 * for exactly that reason), so the folded figure here is a **floor**, not the shipped width.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
];

const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

/** The three relabels the product owner asked for, plus the one I proposed. */
const RELABELS: Record<string, string> = {
  'Zoom to selection': 'Zoom selection',
  'Report progress': 'Progress',
  'Clear visual placement': 'Clear placement',
  'Isolate logic path': 'Isolate',
};

/** The four pen-gated doors that would fold into one `Edit ▾`. Progress is excluded: it is not
 *  pen-gated (ADR-0060), so folding it would shade a Contributor's only action. */
const FOLDED_DOORS = ['Logic', 'Resources', 'Steps', 'Edit'];

test('M0: the foot row, the deck, and what streamlining would buy', async ({ page }) => {
  clearMeasurement('m0-foot-row');
  test.setTimeout(300_000);

  await page.setViewportSize(VIEWPORTS[0]!);
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

  /**
   * Read the foot row: its box, every direct child, and — because the row is what this epic is
   * about — every button inside it individually, so a label saving can be attributed.
   */
  const readFoot = (relabels: Record<string, string>, folded: string[]): Promise<unknown> =>
    page.evaluate(
      ({ relabels: rl, folded: fd }) => {
        const round = (n: number): number => Math.round(n);
        const row = document.querySelector<HTMLElement>('[data-activities-bar]');
        if (!row) return { error: 'no [data-activities-bar]' };
        const box = row.getBoundingClientRect();

        // Every pointer target in the row, by its own box — never by a wrapper, which is how
        // ADR-0110 D5's sweep missed a split button's caret.
        const controls = [...row.querySelectorAll('button, [role="button"]')].map((c) => {
          const b = c.getBoundingClientRect();
          return {
            text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
            width: round(b.width),
            right: round(b.right),
            // Beyond the row's own right edge = not reachable by pointer.
            clipped: b.right > box.right + 1 || b.width === 0,
          };
        });

        const facts = row.querySelector<HTMLElement>('[data-schedule-state]');
        const factsBox = facts?.getBoundingClientRect();
        // The pen sentence is the live region inside the facts; measuring it separately is what
        // decides whether withdrawing it is worth the information it carries.
        const sentence = facts?.querySelector('[role="status"]') as HTMLElement | null;
        const sentenceBox = sentence?.getBoundingClientRect();

        /**
         * What a relabel would save: clone the control, rewrite the deepest text node, measure.
         * `position:absolute; width:max-content` so the clone is sized by its content and not by
         * whatever the flex line would have given it.
         */
        const relabelSaving = (from: string, to: string): number | null => {
          const el = [...row.querySelectorAll('button, [role="button"]')].find(
            (c) => (c.textContent ?? '').trim().replace(/\s+/g, ' ') === from,
          ) as HTMLElement | undefined;
          if (!el) return null;
          const before = el.getBoundingClientRect().width;
          const clone = el.cloneNode(true) as HTMLElement;
          clone.style.cssText += ';position:absolute;top:-9999px;left:0;width:max-content;';
          const walk = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
          let node = walk.nextNode();
          while (node) {
            if ((node.textContent ?? '').trim() === from) node.textContent = to;
            node = walk.nextNode();
          }
          document.body.appendChild(clone);
          const after = clone.getBoundingClientRect().width;
          clone.remove();
          return round(before - after);
        };

        const relabelSavings = Object.entries(rl).map(([from, to]) => ({
          from,
          to,
          saved: relabelSaving(from, to),
        }));

        const foldedWidths = fd.map((label) => {
          const el = [...row.querySelectorAll('button, [role="button"]')].find(
            (c) => (c.textContent ?? '').trim().replace(/\s+/g, ' ') === label,
          );
          return { label, width: el ? round(el.getBoundingClientRect().width) : null };
        });

        return {
          rowWidth: round(box.width),
          rowHeight: round(box.height),
          scrollWidth: round(row.scrollWidth),
          clientWidth: round(row.clientWidth),
          overflows: row.scrollWidth > row.clientWidth + 1,
          controlCount: controls.length,
          clippedControls: controls.filter((c) => c.clipped),
          controls,
          factsWidth: factsBox ? round(factsBox.width) : null,
          sentenceWidth: sentenceBox ? round(sentenceBox.width) : null,
          sentenceText: (sentence?.textContent ?? '').trim().slice(0, 60) || null,
          relabelSavings,
          foldedWidths,
        };
      },
      { relabels, folded },
    );

  /** The four deck cards, measured by their own boxes, plus the band that has to hold them. */
  const readDeck = (): Promise<unknown> =>
    page.evaluate(() => {
      const round = (n: number): number => Math.round(n);
      const toolbar = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      const band = toolbar?.parentElement?.getBoundingClientRect();
      // A card is a labelled group inside the deck; read each by its own box.
      // A card is `role="group"` with its caption as the accessible name (`Deck.tsx:264`). There is
      // no `data-toolbar-group` — the first draft of this probe invented one, and finding it absent
      // is why this reads the role instead of reporting four nulls that look like four zeros.
      const cards = [...(toolbar?.querySelectorAll(':scope > [role="group"]') ?? [])].map((g) => {
        const b = g.getBoundingClientRect();
        return {
          name: (g.getAttribute('aria-label') ?? '').trim(),
          width: round(b.width),
        };
      });
      return {
        bandWidth: band ? round(band.width) : null,
        toolbarWidth: toolbar ? round(toolbar.getBoundingClientRect().width) : null,
        toolbarHeight: toolbar ? round(toolbar.getBoundingClientRect().height) : null,
        cards,
      };
    });

  /**
   * The armed-tool statement's **intrinsic** width — C2's slack requirement.
   *
   * The first version of this read `row.querySelector('[role="status"]')`, which matched the PEN
   * SENTENCE's live region and returned 126 px with the text "You're editing this plan." — a
   * plausible number for the wrong element. It was caught only because the reading carries its
   * `text`, which is why it does.
   *
   * The dock outlet is a bare `div` (`canvas-dock.tsx:104`) sitting between the facts and the
   * collapse toggle, and it is `flex-1` — so its own box is the row's leftover width, never the
   * strip's. The strip is its child, and what C2 needs is that child at `max-content`.
   */
  const readDockStrip = (): Promise<unknown> =>
    page.evaluate(() => {
      const round = (n: number): number => Math.round(n);
      const row = document.querySelector('[data-activities-bar]');
      if (!row) return { error: 'no [data-activities-bar]' };
      // Every direct child, so a mis-pick is visible in the output rather than plausible.
      const tree = [...row.children].map((c) => ({
        tag: c.tagName,
        width: round(c.getBoundingClientRect().width),
        text: (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
      }));
      // The dock is the child that is neither the facts (which CONTAINS `data-schedule-state` on a
      // descendant, not itself — the second mis-pick) nor the collapse button.
      const dock = [...row.children].find(
        (c) =>
          !c.querySelector('[data-schedule-state]') &&
          !c.hasAttribute('data-schedule-state') &&
          c.tagName !== 'BUTTON' &&
          c.children.length > 0,
      );
      const strip = dock?.firstElementChild as HTMLElement | undefined;
      if (!strip) return { error: 'dock has no child — is a tool armed?', tree };
      const clone = strip.cloneNode(true) as HTMLElement;
      clone.style.cssText += ';position:absolute;top:-9999px;left:0;width:max-content;';
      document.body.appendChild(clone);
      const intrinsic = round(clone.getBoundingClientRect().width);
      clone.remove();
      return {
        dockBoxWidth: round(dock!.getBoundingClientRect().width),
        stripLaidOutWidth: round(strip.getBoundingClientRect().width),
        stripIntrinsicWidth: intrinsic,
        text: (strip.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 90),
        tree,
      };
    });

  /**
   * **B1 — does the row clip because it is too wide, or because one wrapper cannot shrink?**
   *
   * The architecture review's headline finding, offered explicitly as unverified: `Toolbar` already
   * wraps unconditionally (`Toolbar.tsx:181-189`) and the dock outlet is `flex-1 min-w-0 flex-wrap`
   * (`canvas-dock.tsx:104`) — but between them sits `selection-actions.tsx:845`, a
   * `flex shrink-0 items-center` wrapper. A `shrink-0` item takes `max-content` and never shrinks,
   * so the outlet's width is never imposed on it and the wrapping `Toolbar` inside is never asked
   * to break a line.
   *
   * If that is the cause, the live defect is a one-line CSS fix and D4's responsive fold is not
   * required for correctness at all. So it is tested rather than argued: drop the class, force a
   * reflow, and read the row again.
   */
  const probeShrinkHypothesis = (): Promise<unknown> =>
    page.evaluate(() => {
      const round = (n: number): number => Math.round(n);
      const row = document.querySelector<HTMLElement>('[data-activities-bar]');
      const bar = document.querySelector<HTMLElement>(
        '[role="toolbar"][aria-label^="Actions for"]',
      );
      if (!row || !bar) return { error: 'row or selection bar not found' };
      const wrapper = bar.parentElement;
      if (!wrapper) return { error: 'bar has no wrapper' };

      const before = {
        scrollWidth: round(row.scrollWidth),
        clientWidth: round(row.clientWidth),
        rowHeight: round(row.getBoundingClientRect().height),
        overflows: row.scrollWidth > row.clientWidth + 1,
        wrapperClass: wrapper.className,
      };

      // The hypothesis, applied: let the wrapper shrink so the flex line can impose a width.
      wrapper.classList.remove('shrink-0');
      wrapper.style.minWidth = '0';
      void row.offsetWidth;

      const after = {
        scrollWidth: round(row.scrollWidth),
        clientWidth: round(row.clientWidth),
        rowHeight: round(row.getBoundingClientRect().height),
        overflows: row.scrollWidth > row.clientWidth + 1,
        // Did the toolbar inside actually break a line?
        barHeight: round(bar.getBoundingClientRect().height),
      };

      wrapper.classList.add('shrink-0');
      wrapper.style.minWidth = '';
      return { before, after };
    });

  const report: Record<string, unknown> = { planName: PLAN_NAME };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(700);

    const deck = await readDeck();

    // Nothing selected: the row carries the facts and the panel affordance only.
    const footNoSelection = await readFoot(RELABELS, FOLDED_DOORS);

    /**
     * Select, through the canvas's own parallel listbox (ADR-0026 D7).
     *
     * **Not by clicking an option.** That listbox is `sr-only` (`TsldPanel.tsx:2796`), so the
     * previous probe's `getByRole('option').first().isVisible()` answered false and its selection
     * reading was recorded as `{ skipped: 'no listbox option found' }` — at both widths, in a run
     * that otherwise passed. `m5-canvas-foot.json` carries that same skip, under a docblock saying
     * the row is measured "in three states". An instrument that measures two and reports success is
     * the failure this file's own output helper exists to prevent, one level up.
     *
     * Focusing the listbox is enough: it default-selects on focus (`TsldPanel.tsx:974`), which is
     * the real keyboard entry a planner uses and needs no coordinates.
     */
    const listbox = page.getByRole('listbox', { name: 'Activities in the diagram' });
    await listbox.focus();
    await page.waitForTimeout(600);
    const footSelected = await readFoot(RELABELS, FOLDED_DOORS);
    // Fail rather than record a skip: a reading with one control in it is not a foot row with a
    // selection, and the whole question this probe answers is what that row costs.
    const controlCount = (footSelected as { controlCount?: number }).controlCount ?? 0;
    expect(controlCount, `selection actions at ${viewport.width}`).toBeGreaterThan(3);

    // The armed-tool statement, for C2's slack figure.
    let dockStrip: unknown = { skipped: 'Add control not found' };
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const add = page.getByRole('button', { name: /^Add$/ }).first();
    if (await add.isVisible().catch(() => false)) {
      await add.click();
      await page.waitForTimeout(500);
      dockStrip = await readDockStrip();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Re-select (the Escape above cleared it) so the hypothesis is probed in the state that clips.
    await listbox.focus();
    await page.waitForTimeout(500);
    const shrinkHypothesis = await probeShrinkHypothesis();

    report[`${viewport.width}`] = {
      deck,
      footNoSelection,
      footSelected,
      dockStrip,
      shrinkHypothesis,
    };
  }

  const path = writeMeasurement('m0-foot-row', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
