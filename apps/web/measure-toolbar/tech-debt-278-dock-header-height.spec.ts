import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **`docs/TECH_DEBT.md` #278 — the one reading that row asks for, and nothing else.**
 *
 * `SheetHeader`'s close button defaults to `icon-sm` (28 px). Four right docks take that default
 * and none is a dense list row, so under ADR-0118 D1's house rule they are 28 × 28 against a 44 px
 * bar. The row costed its three candidates on 2026-09-11 and struck one of them; what it left
 * explicitly **uncosted** is where the 12 px goes:
 *
 * > _"Where the 12 px lands is **reasoned and not measured**: a right dock is a column beside the
 * > diagram, so a taller header inside it should cost that panel's own content and never the
 * > canvas. If that holds, the whole decision is 12 px of panel content on whichever single panel
 * > is open — materially cheaper than 'a visible desktop change to four workspace panels' reads."_
 *
 * ADR-0092's dock guarantee was asserted in a browser for exactly this class of "obviously it
 * cannot move" reasoning, and ADR-0115 then measured that guarantee being paid for by hidden
 * controls. This repository has had a width or height expectation contradicted by its own
 * measurement eight consecutive times on this surface. So the prediction is written here, before
 * the run, and the verdict is computed from the readings rather than read off them afterwards.
 *
 * ## Where this harness BYPASSES the product, stated because ADR-0081 requires it
 *
 * **The treatment is simulated with CSS, not built.** Switching `closeButtonSize` for real is the
 * decision the row is waiting on; this probe forces the close button's box to 40 × 40 with an
 * injected rule, which is what `icon` resolves to on a **fine** pointer (`size-10`). It therefore
 * measures the desktop cost — the half the row calls "a visible desktop change" — and says nothing
 * about the coarse floor (`pointer-coarse:size-(--control-h)`, 44 px), which is 4 px more again.
 *
 * It also measures **Plan notes** alone. `right-docks.ts` declares four members and enforces one
 * open at a time, so one panel is the whole population on screen at any moment; the other three
 * reach their close through the same `SheetHeader`, which is why one reading generalises. That is
 * an argument, not a measurement, and it is written down as one.
 *
 * ## The conditions, written before the run
 *
 * **C0 — non-vacuity.** The injected rule must actually change the close button's measured box
 * (28 → 40) and the header's own height with it. A probe whose treatment did nothing reports
 * "no cost" for every quantity and looks exactly like a pass. This is checked FIRST and the run is
 * void without it (ADR-0093; ADR-0128's INDETERMINATE).
 *
 * **C1 — the question.** Does the canvas lose height? Predicted: **zero at every width**, because
 * the dock is a column beside the diagram. If it is not zero the row's cheaper reading is wrong and
 * the decision is more expensive than it was costed at.
 *
 * **C2 — where it lands instead.** The panel's own scrollable content region should give up what
 * the header takes. Predicted: content height falls by the same amount the header gains, ±1 px for
 * sub-pixel layout.
 */

const WIDTHS = [1440, 1646, 1920] as const;

/** The fine-pointer `icon` box (`size-10`). NOT the coarse floor — see the docblock. */
const TREATMENT_PX = 40;

async function signUp(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
}

interface Reading {
  readonly error?: string;
  readonly closeButtonHeight?: number;
  readonly headerHeight?: number;
  readonly contentHeight?: number;
  readonly panelHeight?: number;
  readonly canvasHeight?: number;
  readonly canvasWidth?: number;
  readonly panelWidth?: number;
}

async function read(page: Page): Promise<Reading> {
  return page.evaluate((): Reading => {
    const round = (n: number) => Math.round(n * 10) / 10;
    const panel = document.querySelector<HTMLElement>('section[aria-label="Plan notes panel"]');
    if (!panel) return { error: 'no Plan notes panel' };
    const close = panel.querySelector<HTMLElement>('button[aria-label="Close plan notes"]');
    if (!close) return { error: 'no close button in the Plan notes panel' };
    // The header is the close button's own bordered bar — walked up from the control rather than
    // taken as `panel.firstElementChild`, so a wrapper added later cannot silently re-point this
    // at a different box while the numbers still look plausible.
    const header = close.closest<HTMLElement>('div.border-b');
    // The scrollable content region below it — the thing the row predicts pays for the header.
    const content = panel.querySelector<HTMLElement>(':scope > div.overflow-y-auto');
    const canvasSection = document.querySelector<HTMLElement>(
      'section[aria-label="Time-scaled logic diagram"]',
    );
    const canvasBox = canvasSection?.getBoundingClientRect();
    return {
      closeButtonHeight: round(close.getBoundingClientRect().height),
      ...(header ? { headerHeight: round(header.getBoundingClientRect().height) } : {}),
      ...(content ? { contentHeight: round(content.getBoundingClientRect().height) } : {}),
      panelHeight: round(panel.getBoundingClientRect().height),
      panelWidth: round(panel.getBoundingClientRect().width),
      ...(canvasBox
        ? { canvasHeight: round(canvasBox.height), canvasWidth: round(canvasBox.width) }
        : {}),
    };
  });
}

test('#278 — what a taller dock header costs the canvas', async ({ page }) => {
  test.setTimeout(180_000);
  clearMeasurement('techdebt-278-dock-header-height');

  const stamp = Date.now();
  const orgName = `Dock Header ${stamp}`;

  await page.setViewportSize({ width: 1440, height: 900 });
  await signUp(page, 'Dock Reader', `dock-${stamp}@example.com`);
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page.getByRole('heading', { level: 1, name: orgName })).toBeVisible();

  const orgSlug = /\/orgs\/([^/?#]+)/.exec(page.url())?.[1] ?? '';
  expect(orgSlug).not.toBe('');

  await createHierarchy(page);
  await newPlan(page, `Dock header ${stamp}`);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Excavate', laneIndex: 0, durationDays: 5 }]);
  // A computed plan, so the canvas is in its ordinary state rather than its empty one — the
  // quantity under test is the canvas's height, and an empty plan renders different chrome.
  await recalculate(page, orgSlug);

  // Open the dock. Named by its own accessible name rather than by a testid, so this fails loudly
  // if the entry point is renamed instead of silently measuring the closed workspace.
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Plan notes panel' })).toBeVisible();

  const readings: Record<string, unknown> = {};
  let vacuous = false;
  let canvasMoved = false;

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const before = await read(page);

    // The treatment. `!important` because the utility it replaces is a class of equal specificity
    // and this must win without depending on stylesheet order. Injected under a known id and
    // REMOVED after the reading rather than cleared by a reload — the dock's open state is not
    // URL-backed, so a reload closes the panel and the next width would measure a workspace with
    // no dock in it at all.
    const treatment = await page.addStyleTag({
      content: `button[aria-label="Close plan notes"] { width: ${String(TREATMENT_PX)}px !important; height: ${String(TREATMENT_PX)}px !important; }`,
    });
    await page.waitForTimeout(250);
    const after = await read(page);

    const grew =
      (after.closeButtonHeight ?? 0) > (before.closeButtonHeight ?? 0) &&
      (after.headerHeight ?? 0) > (before.headerHeight ?? 0);
    if (!grew) vacuous = true;

    const canvasDelta = (after.canvasHeight ?? 0) - (before.canvasHeight ?? 0);
    if (Math.abs(canvasDelta) > 1) canvasMoved = true;

    readings[String(width)] = {
      before,
      after,
      headerDelta: Math.round(((after.headerHeight ?? 0) - (before.headerHeight ?? 0)) * 10) / 10,
      contentDelta:
        Math.round(((after.contentHeight ?? 0) - (before.contentHeight ?? 0)) * 10) / 10,
      canvasDelta: Math.round(canvasDelta * 10) / 10,
      treatmentApplied: grew,
    };

    // Strip the treatment so the next width starts from the untreated state, and ASSERT it went —
    // a stylesheet left in place would make every later "before" reading a treated one, and the
    // deltas would then read as zero: a broken probe that looks exactly like a clean result.
    await treatment.evaluate((el: Element) => {
      el.remove();
    });
    await page.waitForTimeout(250);
    const restored = await read(page);
    expect(
      restored.closeButtonHeight,
      `the treatment stylesheet survived the ${String(width)} px reading`,
    ).toBe(before.closeButtonHeight);
  }

  const path = writeMeasurement('techdebt-278-dock-header-height', {
    question: '#278: does a taller dock header cost the canvas, or only the panel?',
    treatment: `close button forced to ${String(TREATMENT_PX)}px (fine-pointer \`icon\`; NOT the 44px coarse floor)`,
    widths: WIDTHS,
    readings,
    verdict: vacuous
      ? 'VOID — the injected treatment did not change the header, so every delta below is about nothing (C0)'
      : canvasMoved
        ? 'CANVAS MOVES — #278 costed this as panel-only and that reading is wrong (C1 failed)'
        : 'PANEL ONLY — the canvas is unchanged at every probed width; the 12 px lands inside the dock (C1 held)',
  });

  // C0 first: a void run must fail rather than report a reassuring zero.
  expect(
    vacuous,
    'the injected treatment never changed the header — the run measures nothing',
  ).toBe(false);
  // eslint-disable-next-line no-console
  console.log(`#278 reading written to ${path}`);
});
