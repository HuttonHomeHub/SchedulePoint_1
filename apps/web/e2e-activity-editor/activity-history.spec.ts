import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { activityEditor } from '../e2e-support/activity-editor';

import {
  addActivity,
  createAndOpenPlan,
  ensurePen,
  onboard,
  openEditor,
  openProject,
} from './support';

/**
 * The **History** tab journey (ADR-0174, M1), against the real API with the plan edit-lock enforced.
 *
 * What the unit suites cannot say: that a real save, a real link and a real assignment each leave an
 * entry the editor then shows, by the person who made them, on **both** ends of the link — the seam
 * between the editor, the three write paths and the new read route (ADR-0081's class of defect).
 *
 * The assignment is made through the REST API rather than the Resources tab's combobox: that picker is
 * driven by `e2e-library` and `e2e-resource-view`, and what this journey proves is that the write is
 * recorded and shown, which does not depend on which control made it. The Viewer's view (money
 * withheld) is proven by `test/activity-history.e2e-spec.ts` against the same route.
 */
test('a planner sees their duration edit, a link on both ends and a resource in History', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createAndOpenPlan(page, 'Tower');
  await ensurePen(page);
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');

  // 1. A definition edit: the duration, saved from General.
  await openEditor(page, 'Pour slab', 'Edit');
  const editor = activityEditor(page);
  await editor.getByLabel('Duration', { exact: true }).fill('9');
  await editor.getByRole('button', { name: 'Save general' }).click();
  await expect(editor.getByText('Saved.').first()).toBeVisible();

  // 2. A link, from the Logic tab: Excavate → Pour slab.
  await editor.getByRole('tab', { name: 'Logic' }).click();
  await editor.getByLabel('Predecessor activity').selectOption({ label: 'Excavate' });
  await editor.getByRole('button', { name: 'Add link' }).click();
  await expect(editor.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();

  // 3. A resource assignment, through the API as the same signed-in planner (who holds the pen).
  const planId = new URL(page.url()).pathname.split('/plans/')[1]?.split('/')[0];
  const activities = await page.request.get(
    `/api/v1/organizations/${orgSlug}/plans/${planId}/activities`,
  );
  const rows = ((await activities.json()) as { data: { id: string; name: string }[] }).data;
  const pour = rows.find((row) => row.name === 'Pour slab');
  const excavate = rows.find((row) => row.name === 'Excavate');
  expect(pour && excavate).toBeTruthy();
  const resource = await page.request.post(`/api/v1/organizations/${orgSlug}/resources`, {
    data: { name: 'Tower crane', kind: 'EQUIPMENT' },
  });
  expect(resource.ok()).toBe(true);
  const resourceId = ((await resource.json()) as { data: { id: string } }).data.id;
  const assigned = await page.request.post(
    `/api/v1/organizations/${orgSlug}/activities/${pour?.id}/assignments`,
    { data: { resourceId, budgetedUnits: 40 } },
  );
  expect(assigned.ok()).toBe(true);

  // 4. History: one entry per scope, all by the signed-in person, newest first.
  await editor.getByRole('tab', { name: 'History' }).click();
  await expect(editor.getByRole('tab', { name: 'History', selected: true })).toBeVisible();
  const entries = editor
    .getByRole('list')
    .filter({ hasText: 'Editor Tester' })
    .first()
    .getByRole('listitem');
  await expect(editor.getByText('Resource added: Tower crane — 40 units')).toBeVisible();
  await expect(editor.getByText('Link added: Finish to Start from Excavate')).toBeVisible();
  await expect(editor.getByText(/Duration .* → 9d/)).toBeVisible();
  await expect(editor.getByText('Editor Tester').first()).toBeVisible();
  expect(await entries.count()).toBeGreaterThanOrEqual(3);

  // The open tab is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.keyboard.press('Escape');

  // 5. The other end of the link tells the same story from the predecessor's side.
  await openEditor(page, 'Excavate', 'Edit');
  await editor.getByRole('tab', { name: 'History' }).click();
  await expect(editor.getByText('Link added: Finish to Start to Pour slab')).toBeVisible();
});
