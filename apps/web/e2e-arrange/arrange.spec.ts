import { expect, test } from '@playwright/test';

import {
  createPlan,
  ensurePen,
  lanesByName,
  onboard,
  openProject,
  placeRelativeTo,
  recalculate,
  releasePen,
  seedActivities,
  seedDependency,
  validXerFile,
} from './support';

/**
 * **`Arrange` end to end** (diagram-legibility M-C2), closing `docs/TECH_DEBT.md` #363.
 *
 * That row was raised by grepping every `e2e*` directory for the command and finding **zero
 * files**: it shipped with the canvas and nothing has ever pressed it. So this suite drives the
 * real command against a real API with the pen **enforced**, which is the only place the pen gate
 * and the optimistic-`version` batch can be tested at all — a mocked fetch accepts any version.
 *
 * The offer's precedence lives in `resolveDockStrip`'s unit suite and its sentence in
 * `arrangeOfferMessage`'s; neither can say whether the strip reaches a planner, whether the press
 * writes the rows it promised, or whether a real import leaves it with anything to say.
 */

/** Three bars parked at lanes 0, 4 and 9 — the pack compacts them to 0, 1, 2. */
const SCATTERED = [
  { name: 'Mobilise', laneIndex: 0 },
  { name: 'Excavate', laneIndex: 4 },
  { name: 'Pour', laneIndex: 9 },
];

test('a planner is offered the press, takes it, and the rows are written', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Scattered');
  await ensurePen(page);
  await seedActivities(page, orgSlug, SCATTERED);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  // (1) The offer states what the press would do — the rows, not just that something could move.
  const offer = page.getByTestId('canvas-arrange-offer');
  await expect(offer).toBeVisible();
  await expect(offer).toContainText(
    'Arrange would move 2 activities and draw this plan in 3 rows instead of 10.',
  );

  // (2) Taking it goes through the same confirmation the toolbar opens.
  await offer.getByRole('button', { name: 'Arrange' }).click();
  await page.getByRole('button', { name: 'Auto-arrange' }).click();

  // (3) The rows are asserted against the DATABASE, not the canvas — which is `aria-hidden` and
  //     would only ever say what was painted. This is also the only place the batch's optimistic
  //     `version` check is real.
  await expect
    .poll(async () => lanesByName(page, orgSlug), { timeout: 15_000 })
    .toEqual({ Mobilise: 0, Excavate: 1, Pour: 2 });

  // (4) …and the offer goes, because there is nothing left to offer.
  await expect(offer).toBeHidden();

  // (5) …leaving focus on the diagram, not on <body>. The offer's button unmounts at (4), and a
  //     native <dialog> restores focus on close to whatever held it when `showModal()` ran — so
  //     without the strip handing focus to the listbox BEFORE opening, the dialog returns the
  //     planner to a button that no longer exists. Only a real browser can see this: jsdom has no
  //     top layer and no native focus restoration, so no unit suite here can ask the question.
  //     Focus reaching <body> is WCAG 2.4.3, and on this surface it also silently kills every
  //     keyboard accelerator, which are a React handler on a root <body> is an ancestor of.
  await expect(page.getByRole('listbox', { name: 'Activities in the diagram' })).toBeFocused();
});

test('an already-arranged plan offers nothing, and the command says so without a dialog', async ({
  page,
}) => {
  const stamp = Date.now() + 1;
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Tidy');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Mobilise', laneIndex: 0 },
    { name: 'Excavate', laneIndex: 1 },
    { name: 'Pour', laneIndex: 2 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  await expect(page.getByTestId('canvas-arrange-offer')).toBeHidden();

  // #363's own first item: the early return announces and opens NO dialog, so a planner who
  // presses it anyway is not shown a confirmation that would do nothing.
  //
  // Located by `[data-toolbar-item]` and not by its copy (the ADR-0091 M7 rule): the strip and the
  // command deliberately share the word "Arrange", so a page-wide name locator passes here only
  // because the assertion above happens to have established that the strip is hidden — and would
  // become a strict-mode failure the day this test is copied to a plan that offers the press.
  await page.locator('[data-toolbar-item="auto-arrange"]').click();
  await expect(page.getByRole('button', { name: 'Auto-arrange' })).toHaveCount(0);
});

