import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The CPM schedule journey (M6): a Planner sets the plan's start date, adds two
 * linked activities, and recalculates — the summary strip and the activities
 * table fill with computed dates and a critical-path badge — with an
 * accessibility check on the result. A second flow covers the friendly inline
 * prompt when the plan has no start date. Requires the API (with a database)
 * running and reachable via the dev proxy.
 */
async function onboard(page: Page, stamp: number): Promise<string> {
  const email = `sched-${stamp}@example.com`;
  const orgSlug = `sched-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Sched Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Sched Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
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
  await page.getByRole('dialog').getByLabel('Name').fill('Baseline');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Baseline' }).click();
}

async function addActivity(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

test('a planner sets a start date, recalculates, and sees the critical path (accessible)', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // Give the plan a start date so it can be scheduled.
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();

  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');

  // Link Excavate → Pour slab so there is a chain to schedule.
  await page.getByRole('button', { name: 'Logic for Pour slab' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add predecessor' }).click();
  await dialog.getByLabel('Predecessor activity').selectOption({ label: 'Excavate' });
  await dialog.getByRole('button', { name: 'Add dependency' }).click();
  await expect(dialog.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  // Before recompute the summary is not yet calculated.
  await expect(page.getByText(/Schedule not yet calculated/)).toBeVisible();

  await page.getByRole('button', { name: 'Recalculate' }).click();

  // The summary strip and the table now show the computed schedule.
  await expect(page.getByText('Project finish')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Critical', exact: true }).first()).toBeVisible();

  // The computed plan view is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

test('recalculating a plan with no start date shows a friendly prompt', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // No planned start was set → the API returns 422 and the button prompts for one.
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.getByRole('alert')).toContainText(/Set the plan’s start date first/);
});
