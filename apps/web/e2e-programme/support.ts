import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **programme scheduling** suite (`VITE_PROGRAMME_SCHEDULING`,
 * inter-project M2, ADR-0045 F8) on the legacy stacked plan-detail page. Same hierarchy-driving
 * approach as the other flag-on suites; the plan surface here is the flag-off legacy page (canvas +
 * pen pinned off in the config), so activities are added inline and Recalculate is a header button.
 */

export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `programme-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Programme Tester');
  await page.getByLabel('Email').fill(`programme-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Programme Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create the shared client + project and land on the project page (where plans are created). */
export async function openProject(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
}

/** Create a plan under the current project and open it. */
export async function createAndOpenPlan(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** Add an activity (optionally with a longer duration) to the open plan's activities table. */
export async function addActivity(page: Page, name: string, durationDays?: number): Promise<void> {
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  if (durationDays !== undefined) {
    await dialog.getByLabel('Duration (working days)', { exact: true }).fill(String(durationDays));
  }
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

/** Recalculate the open plan's own schedule (the header Recalculate control). */
export async function recalculate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
}
