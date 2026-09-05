import { expect, test, type Page } from '@playwright/test';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **CQ-3** — what a completion-movement chip in the plan's facts row costs the diagram.
 *
 * The verdict rule is `docs/specs/revision-compare-delta/cq3-condition.md`, **committed before this
 * file existed** so it could not be tuned to the numbers below. Read it first; this harness only
 * produces the figures it judges.
 *
 * **The chip does not exist yet, so the "present" state is INJECTED — and it is injected by cloning
 * a real `Fact` node rather than by hand-building one.** That is the load-bearing choice. A
 * hand-styled probe measures whatever the probe was styled as: ADR-0119's divider probe reported
 * +5 px against a predicted +13 because it styled a `<button>`, whose existing `px-2` an inline
 * `padding-left` replaces rather than adds to, and the verdict would have been identical either
 * way with the recorded number simply wrong. A clone inherits the real classes, the real font, the
 * real gap and the real box by construction, so the only thing that differs is the text.
 *
 * It is injected into the **first** row (Data date / Finish) because that row already carries the
 * two longest facts, which is the tighter of the two placements. Placement is M2's question; this
 * measures the worse case, and the second row is measured too so the choice is informed rather
 * than assumed.
 *
 * The chip's text is the **worst realistic case**: a signed multi-day movement with its unit,
 * against a named baseline. ADR-0097 Landing C's harness reported +307 px of slack and a PROCEED
 * because it measured a 37 px plan name where the real worst case is 227 px.
 *
 * Asserts nothing about the product; it is a harness (ADR-0081 §3). Its only `expect`s are the
 * non-vacuity controls, which must fail loudly rather than produce a reassuring zero.
 */

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  // 1646 — the product owner's Surface Pro (2880 × 1920 at 175 %), and the width this surface is
  // actually judged at. Two whole epics shipped decisions taken against widths nobody uses.
  { width: 1646, height: 1097 },
  { width: 1440, height: 960 },
  { width: 1280, height: 900 },
  { width: 1024, height: 800 },
  { width: 768, height: 800 },
];

/** The worst realistic chip: signed, multi-day, with its unit and the baseline it is against. */
const CHIP_LABEL = 'vs Contract Baseline';
const CHIP_VALUE = '+14 working days later';

interface Shot {
  factsHeight: number | null;
  factsLineCount: number | null;
  factsWidth: number | null;
  footRowHeight: number | null;
  dockWidth: number;
  dockHeight: number;
  aboveCanvas: number | null;
  canvasHeight: number | null;
  chipBox: { width: number; height: number } | null;
  factRowHeights: number[];
}

/**
 * Read the geometry. `injectChip` clones the first `Fact` in the first row, retexts it, and appends
 * it to the row named by `row`; `false` measures the resting state.
 *
 * Every lookup is by **role and structure, never by class name**, and anything that cannot be
 * located **throws**. ADR-0091's retrospective records a band lookup silently `.filter()`ing itself
 * out of the results for the whole of ADR-0090 M5: every surviving number stayed correct, so there
 * was nothing for a reader to catch, and the gap was findable only by arithmetic.
 */
