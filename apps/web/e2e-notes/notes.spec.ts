import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { addActivity, createAndOpenPlan, onboard, openProject } from './support';

/**
 * Flag-ON **Notes** journey (`VITE_NOTES`, Notes M3, ADR-0046). Proves the surface runs end-to-end in
 * a real browser against the real API:
 *
 * 1. A plan with one activity.
 * 2. The activity **Logic panel** opened from the row's actions menu — its **Notes** section.
 * 3. **Add** a note → it appears in the thread, attributed to the author.
 * 4. **Edit** the own note → it shows the "edited" marker.
 * 5. The **row count badge** shows "1 note" once the panel is closed.
 * 6. **Delete** the note → the thread is empty and the badge is gone.
 * 7. An **axe** wcag2a/wcag2aa pass with the notes surface visible — zero violations.
 *
 * Runs on the legacy stacked plan-detail page with the pen off (see the config); notes are not
 * pen-gated regardless (ADR-0046), so no lock dance.
 */
test('a member adds, edits and deletes a note and the row badge tracks it', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await addActivity(page, 'Erect frame');

  // Open the activity Logic panel from the row's actions menu.
  await page.getByRole('button', { name: 'Actions for Erect frame' }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  const logic = page.getByRole('dialog', { name: /Logic for Erect frame/ });
  await expect(logic.getByRole('heading', { name: 'Notes' })).toBeVisible();
  await expect(logic.getByText('No notes yet.')).toBeVisible();

  // Add a note — it lands in the thread, attributed to the author.
  await logic.getByLabel('Add a note').fill('Poured the slab today');
  await logic.getByRole('button', { name: 'Add note' }).click();
  await expect(logic.getByText('Poured the slab today')).toBeVisible();
  await expect(logic.getByText('Notes Tester', { exact: true })).toBeVisible();
  // Not yet edited.
  await expect(logic.getByText('· edited')).toBeHidden();

  // Edit the own note (author-only control, distinguishable accessible name) → shows "edited".
  await logic.getByRole('button', { name: /^Edit note by/ }).click();
  await logic.getByLabel('Edit note').fill('Poured the slab this morning');
  await logic.getByRole('button', { name: 'Save' }).click();
  await expect(logic.getByText('Poured the slab this morning')).toBeVisible();
  await expect(logic.getByText('· edited')).toBeVisible();

  // The notes surface is accessible (composer + thread + own-note controls all visible).
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);

  // Close the panel; the row count badge now shows one note.
  await page.keyboard.press('Escape');
  await expect(logic).toBeHidden();
  const row = page.getByRole('row', { name: /Erect frame/ });
  await expect(row.getByText('1 note', { exact: true })).toBeVisible();

  // Re-open and delete the note → the thread empties.
  await page.getByRole('button', { name: 'Actions for Erect frame' }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  await logic.getByRole('button', { name: /^Delete note by/ }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Delete note' });
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(logic.getByText('No notes yet.')).toBeVisible();

  // Close the panel; the badge is gone.
  await page.keyboard.press('Escape');
  await expect(logic).toBeHidden();
  await expect(page.getByRole('row', { name: /Erect frame/ }).getByText('1 note')).toBeHidden();
});
