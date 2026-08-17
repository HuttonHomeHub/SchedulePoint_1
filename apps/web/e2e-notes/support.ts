import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **Notes** suite (`VITE_NOTES`, Notes M3, ADR-0046) on the legacy
 * stacked plan-detail page. Same hierarchy-driving approach as the other flag-on suites; the plan
 * surface here is the flag-off legacy page (canvas + pen pinned off in the config), so activities are
 * added inline and the Logic panel is opened from a row's actions menu.
 */

export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `notes-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Notes Tester');
  await page.getByLabel('Email').fill(`notes-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Notes Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client + project and land on the project page (where plans are created). */
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

/** Add an activity to the open plan's activities table. */
/**
 * Make the activities table visible.
 *
 * The panel is **collapsed by default** on the plan workspace (ADR-0030), and it returns to that
 * default on every reload — which is what this suite does mid-test to defeat the client cache. So
 * this is needed in two places, not one: before the New-activity button can be clicked, and again
 * after any `page.reload()` before the table can be read. Idempotent, so calling it when the panel
 * is already open costs nothing.
 */
export async function showActivities(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  // **Wait on the TOGGLE, not on the table.** Two traps, both paid for:
  //
  // 1. `DataTable` returns its empty state instead of a `<table>` when there are no rows
  //    (`data-table.tsx:86`), so an empty plan has no table to wait for — and this helper runs
  //    before the first activity exists.
  // 2. `isVisible()` is a snapshot, not a wait. Called straight after `page.reload()` it answers
  //    "no" because the app has not painted, the expand is skipped, and the missing table then
  //    reads exactly like the edit under test having failed to persist.
  //
  // The toggle is present in one state or the other whenever the workspace has rendered, which is
  // the invariant worth waiting on. Idempotent.
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

export async function addActivity(page: Page, name: string): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}
