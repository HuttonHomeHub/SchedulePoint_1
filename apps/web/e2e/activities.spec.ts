import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The activity-authoring journey: onboard an org, create a client → project →
 * plan, then add activities to the plan and see them in the table — with an
 * accessibility check on the plan-detail screen and the open form dialog.
 * Requires the API (with a database) running and reachable via the dev proxy.
 */
test('a user can add activities to a plan (accessible)', async ({ page }) => {
  const stamp = Date.now();
  const email = `activities-${stamp}@example.com`;
  const orgName = `Activity Co ${stamp}`;
  const orgSlug = `activity-co-${stamp}`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Activity Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  // Client → project → plan.
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

  // The plan-detail screen shows the (empty) Activities section, and is accessible.
  await expect(page.getByRole('heading', { name: 'Activities' })).toBeVisible();
  await expect(page.getByText(/No activities yet/)).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);

  // Add a task with a code and a duration.
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The open form dialog is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await dialog.getByLabel('Name').fill('Excavate');
  await dialog.getByLabel('Code (optional)').fill('A100');
  await dialog.getByLabel(/Duration/).fill('10');
  await dialog.getByRole('button', { name: 'Create activity' }).click();

  // It appears in the table with its code, type and duration.
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'A100', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '10 d', exact: true })).toBeVisible();

  // Adding a milestone hides the duration field and shows an em-dash duration.
  await page.getByRole('button', { name: 'New activity' }).click();
  await dialog.getByLabel('Name').fill('Kickoff');
  await dialog.getByLabel('Type').selectOption('START_MILESTONE');
  await expect(dialog.getByLabel(/Duration/)).toBeHidden();
  await dialog.getByRole('button', { name: 'Create activity' }).click();

  await expect(page.getByRole('cell', { name: 'Kickoff', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Start milestone', exact: true })).toBeVisible();
});
