import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **Gantt view** suite (`VITE_GANTT_VIEW`, ADR-0059,
 * `docs/specs/gantt-view/`). The onboarding + client/project/plan + canvas-authoring helpers mirror
 * `e2e-library/support.ts` verbatim (the same canvas-authoring flags bake into this suite's
 * `webServer`, so a plan opens on a draw-ready blank canvas). The onboarding actor becomes the
 * org's Org Admin, which already satisfies everything this journey does.
 */

/** Sign up + create an organisation; returns the org slug (name "Gantt Co" → "gantt-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `gantt-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Gantt Tester');
  await page.getByLabel('Email').fill(`gantt-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Gantt Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create the client this journey hangs its project off, and open it. */
export async function createClient(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name }).click();
}

/** Create a project under the currently-open client and open its detail screen. */
export async function createProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name }).click();
}

/** Create a plan under the currently-open project and open it (mounts the canvas workspace). */
export async function createPlan(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name }).click();
}

/** Take the pen so the authoring affordances go live. */
export async function startEditing(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
}

/** The interactive base canvas of the TSLD diagram region (aria-hidden, so located by element). */
export function canvas(page: Page): ReturnType<Page['locator']> {
  return page.locator('section[aria-label="Time-scaled logic diagram"] canvas').first();
}

/** Draw a task on the canvas via the Add split-button (mirrors `e2e-library/support.ts`). */
export async function drawActivity(
  page: Page,
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  await page.getByRole('button', { name: /^Add(ing .+)?$/ }).click();
  await page.getByRole('menuitemradio', { name: 'Task' }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByRole('textbox', { name: 'New activity name' }).fill(name);
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(form).toBeHidden();
}

/** The Gantt's treegrid — the surface every assertion in this journey reads. */
export function ganttGrid(page: Page): ReturnType<Page['getByRole']> {
  return page.getByRole('treegrid', { name: 'Schedule as a bar chart' });
}
