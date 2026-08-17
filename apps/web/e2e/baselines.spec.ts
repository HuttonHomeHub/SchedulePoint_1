import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { awaitComputedSchedule, showActivities } from './workspace';

/**
 * The baselines journey (M7, Journey 4): a Planner schedules a plan, captures a
 * "Contract Baseline" (which becomes active), and then — after adding work — sees the
 * activities table's Baseline-finish variance column fill in, with an accessibility
 * check on the result. Requires the API (with a database) reachable via the dev proxy.
 */
async function onboard(page: Page, stamp: number): Promise<string> {
  const email = `base-${stamp}@example.com`;
  // Must match the slug the app derives from the org name below ("Baseline Co" → "baseline-co").
  const orgSlug = `baseline-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Baseline Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Baseline Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

async function openNewPlan(page: Page): Promise<void> {
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
  await page.getByRole('dialog').getByLabel('Name').fill('Baseline');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Baseline' }).click();
}

async function addActivity(page: Page, name: string): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(name);
  await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

test('a planner captures a baseline and sees per-activity variance (accessible)', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);

  // Schedule the plan: a start date + one activity, then recalculate.
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await addActivity(page, 'Excavate');
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await awaitComputedSchedule(page, orgSlug);

  // No baseline yet → no variance column.
  await expect(page.getByRole('columnheader', { name: 'Finish variance' })).toHaveCount(0);

  // Capture a baseline; it becomes the plan's active baseline.
  //
  // The legacy page put `Capture baseline` on the surface directly. On the workspace, baselines,
  // earned value and the resource histogram share an **Analysis** trigger (ADR-0090 M2-T5 — three
  // Row-2 stops for three ways of measuring a plan against something), so the button now lives
  // inside the Baselines dialog that trigger opens.
  await page.getByRole('button', { name: 'Analysis' }).click();
  await page.getByRole('menuitem', { name: /Baselines/ }).click();
  // Scoped to the Baselines dialog by name: pressing Capture opens the capture FORM, so an
  // unscoped `getByRole('dialog')` then matches two and the second click lands on the wrong one.
  const baselines = page.getByRole('dialog', { name: /Baselines/ });
  await expect(baselines).toBeVisible();
  // Both live inside the dialog once the form is open — the trigger and the form's submit share a
  // name — so they are told apart by position rather than by copy.
  await baselines.getByRole('button', { name: 'Capture baseline' }).first().click();
  await baselines.getByLabel('Name').fill('Contract Baseline');
  await baselines.getByRole('button', { name: 'Capture baseline' }).last().click();
  // The baseline name also appears in the row's action-button aria-labels ("… is active"),
  // and "Active" renders both as the badge and the active-row button, so scope to the first.
  await expect(page.getByRole('cell', { name: 'Contract Baseline' }).first()).toBeVisible();
  await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

  // Close it before reading the table behind it. On the legacy page Baselines was an inline panel
  // and the table sat below it; here it is a modal, so leaving it open blocks every later
  // interaction with the workspace underneath.
  await baselines.getByRole('button', { name: 'Close dialog' }).click();
  await expect(baselines).toBeHidden();

  // The activities table now shows the variance columns; the sole activity matches the
  // just-captured baseline, and the plan-level roll-up appears above the table.
  await expect(page.getByRole('columnheader', { name: 'Finish variance' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'On baseline' }).first()).toBeVisible();
  await expect(page.getByText(/vs\. Contract Baseline:/)).toBeVisible();

  // Add a new activity after capture and recalculate → it reads as "Added" variance.
  await addActivity(page, 'Pour slab');
  await page.getByRole('button', { name: 'Recalculate' }).click();
  // "Added" shows in all three variance columns (start/finish/float) for the new activity.
  await expect(page.getByRole('cell', { name: 'Added' }).first()).toBeVisible();

  // The plan view with the baselines panel + variance column is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
