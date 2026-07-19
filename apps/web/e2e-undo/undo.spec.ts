import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { drawTask, onboard, openNewPlan, startEditing } from './support';

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
  const toolbar = page.getByRole('toolbar', { name: 'Build and manage' });
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
    .include('[role="toolbar"][aria-label="Build and manage"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
