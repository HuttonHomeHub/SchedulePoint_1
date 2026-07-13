import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **canvas-maximal toolbar** suite (`VITE_CANVAS_TOOLBAR`,
 * ADR-0031). Same hierarchy-driving approach as the other flag-on suites; they differ only where
 * the toolbar layout re-homes chrome: the plan actions live in the `⋯` toolbar overflow (not a
 * header menu), and the activities panel is collapsed by default (expand it to reach its table).
 */

export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `toolbar-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Toolbar Tester');
  await page.getByLabel('Email').fill(`toolbar-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Toolbar Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project → plan and open it (mounts the toolbar workspace). */
export async function openNewPlan(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
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

/** Open the `⋯` overflow on the plan toolbar. */
export async function openToolbarOverflow(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'More toolbar actions' }).click();
  await expect(page.getByRole('menu', { name: 'More toolbar actions' })).toBeVisible();
}

/** Set the plan's planned start — reached via the toolbar overflow's "Edit plan" in this layout. */
export async function setPlannedStart(page: Page, isoDate: string): Promise<void> {
  await openToolbarOverflow(page);
  await page.getByRole('menuitem', { name: /edit plan/i }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill(isoDate);
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
}

/** Take the pen (the compact status lives in the slim header). */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** Add an activity via the bottom panel — expanding it first (collapsed by default here). */
export async function addActivity(page: Page, name: string): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}
