import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **canvas-axis-aligned resource strip** suite
 * (`VITE_CANVAS_RESOURCE_VIEW`, Stage E, `docs/specs/canvas-resource-view/`). Mirrors the on-canvas
 * advanced activity types helpers (`e2e-loe/support.ts`) verbatim for onboarding + drawing — this surface
 * layers directly on top of that one — and adds the resource-library + assignment helpers this suite
 * needs to seed real histogram data (created through the real UI flows, not an API short-cut).
 */

/** Sign up + create an organisation; returns the org slug (name "Resource View Co" → "…-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `resource-view-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Resource View Tester');
  await page.getByLabel('Email').fill(`resource-view-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Resource View Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/**
 * Create an organisation resource through the real library screen (`/orgs/$orgSlug/resources`),
 * reached from the persistent top nav. Kind defaults to Labour, which is enough to be assignable and to
 * drive the resource histogram. Done BEFORE opening a plan so the journey never has to navigate away
 * from — and back into — the plan workspace.
 */
export async function createResource(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Resources', exact: true }).click();
  await page.getByRole('button', { name: 'New resource' }).click();
  const dialog = page.getByRole('dialog', { name: 'New resource' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create resource' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
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

/** Take the pen so the authoring affordances (Add, drawing) go live. */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/**
 * Draw a task on the canvas via the Add split-button (ADR-0032 M4): open the `Add▾` menu, pick Task
 * (which arms add mode), click the canvas at `pos`, then name + commit in the drop popover.
 */
export async function drawTask(
  page: Page,
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  // The Add split-button reads "Add" / "Adding <kind>"; anchor the regex so it doesn't also match the
  // inline "Add note" placeholder on the same row (Playwright name matching is substring).
  await page.getByRole('button', { name: /^Add(ing .+)?$/ }).click();
  await page.getByRole('menuitemradio', { name: 'Task' }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByRole('textbox', { name: 'New activity name' }).fill(name);
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(form).toBeHidden();
}

/**
 * Assign an already-created library resource to a drawn activity through the real "Resources" row
 * action (the same dialog `ActivityResourcesDialog` used everywhere resources are assigned) — expanding
 * the collapsed-by-default activities panel first, like the toolbar suite's `addActivity` helper.
 * Budgeted units seed the resource histogram this suite reads.
 */
export async function assignResource(
  page: Page,
  activityName: string,
  resourceName: string,
  budgetedUnits: number,
): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible()) await expand.click();
  await page.getByRole('button', { name: `Actions for ${activityName}` }).click();
  await page.getByRole('menuitem', { name: 'Resources' }).click();

  const dialog = page.getByRole('dialog', { name: 'Resources' });
  await expect(dialog).toBeVisible();
  // The assign form's resource picker lists each unassigned library resource as "<name> (<kind>)"; a
  // freshly created resource defaults to Labour. Exact match: the dialog's "Driving resource" checkbox
  // also carries "Resource" in its label, which a substring match would ambiguously also select.
  await dialog
    .getByLabel('Resource', { exact: true })
    .selectOption({ label: `${resourceName} (Labour)` });
  await dialog.getByLabel('Budgeted units').fill(String(budgetedUnits));
  await dialog.getByRole('button', { name: 'Assign resource' }).click();
  await expect(dialog.locator('li').filter({ hasText: resourceName })).toBeVisible();
  // Exact match: the dialog also carries an unrelated "Close dialog" icon button (the `Dialog` chrome's
  // own ✕), whose accessible name would otherwise also satisfy a substring "Close" match.
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
}
