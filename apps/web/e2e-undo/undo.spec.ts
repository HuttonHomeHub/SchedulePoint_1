import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  addLink,
  apiDependencies,
  drawTask,
  onboard,
  openLogic,
  openNewPlan,
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
