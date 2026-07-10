import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The plan-authoring journey: onboard an org, create a client → project, then a
 * plan with a status and planned start, and land on the plan-detail screen —
 * with an accessibility check on the project's plans screen. Requires the API
 * (with a database) running and reachable via the dev proxy.
 */
test('a user can create a plan and open its detail (accessible)', async ({ page }) => {
  const stamp = Date.now();
  const email = `plans-${stamp}@example.com`;
  const orgName = `Plan Co ${stamp}`;
  const orgSlug = `plan-co-${stamp}`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Plan Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  // Client → project.
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();

  // The project's plans screen — empty first, and accessible.
  await expect(page.getByRole('heading', { name: 'Plans' })).toBeVisible();
  await expect(page.getByText(/No plans yet/)).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // Create a plan with a status + planned start.
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Baseline');
  await dialog.getByLabel('Status').selectOption('ACTIVE');
  await dialog.getByLabel(/Planned start/).fill('2026-05-01');
  await dialog.getByRole('button', { name: 'Create plan' }).click();

  // It appears in the table with the formatted date, then opens to its detail.
  await expect(page.getByRole('link', { name: 'Baseline' })).toBeVisible();
  await expect(page.getByText('01 May 2026')).toBeVisible();
  await page.getByRole('link', { name: 'Baseline' }).click();

  await expect(page.getByRole('heading', { name: 'Baseline', exact: true })).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByText(/Time-Scaled Logic Diagram/)).toBeVisible();
});
