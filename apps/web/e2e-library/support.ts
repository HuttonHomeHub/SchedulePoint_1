import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the **library scoping & manageability** suite
 * (ADR-0053, `docs/specs/library-scoping-and-manageability/`) — no longer flag-on since ADR-0088
 * D3 retired `VITE_LIBRARY_SCOPING`. The
 * onboarding + client/project/plan + canvas-authoring helpers mirror `e2e-share/support.ts`
 * verbatim (the same canvas-authoring flags bake into this suite's `webServer`, so a plan opens on
 * a draw-ready blank canvas). The onboarding actor becomes the org's Org Admin, which already
 * satisfies `calendar:manage_org` and the resource-library writes, so no extra role setup is needed.
 */

/** Sign up + create an organisation; returns the org slug (name "Library Co" → "library-co-…"). */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `library-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Library Tester');
  await page.getByLabel('Email').fill(`library-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Library Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Create the single client this journey hangs its two projects off, and open it. */
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

/** Draw a task on the canvas via the Add split-button (mirrors `e2e-share/support.ts`). */
export async function drawActivity(
  page: Page,
  name: string,
  pos: { x: number; y: number },
): Promise<void> {
  await page.getByRole('button', { name: /^Activity type:/ }).click();
  await page.getByRole('menuitemradio', { name: 'Task' }).click();
  await canvas(page).click({ position: pos });
  const form = page.getByRole('form', { name: 'Name the new activity' });
  await form.getByLabel('Name').fill(name);
  await form.getByRole('button', { name: 'Add to plan' }).click();
  await expect(form).toBeHidden();
}

/**
 * Open the plan's **Schedule settings…** toolbar dialog (which holds the working-day calendar as
 * one of its sections — TECH_DEBT #60), open the tier-grouped calendar `Combobox`, and return the
 * OPTION NAMES it offers. This is the picker the tier must actually govern: a project calendar has
 * to be offered inside its own project and nowhere else.
 *
 * The listbox is looked up INSIDE the dialog on purpose — the plan workspace also carries the
 * canvas's parallel activity listbox, so a page-wide `getByRole('listbox')` would be ambiguous.
 */
export async function calendarPickerOptions(page: Page): Promise<string[]> {
  const toolbar = page.getByRole('toolbar', { name: 'Build and manage' });
  await toolbar.getByRole('button', { name: 'Schedule settings…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Schedule settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Calendar' }).press('ArrowDown');
  const listbox = dialog.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const names = await listbox.getByRole('option').allInnerTexts();
  // Two Escapes: the combobox stops the first from bubbling (so it closes only the popup), the
  // second closes the surrounding native `<dialog>`.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  return names;
}
