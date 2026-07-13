import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **canvas-first authoring** suite (`VITE_CANVAS_AUTHORING`,
 * ADR-0032). Same hierarchy-driving approach as the other flag-on suites. The distinguishing trait
 * of this layer: opening a brand-new plan lands on a **draw-ready blank canvas** (anchored to today),
 * so the journey authors the plan on the canvas — no activities-table detour, no "set start first",
 * no manual Recalculate.
 */

/** Sign up + create an organisation; returns the org slug (name "Authoring Co" → "authoring-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `authoring-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Authoring Tester');
  await page.getByLabel('Email').fill(`authoring-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Authoring Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project → plan and open it (mounts the canvas-first authoring workspace). */
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

/** Take the pen so the authoring affordances go live (compact status lives in the slim header). */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}
