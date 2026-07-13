import { expect, type Page } from '@playwright/test';

/**
 * Shared journey helpers for the flag-ON **canvas-first workspace** suite
 * (`VITE_CANVAS_WORKSPACE`, ADR-0030). They drive the plan hierarchy the way a planner
 * would (no API short-cuts) so the journey exercises the real UI end to end.
 *
 * These differ from the flag-off editing suite's helpers ({@link ../e2e-edit/support})
 * only where the workspace re-homes chrome: the plan header is slim, so **Edit plan**
 * lives in the "⋯" Plan-actions overflow menu, and the activities table sits in the
 * bottom panel rather than a long-scrolling section.
 */

/** Sign up + create an organisation; returns the org slug. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  // The org slug is derived from the name by slugifying it, so keep the two in step
  // (name "Workspace Co <stamp>" → slug "workspace-co-<stamp>").
  const orgSlug = `workspace-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Workspace Tester');
  await page.getByLabel('Email').fill(`ws-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Workspace Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create a client → project → plan and open the plan (which mounts the workspace). */
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

/** Open the "⋯" Plan-actions overflow menu in the workspace header. */
export async function openPlanActions(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Plan actions' }).click();
  await expect(page.getByRole('menu', { name: 'Plan actions' })).toBeVisible();
}

/**
 * Set the plan's planned start (needed before the schedule can compute). In the workspace
 * the "Edit plan" affordance is in the overflow menu, not a header button.
 */
export async function setPlannedStart(page: Page, isoDate: string): Promise<void> {
  await openPlanActions(page);
  await page.getByRole('menuitem', { name: /edit plan/i }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill(isoDate);
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
}

/** Take the pen so the pen-gated editing affordances are live (flag-on). */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** Add an activity through the bottom-panel activities table (requires the pen when enforced). */
export async function addActivity(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}
