import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **tabbed activity editor** suite (`VITE_ACTIVITY_EDITOR_TABS`,
 * ADR-0060). The onboarding + hierarchy helpers mirror `e2e-notes/support.ts`; the plan surface is
 * the legacy stacked page (canvas pinned off in the config), so activities are added inline and the
 * editor is opened from a row's actions menu.
 */

/** Sign up + create an organisation; returns the org slug. The actor is the org's Org Admin. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `editor-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Editor Tester');
  await page.getByLabel('Email').fill(`editor-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Editor Co ${stamp}`);
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

/** Take the pen, whether or not this session already holds it. Writes are pen-gated (ADR-0028). */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/** Release the pen, so the definition scopes shade with the lock reason. */
export async function releasePen(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
}

/**
 * Make the activities table reachable.
 *
 * The panel is **collapsed by default** (ADR-0030 — the canvas gets the room), and returns to that
 * default on every load. Two traps live behind these three lines, both paid for by a failing run
 * during the conversion rather than found by reading:
 *
 * 1. `DataTable` renders its empty state **instead of** a `<table>` when there are no rows
 *    (`src/components/ui/data-table.tsx:86`), so waiting for the table is wrong on an empty plan —
 *    which is exactly when this first runs.
 * 2. `isVisible()` is a snapshot, not a wait. Called straight after a navigation or reload it
 *    answers "no" because the app has not painted, the expand is skipped, and the missing table
 *    then reads exactly like the write under test having failed to persist.
 *
 * So it waits on the panel **toggle**, which is present in one state or the other whenever the
 * workspace has rendered. Idempotent.
 */
export async function showActivities(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

/** Add an activity to the open plan's activities table. Requires the pen. */
export async function addActivity(page: Page, name: string): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  // Either label: `Duration` once the field can resolve the calendar's working hours (ADR-0070,
  // default-on), `Duration (working days)` on the degraded path. This is fixture setup, not the
  // thing under test, so it accepts both rather than pinning one and breaking on a default flip.
  // Anchored so it cannot also match `Duration type`.
  await dialog.getByLabel(/^Duration( \(working days\))?$/).fill('5');
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

/** Open the tabbed editor from a row's actions menu, for the given purpose. */
export async function openEditor(
  page: Page,
  activityName: string,
  action: 'Edit' | 'Report progress' | 'Steps' | 'Logic' | 'Resources',
): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${activityName}` }).click();
  await page.getByRole('menuitem', { name: action }).click();
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeVisible();
}