async function measure(page: Page, injectChip: 0 | 1 | 2): Promise<Shot> {
  // The chip text is PASSED, not closed over: `page.evaluate` runs in the browser, so a closure
  // over `CHIP_LABEL` compiles and then reads `undefined` at runtime. Naming the worst case once
  // and threading it is what stops the two copies drifting.
  return page.evaluate(
    ({ inject, label, value }) => {
      const CHIP_ID = 'cq3-injected-chip';
      document.getElementById(CHIP_ID)?.remove();

      // The facts column, found from a fact's own accessible name rather than from a class. `Fact`
      // gives each pair one `aria-label` of the form "Label: value", so "Data date" identifies the
      // first fact of the first row wherever that row currently sits.
      const anchor = document.querySelector('[aria-label^="Data date:"]');
      if (!anchor) throw new Error('cq3: the "Data date" fact could not be located');
      const firstRow = anchor.parentElement;
      if (!firstRow) throw new Error('cq3: the first fact row could not be located');
      const factsColumn = firstRow.parentElement;
      if (!factsColumn) throw new Error('cq3: the facts column could not be located');
      const factRows = [...factsColumn.children] as HTMLElement[];

      if (inject > 0) {
        const target = factRows[inject - 1];
        if (!target) throw new Error(`cq3: fact row ${String(inject)} could not be located`);
        // CLONE, do not build. See the docblock: a hand-styled probe measures the probe.
        const chip = anchor.cloneNode(true) as HTMLElement;
        chip.id = CHIP_ID;
        chip.setAttribute('aria-label', `${label}: ${value}`);
        const [labelEl, valueEl] = [...chip.children] as HTMLElement[];
        if (!labelEl || !valueEl) throw new Error('cq3: the cloned fact has an unexpected shape');
        labelEl.textContent = label;
        valueEl.textContent = value;
        target.appendChild(chip);
      }

      // The foot row, by the seam `m4-shrink.spec.ts` already uses. The FIRST version of this walked
      // up to the first ancestor wider than the facts column, and that found a wrapper hugging the
      // facts at 32 px — the facts' own height wearing the foot row's name. ADR-0115 records this row
      // at 41 px, so the number was checkable and wrong; an unproven structural walk beside a proven
      // attribute is the instrument defect this epic keeps recording in other people's harnesses.
      const footRow = document.querySelector<HTMLElement>('[data-activities-bar]');
      if (!footRow)
        throw new Error('cq3: [data-activities-bar] (the foot row) could not be located');

      // **The dock, which is what actually pays.** The facts row cannot wrap — `Fact` is
      // `whitespace-nowrap` and its row has no `flex-wrap` — so a chip does not make the facts taller,
      // it makes them WIDER, and the width comes out of the dock beside them. ADR-0115 measured
      // exactly this in the other direction: the facts holding 231 px was what kept the dock from
      // fitting at 1440, and handing it back took that width from 117 px of wrap to 41. A harness that
      // measures only the facts answers a question nobody asked.
      //
      // `CanvasDockOutlet` carries no data attribute, so it is found by the property that MAKES it
      // the payer: it is the row's `flex-1` child, i.e. `flex: 1 1 0%`. That signature is not a class
      // match — it is the computed fact that this element grows into whatever the facts leave and
      // wraps its own items to absorb the deficit. If it ever stops being the grower, this lookup
      // fails and the measurement's premise has changed, which is the right way round.
      const dock =
        [...footRow.querySelectorAll('*')].find((el) => {
          const cs = getComputedStyle(el);
          return cs.flexGrow !== '0' && cs.flexBasis === '0%' && cs.flexShrink !== '0';
        }) ?? null;
      if (!dock)
        throw new Error("cq3: the canvas dock (the foot row's flex-1 child) could not be located");

      const canvas = document.querySelector('canvas');
      const canvasBox = canvas?.getBoundingClientRect() ?? null;
      const round = (n: number): number => Math.round(n * 10) / 10;

      // How many flex LINES the facts column resolves to — the quantity the condition turns on. Each
      // child div is one explicit row since 2026-08-28, and a row that itself wraps adds lines, so
      // this counts distinct `top` values across the fact spans rather than counting the children.
      const factSpans = [...factsColumn.querySelectorAll('[aria-label]')] as HTMLElement[];
      const tops = new Set(factSpans.map((s) => Math.round(s.getBoundingClientRect().top)));

      const injected = document.getElementById(CHIP_ID);
      const injectedBox = injected?.getBoundingClientRect() ?? null;

      return {
        factsHeight: round(factsColumn.getBoundingClientRect().height),
        factsLineCount: tops.size,
        factsWidth: round(factsColumn.getBoundingClientRect().width),
        footRowHeight: round(footRow.getBoundingClientRect().height),
        dockWidth: round(dock.getBoundingClientRect().width),
        dockHeight: round(dock.getBoundingClientRect().height),
        aboveCanvas: canvasBox ? round(canvasBox.top) : null,
        canvasHeight: canvasBox ? round(canvasBox.height) : null,
        chipBox: injectedBox
          ? { width: round(injectedBox.width), height: round(injectedBox.height) }
          : null,
        factRowHeights: factRows.map((r) => round(r.getBoundingClientRect().height)),
      };
    },
    { inject: injectChip, label: CHIP_LABEL, value: CHIP_VALUE },
  );
}