test('the offer is omitted without the pen, not shaded', async ({ page }) => {
  /**
   * The opposite of how every command on this surface is gated, and deliberately: the strip's whole
   * content is an offer to press a pen-gated command, so shading it leaves a permanently
   * un-actionable notice — the lit-but-inert defect ADR-0059 M6 and ADR-0062 M6 both record.
   *
   * The pen is ENFORCED at the API in this config, so this is the real gate and not a client guess.
   */
  const stamp = Date.now() + 2;
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Gated');
  await ensurePen(page);
  await seedActivities(page, orgSlug, SCATTERED);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  // The pinned positive case, in the same test: without it, "the strip is absent" passes equally
  // against a strip that can never render (ADR-0093's shape).
  await expect(page.getByTestId('canvas-arrange-offer')).toBeVisible();

  await releasePen(page);
  await expect(page.getByTestId('canvas-arrange-offer')).toBeHidden();
});

test('a real .xer import lands with nothing to offer, because phase 3 already packed it', async ({
  page,
}) => {
  /**
   * **The negative control the plan's own step 3 got wrong.** M-C2-T4 first said "an imported plan
   * shows the strip"; M-C0-T3a measured the opposite and the plan is amended. ADR-0069 phase 3
   * packs the lanes inside the import, and `packLanes` is idempotent (pinned in
   * `packages/layout/src/pack-lanes.spec.ts`), so `computeArrangeChanges()` is empty and the offer
   * is correctly silent.
   *
   * On its own this assertion proves nothing — an absence passes against a strip that can never
   * render. It earns its place because the three tests above drive the same strip to appear.
   */
  const stamp = Date.now() + 3;
  await onboard(page, stamp);
  await openProject(page);

  await page.getByRole('button', { name: 'Import from file…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import schedule from file' });
  await dialog.getByLabel('Schedule file (.xer or .xml)').setInputFiles(validXerFile());
  await expect(dialog.getByRole('button', { name: 'Confirm import' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Confirm import' }).click();
  await expect(page).toHaveURL(/\/orgs\/[^/]+\/plans\/[^/]+$/);

  await ensurePen(page);
  await expect(page.getByTestId('canvas-arrange-offer')).toBeHidden();
});

test('a bar placed on top of its predecessor is moved to its own row (reported 2026-09-23)', async ({
  page,
}) => {
  /**
   * **The shape the product owner hit.** `Frame` follows `Found` by logic, so their EARLY spans are
   * end to end and fit one row; `Frame` is then hand-placed three days into `Found`, so the canvas
   * draws them on top of each other. Arrange packed the early spans and so saw nothing to do — the
   * offer never appeared, and a press through the toolbar left both bars in one row.
   *
   * A unit test pins `computeLaneArrangement`; only this can say that the real engine draws the
   * placement where the fix now packs it, because the effective-Visual pass is the server's.
   */
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Placed on top');
  await ensurePen(page);
  const [found, frame] = await seedActivities(page, orgSlug, [
    { name: 'Found', laneIndex: 0, durationDays: 10 },
    { name: 'Frame', laneIndex: 0, durationDays: 10 },
  ]);
  await seedDependency(page, orgSlug, found!.id, frame!.id);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  // No offer yet, and that absence is the control: end to end, the two fit one row.
  await expect(page.getByTestId('canvas-arrange-offer')).toBeHidden();

  await placeRelativeTo(page, orgSlug, 'Frame', 'Found', 3);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  const offer = page.getByTestId('canvas-arrange-offer');
  await expect(offer).toBeVisible();
  await expect(offer).toContainText('draw this plan in 2 rows instead of 1');
  await offer.getByRole('button', { name: 'Arrange' }).click();
  await page.getByRole('button', { name: 'Auto-arrange' }).click();

  await expect
    .poll(
      async () => {
        const lanes = await lanesByName(page, orgSlug);
        return lanes.Found !== lanes.Frame;
      },
      { timeout: 15_000 },
    )
    .toBe(true);
});
