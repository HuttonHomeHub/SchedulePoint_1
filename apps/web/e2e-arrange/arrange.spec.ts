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
 *
 * **Since NetPoint-layout M5** the offer shows when activities overlap in their rows, `Arrange` opens
 * a dialog whose Tidy and Re-layout are worked out in a module worker, and the confirm writes the
 * chosen option's moves as one undo step. The worker is the first in `apps/web`, and this suite is
 * the only thing that runs it: jsdom has none, so every unit suite runs the search in-process.
 */

/** Both start at the data date in one row, so they are drawn on top of each other. */
const OVERLAPPING = [
  { name: 'Mobilise', laneIndex: 0 },
  { name: 'Excavate', laneIndex: 0 },
];

/** Three bars parked at lanes 0, 4 and 9, with nothing overlapping. */
const SCATTERED = [
  { name: 'Mobilise', laneIndex: 0 },
  { name: 'Excavate', laneIndex: 4 },
  { name: 'Pour', laneIndex: 9 },
];

test('a planner is offered the press, takes Tidy, the overlap goes, and one undo restores it', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Overlapping');
  await ensurePen(page);
  await seedActivities(page, orgSlug, OVERLAPPING);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  // (1) The offer states what is wrong, which is a fact, not a result it has not worked out.
  const offer = page.getByTestId('canvas-arrange-offer');
  await expect(offer).toBeVisible();
  await expect(offer).toContainText('2 activities overlap others in their lanes.');

  // (2) The dialog works Tidy out in the worker and shows it before anything is written. The
  //     confirm's name carries the count, so finding it proves the worker returned a result.
  await offer.getByRole('button', { name: 'Arrange…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Arrange the diagram' });
  await expect(dialog.getByRole('radio', { name: 'Tidy' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: /^Tidy: move \d+ activit/ }).click();

  // (3) The rows are asserted against the DATABASE, not the canvas — which is `aria-hidden` and
  //     would only ever say what was painted. This is also the only place the batch's optimistic
  //     `version` check is real.
  await expect
    .poll(
      async () => {
        const lanes = await lanesByName(page, orgSlug);
        return lanes.Mobilise !== lanes.Excavate;
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  // (4) …and the offer goes, because nothing overlaps any more.
  await expect(offer).toBeHidden();

  // (5) …leaving focus on the diagram, not on <body>. The offer's button unmounts at (4), and a
  //     native <dialog> restores focus on close to whatever held it when `showModal()` ran — so
  //     without the strip handing focus to the listbox BEFORE opening, the dialog returns the
  //     planner to a button that no longer exists. Only a real browser can see this: jsdom has no
  //     top layer and no native focus restoration, so no unit suite here can ask the question.
  //     Focus reaching <body> is WCAG 2.4.3, and on this surface it also silently kills every
  //     keyboard accelerator, which are a React handler on a root <body> is an ancestor of.
  await expect(page.getByRole('listbox', { name: 'Activities in the diagram' })).toBeFocused();

  // (6) One undo restores both rows: the whole arrange is one step.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lanesByName(page, orgSlug), { timeout: 15_000 })
    .toEqual({ Mobilise: 0, Excavate: 0 });
});

test('Re-layout packs scattered rows, and one undo puts them back', async ({ page }) => {
  const stamp = Date.now() + 4;
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'Scattered');
  await ensurePen(page);
  await seedActivities(page, orgSlug, SCATTERED);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  // Nothing overlaps, so there is no offer: rows a pack would change are not a defect.
  await expect(page.getByTestId('canvas-arrange-offer')).toBeHidden();

  await page.locator('[data-toolbar-item="auto-arrange"]').click();
  const dialog = page.getByRole('dialog', { name: 'Arrange the diagram' });
  await dialog.getByRole('radio', { name: 'Re-layout' }).click();
  await dialog.getByRole('button', { name: /^Re-layout: move \d+ activit/ }).click();

  // All three start at the data date, so they need three rows; the pack uses the first three.
  await expect
    .poll(async () => Object.values(await lanesByName(page, orgSlug)).sort((a, b) => a - b), {
      timeout: 20_000,
    })
    .toEqual([0, 1, 2]);

  await expect(page.getByRole('listbox', { name: 'Activities in the diagram' })).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => lanesByName(page, orgSlug), { timeout: 15_000 })
    .toEqual({ Mobilise: 0, Excavate: 4, Pour: 9 });
});

test('an already-arranged plan opens the dialog and says there is nothing to move', async ({
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

  // Located by `[data-toolbar-item]` and not by its copy (the ADR-0091 M7 rule): the strip and the
  // command deliberately share the word "Arrange".
  //
  // This used to announce and open NO dialog, because the pack was instant. Tidy is a search that
  // takes seconds and can improve rows the pack would leave alone, so only the search can say there
  // is nothing to do: the dialog opens while it works, then says so once, and writes nothing.
  await page.locator('[data-toolbar-item="auto-arrange"]').click();
  const dialog = page.getByRole('dialog', { name: 'Arrange the diagram' });
  await expect(dialog.getByRole('status')).toHaveText(
    'Already arranged: neither option would move anything.',
    { timeout: 20_000 },
  );
  await expect(dialog.getByRole('button', { name: 'Tidy' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  // Cancel returns the planner to the diagram too, not to the toolbar button that opened it.
  await expect(page.getByRole('listbox', { name: 'Activities in the diagram' })).toBeFocused();
  expect(await lanesByName(page, orgSlug)).toEqual({ Mobilise: 0, Excavate: 1, Pour: 2 });
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
  await seedActivities(page, orgSlug, OVERLAPPING);
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
   * packs the lanes inside the import, so no two activities share a row in time, and since
   * NetPoint-layout M5 the offer shows only on an overlap: it is correctly silent. The predicate
   * changed in that milestone and this assertion did not need to, which the M5 record states.
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
  await expect(offer).toContainText('2 activities overlap others in their lanes.');
  await offer.getByRole('button', { name: 'Arrange…' }).click();
  await page
    .getByRole('dialog', { name: 'Arrange the diagram' })
    .getByRole('button', { name: /^Tidy: move \d+ activit/ })
    .click();

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
