import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The hierarchy-navigation journey: a new user onboards an organisation, creates
 * a client, opens it, and creates a project under it — with an accessibility
 * check on the clients screen. Requires the API (with a database) running and
 * reachable via the dev proxy.
 */
test('a user can create a client and a project under it (accessible)', async ({ page }) => {
  const stamp = Date.now();
  const email = `clients-${stamp}@example.com`;
  const orgName = `Client Co ${stamp}`;
  const orgSlug = `client-co-${stamp}`;

  // Sign up + onboard an organisation.
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Client Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  // Navigate to Clients (header nav) — empty state first.
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}/clients$`));
  await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
  await expect(page.getByText(/No clients yet/)).toBeVisible();

  // Accessibility check on the clients screen.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // Create a client.
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  const clientDialog = page.getByRole('dialog');
  await clientDialog.getByLabel('Name').fill('Northgate');
  await clientDialog.getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByRole('link', { name: 'Northgate' })).toBeVisible();

  // Open the client → its (empty) projects.
  await page.getByRole('link', { name: 'Northgate' }).click();
  await expect(page.getByRole('heading', { name: 'Northgate', exact: true })).toBeVisible();
  await expect(page.getByText(/No projects yet/)).toBeVisible();

  // Create a project under the client.
  await page.getByRole('button', { name: 'New project' }).click();
  const projectDialog = page.getByRole('dialog');
  await projectDialog.getByLabel('Name').fill('Riverside');
  await projectDialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('link', { name: 'Riverside' })).toBeVisible();

  // Open the project → its (empty) plans list.
  await page.getByRole('link', { name: 'Riverside' }).click();
  await expect(page.getByRole('heading', { name: 'Riverside', exact: true })).toBeVisible();
  await expect(page.getByText(/No plans yet/)).toBeVisible();
});
