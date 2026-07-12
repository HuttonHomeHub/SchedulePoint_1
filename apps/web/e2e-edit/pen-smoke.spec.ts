import { expect, test, type Page } from '@playwright/test';

/**
 * Flag-ON smoke journey (TECH_DEBT #25b/#27b harness). Proves the editing surface
 * actually boots with `VITE_TSLD_EDITING` + `VITE_PLAN_EDIT_LOCK` on and the API
 * enforcing (`PLAN_EDIT_LOCK_ENFORCED=true`): a Planner must take the pen before the
 * schedule-editing affordances appear, and a write then succeeds because they hold it.
 * This is the harness's own health check — the substantive keyboard-edit and pen
 * hand-off journeys build on top of it.
 */
async function onboard(page: Page, stamp: number): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Pen Tester');
  await page.getByLabel('Email').fill(`pen-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Pen Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/pen-co-${stamp}`));
}

async function openNewPlan(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
}

test('the pen gates schedule editing; taking it unlocks writes (flag-on stack)', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // The pen layer is live: the banner offers the "Start editing" CTA (VITE_PLAN_EDIT_LOCK on).
  const startEditing = page.getByRole('button', { name: 'Start editing' });
  await expect(startEditing).toBeVisible();

  // Before taking the pen the schedule is read-only: no create affordance, and the in-place hint.
  await expect(page.getByRole('button', { name: 'New activity' })).toHaveCount(0);
  await expect(page.getByText(/Read-only — use .Start editing/i).first()).toBeVisible();

  // Take the pen → the editing affordances come alive (the pen gate flips).
  await startEditing.click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New activity' })).toBeVisible();

  // A structural write now succeeds because the caller holds the pen AND the API enforces it
  // (a non-holder would 423). This exercises the whole flag-on stack end to end.
  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Excavate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();
});
