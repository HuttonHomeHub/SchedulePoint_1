import AxeBuilder from '@axe-core/playwright';

import {
  apiActivities,
  apiDependencies as apiDependenciesShared,
  diagramList,
  seedActivities,
  seedLink,
  selectByName,
  selectedActivityId,
} from '../e2e-copy-paste/support';
import { ganttGrid, ganttRow, showGantt } from '../e2e-gantt/support';
import { expect, test } from '../e2e-support/test';

import {
  addLink,
  apiChangeLag,
  apiDependencies,
  drawTask,
  onboard,
  openLogic,
  openNewPlan,
  showActivities,
  startEditing,
} from './support';

/**
 * Flag-ON **undo / redo** journey (ADR-0048 M3) — the user-visible surface over the
 * canvas-first authoring workspace. Proves the whole reversible-edit loop runs in a real browser:
 *
 * 1. A planner takes the pen and draws two tasks; the schedule auto-recalcs (M1/M2 recording seam).
 * 2. The toolbar **Undo** button reverses the last create (an activity disappears) and it's announced.
 * 3. **Ctrl+Z** (the keybinding) reverses the next create — keyboard parity for undo.
 * 4. The toolbar **Redo** button re-applies a create (the activity comes back) and it's announced.
 * 5. An axe pass over the authoring toolbar — the surface hosting the new controls stays WCAG 2.2 AA.
 *
 * Serial + wide viewport (the suite mutates one shared plan); Chromium only (TECH_DEBT #25a).
 */
