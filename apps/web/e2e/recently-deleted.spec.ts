import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

/** The organisation nav in the header — scoped so its links don't clash with breadcrumbs. */
function navLink(page: Page, name: string): Locator {
  return page
    .getByRole('navigation', { name: 'Organisation' })
    .getByRole('link', { name, exact: true });
}

/**
 * The recycle-bin journeys: a planner deletes hierarchy rows, finds them in
 * "Recently deleted", and restores them. Covers the cascade view (a deleted
 * client is restorable while its deleted descendants show "restore the parent
 * first") with an accessibility check, and the direct single-item restore
 * round-trip. Requires the API (with a database) running via the dev proxy.
 */
async function onboard(page: Page, label: string): Promise<string> {
  const stamp = Date.now();
  const email = `${label}-${stamp}@example.com`;
  const orgName = `${label} Co ${stamp}`;
  const orgSlug = `${label}-co-${stamp}`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Bin Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

test('a deleted client cascade is shown and restored from the recycle bin (accessible)', async ({
  page,
}) => {
  await onboard(page, 'bin');

  // Build a client → project → plan.
  await navLink(page, 'Clients').click();
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
  await expect(page.getByRole('link', { name: 'Baseline' })).toBeVisible();

  // Delete the client (cascades to the project + plan).
  await navLink(page, 'Clients').click();
  await page.getByRole('button', { name: 'Delete Northgate' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/No clients yet/)).toBeVisible();

  // The recycle bin: the client is restorable; its descendants say restore the parent first.
  await navLink(page, 'Recently deleted').click();
  await expect(page.getByRole('heading', { name: 'Recently deleted' })).toBeVisible();
  // Scope to the exact name cell: a bare getByText also matches the announcer live
  // region, and a non-exact cell match also catches the "Restore client Northgate"
  // actions cell — exact pins it to the name column.
  await expect(page.getByRole('cell', { name: 'Northgate', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore client Northgate' })).toBeVisible();
  await expect(page.getByText('Restore its parent first')).toHaveCount(2);

  // The recycle-bin screen is accessible.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // Restoring the client brings the whole batch back and empties the bin.
  await page.getByRole('button', { name: 'Restore client Northgate' }).click();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();

  // The client is active again.
  await navLink(page, 'Clients').click();
  await expect(page.getByRole('link', { name: 'Northgate' })).toBeVisible();
});

test('a directly-deleted plan can be restored from the recycle bin', async ({ page }) => {
  await onboard(page, 'binplan');

  await navLink(page, 'Clients').click();
  await page.getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Acme');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Acme' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Depot');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Depot' }).click();

  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Baseline');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByRole('link', { name: 'Baseline' })).toBeVisible();

  // Delete just the plan.
  await page.getByRole('button', { name: 'Delete Baseline' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/No plans yet/)).toBeVisible();

  // Restore it from the bin (exact name cell — avoids the announcer and actions cell).
  await navLink(page, 'Recently deleted').click();
  await expect(page.getByRole('cell', { name: 'Baseline', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore plan Baseline' }).click();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();

  // It's back under its project (navigate there through the hierarchy).
  await navLink(page, 'Clients').click();
  await page.getByRole('link', { name: 'Acme' }).click();
  await page.getByRole('link', { name: 'Depot' }).click();
  await expect(page.getByRole('link', { name: 'Baseline' })).toBeVisible();
});
