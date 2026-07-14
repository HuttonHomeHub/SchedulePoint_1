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
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
}

/** Take the pen so the authoring affordances go live (compact status lives in the slim header). */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/**
 * Draw an activity of the given kind on the canvas via the Add split-button (ADR-0032 M4): open the
 * `Add▾` menu, pick the kind (which arms add mode), click the canvas at `pos`, then name + commit in
 * the drop popover. A milestone places on the single click; a task's click is a 1-day span.
 */
export async function drawActivity(
  page: Page,
  kind: 'Task' | 'Start milestone' | 'Finish milestone',
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  await page.getByRole('button', { name: /^Add/ }).click();
  await page.getByRole('menuitemradio', { name: kind }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByRole('textbox', { name: 'New activity name' }).fill(name);
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(form).toBeHidden();
}