test('a planner undoes and redoes canvas edits with the toolbar and the keyboard', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();

  // Take the pen — the Row 2 · Do authoring cluster (Add split-button, Undo/Redo) lights up.
  await startEditing(page);
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const announcer = page.getByTestId('announcer');

  // Draw two tasks; the first draw silently sets the plan start and the schedule auto-recalcs, so each
  // bar plots on its own (no Recalculate click).
  await drawTask(page, 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Foundations', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // With the pen held and a history, Undo/Redo are real controls (names reflect the pending step).
  const undoBtn = toolbar.getByRole('button', { name: /^Undo\b/ });
  const redoBtn = toolbar.getByRole('button', { name: /^Redo\b/ });
  await expect(undoBtn).toBeVisible();
  await expect(redoBtn).toBeVisible();

  // (2) Toolbar Undo reverses the last create — "Foundations" is removed and the undo is announced.
  await undoBtn.click();
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await expect(announcer).toContainText(/Undid/i);

  // (3) Ctrl+Z reverses the next create — keyboard parity. Focus a workspace control first so the
  // scoped keydown listener (attached to the workspace root) receives it, then press the accelerator.
  await undoBtn.focus();
  await page.keyboard.press('Control+z');
  await expect(diagram.getByRole('option')).toHaveCount(0, { timeout: 15_000 });

  // (4) Toolbar Redo re-applies a create — an activity comes back and the redo is announced.
  await redoBtn.click();
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await expect(announcer).toContainText(/Redid/i);

  // (5) The authoring toolbar hosting the undo/redo controls is accessible.
  const results = await new AxeBuilder({ page })
    .include('[role="toolbar"][aria-label="Plan commands"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

/**
 * **An Edit-link save is undoable** (`docs/TECH_DEBT.md` #65).
 *
 * The third way a link changes was the only one that recorded nothing, so `Shift+←/→` on a link was
 * undoable and typing into the same link's lag field was not — from one panel, one row apart.
 *
 * The assertion reads the lag back **from the REST API**, not from the field. That is not belt and
 * braces: the inverse's whole job is to restore the *stored* value, `lagDays` is rounded from
 * minutes, and the sub-day control degrades to whole days when it cannot resolve a working-hours
 * factor — so a DOM assertion would pass against an inverse that had written the rounded number,
 * which is exactly the defect the command was built to avoid.
 *
 * Its own test, not a case appended to the one above: that spec ends with zero activities and one
 * redo, and reusing its plan would make a failure here ambiguous about which edit was reversed.
 */
test('a planner undoes an Edit-link save, and the stored lag comes back exactly', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await drawTask(page, 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Foundations', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // One link, Excavate → Foundations, with a two-day lag.
  await openLogic(page, 'Excavate');
  await addLink(page, 'Foundations', '2d');
  await expect.poll(async () => (await apiDependencies(page)).length, { timeout: 15_000 }).toBe(1);
  const created = (await apiDependencies(page))[0]!;
  const originalLag = created.lagMinutes;
  expect(originalLag).toBeGreaterThan(0);

  // Edit that link's lag through the dialog — the surface that recorded nothing.
  await page.getByRole('button', { name: /^Edit link to Foundations$/ }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit dependency' });
  await editDialog.getByLabel(/^Lag \(/).fill('5d');
  await editDialog.getByRole('button', { name: /^Save/ }).click();
  await expect(editDialog).toBeHidden();
  await expect
    .poll(async () => (await apiDependencies(page))[0]?.lagMinutes, { timeout: 15_000 })
    .not.toBe(originalLag);

  // **Close the editor before undoing, and that is a fact about the product, not a tidy-up.** The
  // Logic tab lives in the tabbed activity editor, which is a modal `<dialog>` — so while it is
  // open everything behind it is in the browser's top layer and inert (ADR-0108 records exactly
  // this about the same component). The first version of this test skipped the close, focused the
  // Undo button through the modal, pressed Ctrl+Z, and read back the EDITED lag: the accelerator
  // never reached the workspace handler. It failed as a wrong value rather than a missing element,
  // which is why only a real browser could have found it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();

  // Ctrl+Z restores it. The accelerator is a React handler on the workspace root, so focus must be
  // inside the workspace first — the same requirement the spec above records for its own undo.
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const undoBtn = toolbar.getByRole('button', { name: /^Undo\b/ });
  await undoBtn.focus();
  await page.keyboard.press('Control+z');

  await expect
    .poll(async () => (await apiDependencies(page))[0]?.lagMinutes, { timeout: 15_000 })
    .toBe(originalLag);
  // And the link itself survived: an inverse that deleted and re-created it would also satisfy the
  // lag assertion while handing the row a new id.
  expect((await apiDependencies(page))[0]?.id).toBe(created.id);
});

/**
 * **Deleting a WBS phase is one undo step** (`docs/TECH_DEBT.md` #230, ADR-0048 M2 amended by its
 * own M4).
 *
 * Until this milestone the client **cleared the whole history** after a cascade delete, so a
 * planner who removed a phase lost not only the ability to undo that but every earlier edit of the
 * session too. The reason ADR-0048 gave had lapsed: the inverse is no longer a re-create, it is
 * `POST …/activities/restore-batch/:batchId`, and a cascade stamps ONE batch across the subtree.
 *
 * **Only a journey can prove this.** Every mutation in the unit suites is a `vi.fn()`, so the pen
 * (ADR-0028), the optimistic `version` and — the one that matters here — the server's
 * parent-active guard are invisible to them. A restore the server refused with 409
 * `PARENT_DELETED` would look identical to a successful one at that level.
 *
 * It asserts through the **REST API**, not the DOM: the subject is what was *stored*, and a DOM
 * assertion would pass against a restore that brought the bars back and lost the links.
 */
test('a planner undoes deleting a WBS phase, and the earlier edits are still undoable', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  // A phase with three members, one link inside it, and one crossing its boundary. The crossing
  // link is the sharper case: both its endpoints are live again after the restore, so the endpoint
  // guard must reactivate it too.
  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Substructure', type: 'WBS_SUMMARY' },
    { name: 'Excavate', parentOf: 0 },
    { name: 'Pour slab', parentOf: 0 },
    { name: 'Cure', parentOf: 0 },
    { name: 'Site setup' },
  ]);
  const byName = new Map(seeded.map((a) => [a.name, a.id]));
  const inside = byName.get('Excavate');
  const alsoInside = byName.get('Pour slab');
  const outside = byName.get('Site setup');
  if (!inside || !alsoInside || !outside) throw new Error('seeding did not return the fixture');
  await seedLink(page, orgSlug, inside, alsoInside);
  await seedLink(page, orgSlug, outside, inside);

  const before = {
    activities: (await apiActivities(page, orgSlug)).length,
    links: (await apiDependenciesShared(page, orgSlug)).length,
  };
  expect(before.activities).toBe(5);
  expect(before.links).toBe(2);

  // An earlier, unrelated edit — this is what the truncation used to destroy, and a count
  // assertion on the delete alone cannot see it.
  await drawTask(page, 'Snagging', { x: 420, y: 240 });
  await expect(page.getByRole('option', { name: /Snagging/ })).toHaveCount(1, { timeout: 15_000 });

  await test.step('deleting the phase takes its whole subtree', async () => {
    await showActivities(page);
    await page.getByRole('button', { name: 'Actions for Substructure' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    // `alertdialog`, not `dialog` — the confirm is a destructive-action prompt. Its own copy
    // already tells the planner "You can restore them together later", which the truncation this
    // milestone removes made false on this one surface.
    const confirm = page.getByRole('alertdialog', { name: 'Delete activity' });
    await expect(confirm).toContainText('3 activities below it');
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect
      .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
      .toBe(before.activities + 1 - 4); // + Snagging, − the phase and its three members
  });

  await test.step('one Ctrl+Z brings the phase, its work and its links back', async () => {
    // Focus a workspace control first: the accelerator is a React `onKeyDown` on the workspace
    // root, so a keystroke from `<body>` never reaches it.
    await page.getByRole('button', { name: /^Undo\b/ }).focus();
    await page.keyboard.press('Control+z');

    // 20 s, not the default 5: a restore, a recalculation and a refetch outrun Playwright's poll
    // (ADR-0080's retrospective records exactly this).
    await expect
      .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
      .toBe(before.activities + 1);

    const restored = await apiActivities(page, orgSlug);
    // Id-stable, and the nesting comes back — not just the rows.
    expect(restored.map((a) => a.id)).toEqual(expect.arrayContaining([...byName.values()]));
    const members = restored.filter((a) => a.parentId === byName.get('Substructure'));
    expect(members.map((a) => a.name).sort()).toEqual(['Cure', 'Excavate', 'Pour slab']);

    // BOTH links: the one wholly inside the subtree, and the one crossing its boundary.
    const links = await apiDependenciesShared(page, orgSlug);
    expect(links).toHaveLength(before.links);
    expect(
      links.some((l) => l.predecessorId === inside && l.successorId === alsoInside),
      'the link inside the phase did not come back',
    ).toBe(true);
    expect(
      links.some((l) => l.predecessorId === outside && l.successorId === inside),
      'the link crossing the phase boundary did not come back',
    ).toBe(true);
  });

  await test.step('the history was not truncated — the earlier edit is still undoable', async () => {
    // **This is the actual subject of #230**, and no count assertion above can see it: the phase
    // could come back perfectly while the rest of the session's history had been thrown away.
    const undo = page.getByRole('button', { name: /^Undo\b/ });
    await expect(undo).toBeEnabled();
    await undo.focus();
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
      .toBe(before.activities);
    expect((await apiActivities(page, orgSlug)).some((a) => a.name === 'Snagging')).toBe(false);
  });
});

/**
 * **The spec's "ancestor is gone" alternate flow, driven** (`docs/specs/cascade-undo/`
 * feature-spec §"Alternate — the ancestor is gone", M2-T2 step 4).
 *
 * That flow reads: delete phase `A` on the canvas, delete `A`'s parent `P` from the activities
 * panel, press Undo, and be refused with 409 `PARENT_DELETED`. This drives exactly that, because
 * the plan's own instruction was to **establish** whether it is reachable rather than assume it —
 * and if the linear stack makes it unreachable, to say so instead of inventing a route.
 *
 * **It does not happen, and this test is the evidence.** Both undos succeed. The stack is linear
 * and last-in-first-out, and a cascade delete resolves its subtree with `deletedAt: null`
 * (`hierarchy-lifecycle.service.ts`, `resolveActivitySubtree`) — so deleting `P` after `A` does not
 * sweep `A` into `P`'s batch, `P`'s delete is recorded last, and Undo therefore restores `P`
 * BEFORE `A`. The parent is always active again by the time the child's restore runs.
 *
 * The spec's flow was reachable when it was written, for one reason it names: the activities panel
 * recorded nothing, so `P`'s delete never entered the stack and Undo popped `A`'s. **The product
 * owner's CQ-3 answer — that the panel is in scope — closed that route**, which the plan's own
 * M2-T2 risk note predicted in as many words. Every delete surface now records: the canvas and the
 * Gantt through `ActivityCrudDialogs`, the panel through this milestone.
 *
 * So the refusal is not dead code, but it is not reachable from one pen session either: it needs a
 * stack that predates somebody else's delete — a stale tab, or a pen hand-off. That is why its
 * message is pinned by a unit test of `handleFailure` rather than by a step here.
 */
test('deleting a phase and then its parent undoes in the order it was done', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Structure', type: 'WBS_SUMMARY' },
    { name: 'Substructure', type: 'WBS_SUMMARY', parentOf: 0 },
    { name: 'Excavate', parentOf: 1 },
    { name: 'Site setup' },
  ]);
  expect(seeded).toHaveLength(4);
  const before = (await apiActivities(page, orgSlug)).length;

  await showActivities(page);
  const deletePhase = async (name: string): Promise<void> => {
    await page.getByRole('button', { name: `Actions for ${name}` }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('alertdialog', { name: 'Delete activity' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  };

  // The child phase first, then its parent — the spec's alternate flow, in its order.
  await deletePhase('Substructure');
  await expect
    .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
    .toBe(before - 2); // Substructure + Excavate
  await deletePhase('Structure');
  await expect
    .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
    .toBe(before - 3);

  // First Undo restores the PARENT, because the stack is linear and last-in-first-out — the
  // parent's delete was recorded last.
  await page.getByRole('button', { name: /^Undo\b/ }).focus();
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
    .toBe(before - 2);

  // Second Undo restores the child phase and its work, under a parent that is active again.
  await page.getByRole('button', { name: /^Undo\b/ }).focus();
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
    .toBe(before);

  const restored = await apiActivities(page, orgSlug);
  const structure = restored.find((a) => a.name === 'Structure');
  const substructure = restored.find((a) => a.name === 'Substructure');
  expect(substructure?.parentId).toBe(structure?.id);
  expect(restored.find((a) => a.name === 'Excavate')?.parentId).toBe(substructure?.id);
});

/**
 * **A sighted planner sees what undo did** (undo-redo M1, spec US-1) — in the diagram AND the Gantt.
 *
 * Until now the only message an undo produced went to the live region, so a planner who could see
 * the screen got nothing: no confirmation, no way to take it back, and — pressing `Ctrl+Z` without
 * the right to edit — no reason it did nothing. This drives the whole loop in a real browser:
 *
 * 1. Undo from the toolbar → the dock strip says what was undone and offers **Redo**.
 * 2. That Redo → the strip says what was redone and offers **Undo**.
 * 3. In the **Gantt**, `Ctrl+Z` → the same strip, in the other host's dock.
 * 4. With the Late-start overlay on (editing paused), `Ctrl+Z` → the strip states the refusal,
 *    as an alert, instead of doing nothing.
 * 5. axe over the strip, in its refusal state.
 *
 * The no-pen variant of step 4's sentence is M2's journey: until M2 relaxes M0-T1, releasing the pen
 * empties the history, so there is nothing for a pen-less press to refuse.
 */
test('a planner sees what undo and redo did, in the diagram and the Gantt', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const strip = page.getByTestId('canvas-history-result');

  await drawTask(page, 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Foundations', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // (1) Undo → the strip names the step, in the activity's own capitalisation, with a Redo button.
  const undoBtn = toolbar.getByRole('button', { name: /^Undo\b/ });
  await expect(undoBtn).toHaveAccessibleName('Undo add “Foundations”');
  await undoBtn.click();
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await expect(strip).toContainText('Undid add “Foundations”.');
  // Success is not a live region of its own: the announcer said it once already.
  await expect(strip).not.toHaveAttribute('role', 'alert');

  // (2) The strip's Redo is the same step coming back, and the strip then offers the opposite.
  await strip.getByRole('button', { name: 'Redo' }).click();
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });
  await expect(strip).toContainText('Redid add “Foundations”.');
  await expect(strip.getByRole('button', { name: 'Undo' })).toBeVisible();

  // (3) The Gantt's dock carries the same strip — the one-host-and-not-its-neighbour defect this
  // repository has recorded repeatedly. Focus a row first so the workspace root's handler hears it.
  await showGantt(page);
  await ganttGrid(page).getByRole('row').nth(1).focus();
  await page.keyboard.press('Control+z');
  await expect(strip).toBeVisible({ timeout: 15_000 });
  await expect(strip).toContainText('Undid add “Foundations”.');

  // (4) Paused editing is a reason, not a silent key. The overlay is read-only analysis, so the pen
  // is still held and the history is intact — which is exactly when a silent Ctrl+Z misleads.
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Late-start overlay' }).check();
  await page.keyboard.press('Escape');
  await ganttGrid(page).getByRole('row').nth(1).focus();
  await page.keyboard.press('Control+z');
  const refusal = page.getByRole('alert').filter({ hasText: /Late-start overlay is on/ });
  await expect(refusal).toBeVisible();
  await expect(refusal).toContainText('to undo');

  // (5) The strip, in its alert state, is accessible.
  const results = await new AxeBuilder({ page })
    .include('[data-testid="canvas-history-result"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});

/**
 * **Undo never jams** (undo-redo M2, ADR-0176) — a step that cannot apply is explained and set
 * aside, and the next press carries on with the one beneath it.
 *
 * The defect was a dead end: one refused step stayed on top of the stack, so every earlier step was
 * unreachable until a reload (which also destroyed the history). The sequence below makes the top
 * step impossible the way it happens in real use — somebody else changes the link **through the API**
 * after the planner's own edit, so nothing on the client recorded it — and then checks two things a
 * unit suite cannot: that nothing was written over their change, and that the earlier step still
 * undoes in the same session.
 *
 * It asserts through the REST API, not the DOM: the subject is what was *stored*, and "the strip said
 * so" would pass against an undo that had also overwritten the colleague's value.
 */
test('an undo that cannot apply is set aside and explained, and the next undo carries on', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const strip = page.getByTestId('canvas-history-result');

  await drawTask(page, 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Foundations', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // Two recorded steps on one link: it is added, then its lag is edited through the dialog.
  await openLogic(page, 'Excavate');
  await addLink(page, 'Foundations', '2d');
  await expect.poll(async () => (await apiDependencies(page)).length, { timeout: 15_000 }).toBe(1);
  const link = (await apiDependencies(page))[0]!;
  await page.getByRole('button', { name: /^Edit link to Foundations$/ }).click();
  const editDialog = page.getByRole('dialog', { name: 'Edit dependency' });
  await editDialog.getByLabel(/^Lag \(/).fill('5d');
  await editDialog.getByRole('button', { name: /^Save/ }).click();
  await expect(editDialog).toBeHidden();
  await expect
    .poll(async () => (await apiDependencies(page))[0]?.lagMinutes, { timeout: 15_000 })
    .not.toBe(link.lagMinutes);
  // The editor is a modal `<dialog>`: close it, or the accelerator never reaches the workspace.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeHidden();

  // Somebody else changes the lag behind the planner's back — nothing on the client recorded it.
  const theirs = 12_345;
  await apiChangeLag(page, link.id, theirs);

  await test.step('the refused step is explained, and nothing is written over their change', async () => {
    const undoBtn = toolbar.getByRole('button', { name: /^Undo\b/ });
    await undoBtn.focus();
    await page.keyboard.press('Control+z');
    await expect(strip).toBeVisible({ timeout: 15_000 });
    // A refusal is an event the planner must see: an alert, in words that name the link, say that
    // the step was skipped, and say what the next press will run.
    await expect(strip).toHaveAttribute('role', 'alert');
    await expect(strip).toContainText('was changed after your edit');
    await expect(strip).toContainText('so that step was skipped');
    await expect(strip).toContainText('Undo again to continue with add link');
    expect((await apiDependencies(page))[0]?.lagMinutes).toBe(theirs);
  });

  await test.step('the link they changed is not removed either — and the stack still does not jam', async () => {
    // Removing the link would discard their lag just as surely as restoring the old one would, so
    // undoing its creation is set aside too, with the same explanation.
    await toolbar.getByRole('button', { name: /^Undo\b/ }).click();
    await expect(strip).toContainText('Couldn’t undo add link', { timeout: 15_000 });
    await expect(strip).toContainText('Undo again to continue with add “Foundations”');
    expect((await apiDependencies(page))[0]?.lagMinutes).toBe(theirs);
  });

  await test.step('removing an activity would take their link with it, so that is skipped too', async () => {
    // Deleting "Foundations" cascades the link a colleague has since changed, so the step that
    // added it is skipped rather than deleting somebody else's logic. Nothing is lost: both bars
    // and the link are exactly as they were, and the history still moves on one step per press.
    await toolbar.getByRole('button', { name: /^Undo\b/ }).click();
    await expect(strip).toContainText('Couldn’t undo add “Foundations”', { timeout: 15_000 });
    await expect(strip).toContainText('Undo again to continue with add “Excavate”');
    await expect(diagram.getByRole('option')).toHaveCount(2);
    expect((await apiDependencies(page))[0]?.lagMinutes).toBe(theirs);
  });
});

/**
 * **History survives a pen hand-off** (undo-redo M2, ADR-0176 D4).
 *
 * Releasing the pen used to leave the stack in place but unguarded, and the plan briefly called for
 * clearing it. Neither is right: the history belongs to the page session, and what makes it safe to
 * keep is that every step is checked against the server before it writes. So after a release the
 * controls are shaded and Ctrl+Z says why instead of doing nothing, and once the pen is taken again
 * the same step undoes.
 */
test('undo history survives releasing and retaking the edit lock', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const strip = page.getByTestId('canvas-history-result');

  await drawTask(page, 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Foundations', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();

  // Without the pen the step is still there, and the key says why it is not running.
  await toolbar.getByRole('button', { name: /^Undo\b/ }).focus();
  await page.keyboard.press('Control+z');
  await expect(strip).toContainText(/to undo/i);
  await expect(diagram.getByRole('option')).toHaveCount(2);

  await startEditing(page);
  await toolbar.getByRole('button', { name: /^Undo\b/ }).click();
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await expect(strip).toContainText('Undid add “Foundations”.');
});

/**
 * **An activity added from a dialog is one undo step** (undo-redo M3, spec §2.1).
 *
 * `ActivityCreateDialog` has two hosts — the panel's **New activity** and the Gantt's **Insert
 * activity below** — and neither passed a recorder, so an activity added from either was the one edit
 * in the plan that Undo skipped. The canvas's draw was recorded all along, which is why nothing
 * looked wrong until somebody added a bar from a dialog and pressed Ctrl+Z.
 *
 * The assertions are **through the REST API, by id**: redo is a restore of the delete's batch, not a
 * re-create, so the same row has to come back under the same id — a DOM assertion would pass against
 * a redo that quietly minted a new one, which strands every later step that names the old id.
 */
test('an activity added from either dialog is one undo step, and redo brings the same row back', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);
  await seedActivities(page, orgSlug, [{ name: 'Excavate' }]);

  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const undoBtn = toolbar.getByRole('button', { name: /^Undo\b/ });
  const redoBtn = toolbar.getByRole('button', { name: /^Redo\b/ });
  const idOf = async (name: string): Promise<string | undefined> =>
    (await apiActivities(page, orgSlug)).find((a) => a.name === name)?.id;

  await test.step('the panel’s New activity', async () => {
    await showActivities(page);
    await page.getByRole('button', { name: 'New activity' }).click();
    const dialog = page.getByRole('dialog', { name: 'New activity' });
    await dialog.getByLabel('Name').fill('Backfill');
    await dialog.getByRole('button', { name: 'Create activity' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => idOf('Backfill'), { timeout: 20_000 }).toBeTruthy();
    const created = await idOf('Backfill');

    await expect(undoBtn).toHaveAccessibleName('Undo add “Backfill”');
    await undoBtn.click();
    await expect.poll(() => idOf('Backfill'), { timeout: 20_000 }).toBeUndefined();

    await redoBtn.click();
    await expect.poll(() => idOf('Backfill'), { timeout: 20_000 }).toBe(created);
  });

  await test.step('the Gantt’s Insert activity below', async () => {
    await showGantt(page);
    await ganttRow(page, 'Excavate')
      .getByRole('button', { name: /^Actions for/ })
      .click();
    await page.getByRole('menuitem', { name: 'Insert activity below' }).click();
    const dialog = page.getByRole('dialog', { name: 'New activity' });
    await dialog.getByLabel('Name').fill('Inserted');
    await dialog.getByRole('button', { name: 'Create activity' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(() => idOf('Inserted'), { timeout: 20_000 }).toBeTruthy();
    const created = await idOf('Inserted');

    await expect(undoBtn).toHaveAccessibleName('Undo add “Inserted”');
    await undoBtn.click();
    await expect.poll(() => idOf('Inserted'), { timeout: 20_000 }).toBeUndefined();

    await redoBtn.click();
    await expect.poll(() => idOf('Inserted'), { timeout: 20_000 }).toBe(created);
    // Backfill, put back by the redo above, was not disturbed by either step.
    expect(await idOf('Backfill')).toBeTruthy();
  });
});

/**
 * **Indent and Outdent are undoable** (undo-redo M3, spec §2.1).
 *
 * The Gantt row menu's structure edits wrote through `useUpdateActivityParents` and told the history
 * nothing, so a planner who indented a row and pressed Ctrl+Z got nothing — in the one place the
 * gesture exists. Both directions are driven, and the parent is read back through the API: the
 * reparent batch carries each row's `version`, so an undo that sent a stale one would be refused
 * rather than half-applied, which only a real server can show.
 */
test('Indent and Outdent in the Gantt are each undone and redone', async ({ page }) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);
  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Phase A', type: 'WBS_SUMMARY' },
    { name: 'Excavate' },
  ]);
  const phase = seeded.find((a) => a.name === 'Phase A')?.id;
  if (!phase) throw new Error('seeding did not return the summary');
  const parentOf = async (): Promise<string | null | undefined> =>
    (await apiActivities(page, orgSlug)).find((a) => a.name === 'Excavate')?.parentId;

  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const undoBtn = toolbar.getByRole('button', { name: /^Undo\b/ });
  const redoBtn = toolbar.getByRole('button', { name: /^Redo\b/ });

  await showGantt(page);
  const menuItem = async (name: 'Indent' | 'Outdent'): Promise<void> => {
    await ganttRow(page, 'Excavate')
      .getByRole('button', { name: /^Actions for/ })
      .click();
    await page.getByRole('menuitem', { name }).click();
  };

  await test.step('Indent files the row under the summary above it, and Undo returns it', async () => {
    await menuItem('Indent');
    await expect.poll(parentOf, { timeout: 20_000 }).toBe(phase);

    await expect(undoBtn).toHaveAccessibleName('Undo move “Excavate” under “Phase A”');
    await undoBtn.click();
    await expect.poll(parentOf, { timeout: 20_000 }).toBeNull();

    await redoBtn.click();
    await expect.poll(parentOf, { timeout: 20_000 }).toBe(phase);
  });

  await test.step('Outdent takes it back to the top level, and Undo files it again', async () => {
    await menuItem('Outdent');
    await expect.poll(parentOf, { timeout: 20_000 }).toBeNull();

    await expect(undoBtn).toHaveAccessibleName('Undo move “Excavate” to the top level');
    await undoBtn.click();
    await expect.poll(parentOf, { timeout: 20_000 }).toBe(phase);
  });
});

/**
 * **Dissolving a summary is one undo step, and it no longer wipes the history** (undo-redo M6).
 *
 * Dissolve used to **truncate** the whole history because the client had no inverse: a restore brings
 * back the summary alone, and the promotion of its children is not undone with it. The server now
 * answers with the batch the summary went in, so Undo is the id-stable restore plus a `parentId`-only
 * re-file of the children.
 *
 * Asserted through the **REST API**, not the DOM: the subject is what was stored — the same summary id,
 * and each child's `parentId` — and a table that merely re-rendered would pass against an undo that
 * brought back a NEW summary or left the children at the top level. The second Undo is the other half
 * of the subject: an earlier edit that the old truncation destroyed is still there to reverse.
 */
test('a planner undoes dissolving a summary, and the earlier edit is still undoable', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Substructure', type: 'WBS_SUMMARY' },
    { name: 'Excavate', parentOf: 0 },
    { name: 'Pour slab', parentOf: 0 },
  ]);
  const summaryId = seeded.find((a) => a.name === 'Substructure')?.id;
  if (!summaryId) throw new Error('seeding did not return the summary');
  const summaryExists = async (): Promise<boolean> =>
    (await apiActivities(page, orgSlug)).some((a) => a.id === summaryId);
  const parentOf = async (name: string): Promise<string | null | undefined> =>
    (await apiActivities(page, orgSlug)).find((a) => a.name === name)?.parentId;
  const undo = page
    .getByRole('toolbar', { name: 'Plan commands' })
    .getByRole('button', { name: /^Undo\b/ });

  // The edit the truncation used to destroy — a count assertion on the dissolve alone cannot see it.
  await drawTask(page, 'Snagging', { x: 420, y: 240 });
  await expect(page.getByRole('option', { name: /Snagging/ })).toHaveCount(1, { timeout: 15_000 });

  await test.step('Dissolve removes the summary and promotes its work', async () => {
    await showActivities(page);
    await page.getByRole('button', { name: 'Actions for Substructure' }).click();
    await page.getByRole('menuitem', { name: 'Dissolve' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Dissolve summary' });
    await confirm.getByRole('button', { name: 'Dissolve' }).click();
    await expect(confirm).toBeHidden();
    await expect.poll(summaryExists, { timeout: 20_000 }).toBe(false);
    expect(await parentOf('Excavate')).toBeNull();
  });

  await test.step('Undo brings the same summary back with its children filed under it', async () => {
    await expect(undo).toHaveAccessibleName('Undo dissolve “Substructure”');
    await undo.click();
    await expect.poll(summaryExists, { timeout: 20_000 }).toBe(true);
    await expect.poll(() => parentOf('Excavate'), { timeout: 20_000 }).toBe(summaryId);
    expect(await parentOf('Pour slab')).toBe(summaryId);
  });

  await test.step('the history survived — the next Undo reverses the earlier edit', async () => {
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect
      .poll(async () => (await apiActivities(page, orgSlug)).some((a) => a.name === 'Snagging'), {
        timeout: 20_000,
      })
      .toBe(false);
  });
});

/**
 * **Undo shows you where** (undo-redo M4) — after an applied undo or redo the activity it changed is
 * selected and brought into view, in the Gantt and in the diagram, and keyboard focus stays on the
 * control that was pressed.
 *
 * The subject is made hard to find on purpose: a phase and the bar filed under it sit at the top of
 * a sixty-row plan and the Gantt is scrolled to the bottom before Undo. A selection alone scrolls
 * nothing there (the Gantt's reveal hangs off its own prop), so the row being in the viewport is the
 * assertion that says the reveal reached the grid and not only the selection state. In the diagram
 * the proof is the selection moving onto the changed bar from a different one. Both presses are the
 * toolbar's, and both then check the button still holds focus: a reveal that pulled the planner into
 * the diagram would pass every assertion above it and break the next keystroke.
 */
test('an undo or redo selects the activity it changed and brings it into view', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);
  const fillers = Array.from({ length: 60 }, (_, i) => ({
    name: `Filler ${String(i + 1).padStart(2, '0')}`,
  }));
  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Phase A', type: 'WBS_SUMMARY' },
    { name: 'Excavate' },
    ...fillers,
  ]);
  const excavate = seeded.find((a) => a.name === 'Excavate')?.id;
  if (!excavate) throw new Error('seeding did not return Excavate');

  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const undoBtn = toolbar.getByRole('button', { name: /^Undo\b/ });
  const redoBtn = toolbar.getByRole('button', { name: /^Redo\b/ });

  await test.step('Gantt: the row is selected and scrolled into view, and focus stays on Undo', async () => {
    await showGantt(page);
    await ganttRow(page, 'Excavate')
      .getByRole('button', { name: /^Actions for/ })
      .click();
    await page.getByRole('menuitem', { name: 'Indent' }).click();
    await expect(undoBtn).toHaveAccessibleName('Undo move “Excavate” under “Phase A”');

    // Scroll whichever ancestor of the grid is the scroller to its end, so the row is far away.
    const scrolled = await ganttGrid(page).evaluate((el) => {
      let node: Element | null = el;
      while (node && node.scrollHeight <= node.clientHeight + 1) node = node.parentElement;
      if (!node) return 0;
      node.scrollTop = node.scrollHeight;
      return node.scrollTop;
    });
    expect(scrolled).toBeGreaterThan(0);

    await undoBtn.focus();
    await undoBtn.click();
    const row = ganttRow(page, 'Excavate');
    await expect(row).toBeInViewport({ timeout: 15_000 });
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await expect(undoBtn).toBeFocused();
  });

  await test.step('Diagram: Redo moves the selection onto the bar it changed, and focus stays on Redo', async () => {
    await page.getByRole('button', { name: 'Diagram', exact: true }).click();
    await selectByName(page, 'Filler 01');
    expect(await selectedActivityId(page)).not.toBe(excavate);

    await redoBtn.focus();
    await redoBtn.click();
    await expect.poll(() => selectedActivityId(page), { timeout: 15_000 }).toBe(excavate);
    await expect(redoBtn).toBeFocused();
    await expect(diagramList(page)).not.toBeFocused();
  });
});