test('CQ-3 — the facts-row chip, measured against the committed condition', async ({ page }) => {
  clearMeasurement('cq3-facts-chip');
  const stamp = Date.now();

  await page.setViewportSize(VIEWPORTS[0]!);
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('CQ3 Tester');
  await page.getByLabel('Email').fill(`cq3-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`CQ3 Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  // A realistic plan name, for the reason vertical-stack.spec.ts records: a five-character name is
  // a 37 px crumb against 227 px for an ordinary construction plan, and that 190 px reversed a
  // verdict once.
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside — Phase 2 Substructure');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Riverside — Phase 2 Substructure' }).click();
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  for (const name of ['Excavate', 'Pour slab']) {
    await page.getByRole('button', { name: 'New activity' }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }
  await expect(page.getByText('Finish', { exact: true })).toBeVisible({ timeout: 30_000 });

  const report: Record<string, unknown> = {};
  const verdicts: string[] = [];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    // Let the layout settle before reading; a measurement taken mid-transition is noise.
    await expect(page.getByText('Finish', { exact: true })).toBeVisible();
    await page.waitForTimeout(200);

    const absent = await measure(page, 0);
    const row1 = await measure(page, 1);
    const row2 = await measure(page, 2);
    await measure(page, 0); // leave the DOM as we found it

    // **The state that actually pays, and the first run did not measure it.** With nothing
    // selected the dock is EMPTY — `dockHeight` read 0 in both states — so the chip was taking
    // 252.7 px from a box with nothing in it, and "the foot row did not grow" was true and
    // uninformative. The dock only has something to wrap once it holds the object-action bar, and
    // ADR-0115 records that bar wrapping this row until the facts handed 231 px back. So the same
    // pair is measured again with an activity selected.
    // Populated by ARMING A TOOL, which docks a statement — the same lever `e2e-workspace-chrome/
    // dock.spec.ts` uses to prove the 0 px guarantee. Clicking a table cell was tried first and did
    // NOT populate the dock (`dockHeight` stayed 0 at every width), which the control below now
    // catches instead of letting it read as "the chip is free".
    await page
      .getByRole('toolbar', { name: 'Plan commands' })
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    await expect(page.getByText(/^Marquee select/).first()).toBeVisible();
    await page.waitForTimeout(250);
    const selAbsent = await measure(page, 0);
    const selRow1 = await measure(page, 1);
    await measure(page, 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    // NON-VACUITY CONTROL, checked before any verdict. A run where the clone silently failed to
    // mount reports no height change — indistinguishable from a PASS, and the likeliest way this
    // measurement lies. The same control caught a CHECK probe reading an emptied table earlier in
    // this epic, where nine zero-row results would have read as success.
    expect(
      row1.chipBox,
      `${String(viewport.width)}: the injected chip did not render`,
    ).not.toBeNull();
    expect(
      row1.chipBox!.width,
      `${String(viewport.width)}: the injected chip has zero width`,
    ).toBeGreaterThan(0);
    expect(
      row1.chipBox!.height,
      `${String(viewport.width)}: the injected chip has zero height`,
    ).toBeGreaterThan(0);
    expect(
      absent.chipBox,
      `${String(viewport.width)}: the resting state should have no chip`,
    ).toBeNull();
    // **The control the first two runs did not have, and needed.** The docked state must actually
    // BE docked. With an empty dock the chip takes width from a box holding nothing and the row
    // cannot grow, so "FREE" is true and says nothing — the same shape as a CHECK probe run against
    // an emptied table. A verdict from an unpopulated dock is not a verdict.
    expect(
      selAbsent.dockHeight,
      `${String(viewport.width)}: the dock is empty, so the selected-state verdict would be vacuous`,
    ).toBeGreaterThan(0);

    const free =
      row1.footRowHeight === absent.footRowHeight && row1.canvasHeight === absent.canvasHeight;
    // The verdict the condition actually asks for is about the state a planner is in when the chip
    // would matter: a selection made, the object bar docked.
    const freeSelected =
      selRow1.footRowHeight === selAbsent.footRowHeight &&
      selRow1.canvasHeight === selAbsent.canvasHeight;
    verdicts.push(
      `${String(viewport.width)}: ${free ? 'FREE' : 'COSTS'} ` +
        `footRow ${String(absent.footRowHeight)} -> ${String(row1.footRowHeight)}, ` +
        `canvas ${String(absent.canvasHeight)} -> ${String(row1.canvasHeight)}, ` +
        `lines ${String(absent.factsLineCount)} -> ${String(row1.factsLineCount)}, ` +
        // Reported even when the verdict is FREE, because the facts row cannot wrap: the cost shows
        // up as width taken from the dock, not as height taken from the canvas.
        `factsW ${String(absent.factsWidth)} -> ${String(row1.factsWidth)}, ` +
        `dockW ${String(absent.dockWidth)} -> ${String(row1.dockWidth)}, ` +
        `dockH ${String(absent.dockHeight)} -> ${String(row1.dockHeight)}`,
    );
    verdicts.push(
      `${String(viewport.width)} SELECTED: ${freeSelected ? 'FREE' : 'COSTS'} ` +
        `footRow ${String(selAbsent.footRowHeight)} -> ${String(selRow1.footRowHeight)}, ` +
        `canvas ${String(selAbsent.canvasHeight)} -> ${String(selRow1.canvasHeight)}, ` +
        `dockW ${String(selAbsent.dockWidth)} -> ${String(selRow1.dockWidth)}, ` +
        `dockH ${String(selAbsent.dockHeight)} -> ${String(selRow1.dockHeight)}`,
    );

    report[`${String(viewport.width)}x${String(viewport.height)}`] = {
      absent,
      chipInRow1: row1,
      chipInRow2: row2,
      free,
      selectionAbsent: selAbsent,
      selectionChipInRow1: selRow1,
      freeSelected,
    };
  }

  report.verdicts = verdicts;
  report.rule =
    'PROCEED iff footRowHeight AND canvasHeight are unchanged, as equalities, at EVERY width. ' +
    'Any change at any width -> WITHDRAW to the dock alone and put the number to the product owner. ' +
    'See docs/specs/revision-compare-delta/cq3-condition.md, committed before this harness existed.';
  writeMeasurement('cq3-facts-chip', report);
  for (const line of verdicts) console.warn(line);
});
