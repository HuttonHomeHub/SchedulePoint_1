import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  apiActivities,
  apiDependencies as apiDependenciesShared,
  seedActivities,
  seedLink,
} from '../e2e-copy-paste/support';

import {
  addLink,
  apiDependencies,
  drawTask,
  onboard,
  openLogic,
  openNewPlan,
  showActivities,
  startEditing,
} from './support';

/**
 * Flag-ON **undo / redo** journey (`VITE_UNDO_REDO`, ADR-0048 M3) — the user-visible surface over the
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