/**
 * **Ctrl+Z works from anywhere in the plan, and still belongs to a text box inside one** (undo-redo
 * M5, spec F-4 / US-5).
 *
 * Two halves of one rule, so one plan and one history: with focus on `<body>` (where a deselect or a
 * closed dialog leaves it) the accelerator used to be dead, because the handler sat on the workspace
 * root; and inside a text-entry field it must NOT reach the plan, or a planner who typed into a cell
 * and pressed Ctrl+Z would lose an unrelated edit. Both are about what a real browser does with real
 * focus, which jsdom cannot ask. The assertions read the REST API, not the cell, because "the plan
 * did not undo" is a statement about stored data.
 */
test('Ctrl+Z undoes from the page body, and inside a text box it leaves the plan alone', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await drawTask(page, 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Foundations', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  await test.step('inside a Gantt cell editor, Ctrl+Z is the field’s undo and the plan is untouched', async () => {
    await showGantt(page);
    const row = ganttRow(page, 'Foundations');
    await row.click();
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('F2');
    const field = page.getByRole('textbox', { name: /Activity, Foundations/ });
    await expect(field).toBeFocused();
    await page.keyboard.type('XYZ');
    await page.keyboard.press('Control+z');
    // Still the open editor, and nothing was removed: the native undo took the typing.
    await expect(field).toBeVisible();
    await expect(field).not.toHaveValue(/XYZ$/);
    expect((await apiActivities(page, orgSlug)).length).toBe(2);
    await page.keyboard.press('Escape');
    await expect(field).toBeHidden();
  });

  await test.step('with focus on <body>, Ctrl+Z undoes the plan', async () => {
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    await expect
      .poll(() => page.evaluate(() => document.activeElement === document.body))
      .toBe(true);
    await page.keyboard.press('Control+z');
    await expect
      .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
      .toBe(1);

    // Redo from the body too, by the Windows chord.
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    await page.keyboard.press('Control+y');
    await expect
      .poll(async () => (await apiActivities(page, orgSlug)).length, { timeout: 20_000 })
      .toBe(2);
  });
});

/**
 * **The Recent edits menu undoes back to a chosen step** (undo-redo M7, US-6).
 *
 * Driven from the keyboard, because the control is an APG menu button inside a roving toolbar and the
 * seam between those two is what a unit suite cannot see: the arrow opens it, focus lands on the first
 * row, End reaches the oldest, Enter runs it and focus comes back to the trigger. The assertion that
 * matters is the **one** summarising message — three undos ran, and the strip and the live region each
 * say it once, rather than three results replacing each other.
 */
test('a planner undoes back several steps at once from the Recent edits menu', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  const toolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  const strip = page.getByTestId('canvas-history-result');
  const announcer = page.getByTestId('announcer');

  await drawTask(page, 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Foundations', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });
  await drawTask(page, 'Framing', { x: 500, y: 240 });
  await expect(diagram.getByRole('option')).toHaveCount(3, { timeout: 15_000 });

  const history = toolbar.getByRole('button', { name: 'Recent edits' });
  await history.focus();
  await page.keyboard.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Recent edits' });
  await expect(menu).toBeVisible();
  const rows = menu.getByRole('menuitem');
  await expect(rows).toHaveCount(3);
  // Newest first, each row saying what choosing it does.
  await expect(rows.first()).toHaveAccessibleName('Undo Add “Framing”');
  await expect(rows.last()).toHaveAccessibleName('Undo Add “Excavate” and the 2 steps after it');

  await test.step('the open menu is accessible', async () => {
    const results = await new AxeBuilder({ page })
      .include('[role="menu"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  await page.keyboard.press('End');
  await page.keyboard.press('Enter');

  await expect(diagram.getByRole('option')).toHaveCount(0, { timeout: 15_000 });
  await expect(strip).toContainText('Undid 3 steps.', { timeout: 15_000 });
  await expect(announcer).toContainText('Undid 3 steps.');
  await expect(history).toBeFocused();

  await test.step('the redo half of the list brings them back', async () => {
    await page.keyboard.press('ArrowDown');
    const redoRows = page.getByRole('menu', { name: 'Recent edits' }).getByRole('menuitem');
    await expect(redoRows).toHaveCount(3);
    await expect(redoRows.last()).toHaveAccessibleName(
      'Redo Add “Framing” and the 2 steps before it',
    );
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(diagram.getByRole('option')).toHaveCount(3, { timeout: 15_000 });
    await expect(strip).toContainText('Redid 3 steps.');
  });
});
