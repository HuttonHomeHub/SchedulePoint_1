import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The activity-authoring journey: onboard an org, create a client → project →
 * plan, then add activities to the plan and see them in the table — with an
 * accessibility check on the plan-detail screen and the open form dialog.
 * Requires the API (with a database) running and reachable via the dev proxy.
 */
test('a user can add activities to a plan (accessible)', async ({ page }) => {
  const stamp = Date.now();
  const email = `activities-${stamp}@example.com`;
  const orgName = `Activity Co ${stamp}`;
  const orgSlug = `activity-co-${stamp}`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Activity Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));

  // Client → project → plan.
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

  // The plan-detail screen shows the (empty) Activities section, and is accessible.
  await expect(page.getByRole('heading', { name: 'Activities' })).toBeVisible();
  await expect(page.getByText(/No activities yet/)).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);

  // Add a task with a code and a duration.
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The open form dialog is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await dialog.getByLabel('Name').fill('Excavate');
  await dialog.getByLabel('Code (optional)').fill('A100');
  await dialog.getByLabel('Duration (working days)', { exact: true }).fill('10');
  // Choosing a constraint reveals its date field — check that revealed state is accessible.
  await dialog.getByLabel('Constraint (optional)').selectOption('SNET');
  await dialog.getByLabel('Constraint date').fill('2026-05-01');
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await dialog.getByRole('button', { name: 'Create activity' }).click();

  // It appears in the table with its code, type and duration.
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'A100', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '10 d', exact: true })).toBeVisible();

  // Adding a milestone hides the duration field and shows an em-dash duration.
  await page.getByRole('button', { name: 'New activity' }).click();
  await dialog.getByLabel('Name').fill('Kickoff');
  await dialog.getByLabel('Type', { exact: true }).selectOption('START_MILESTONE');
  await expect(dialog.getByLabel('Duration (working days)', { exact: true })).toBeHidden();
  await dialog.getByRole('button', { name: 'Create activity' }).click();

  await expect(page.getByRole('cell', { name: 'Kickoff', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Start milestone', exact: true })).toBeVisible();

  // Report progress on the task — the derived status shows in the row afterwards. Row actions
  // live behind an overflow "Actions for …" menu (TECH_DEBT #38): open it, then choose the action.
  const actionsButton = page.getByRole('button', { name: 'Actions for Excavate' });
  await actionsButton.click();
  await page.getByRole('menuitem', { name: 'Report progress' }).click();
  await expect(dialog).toBeVisible();
  // The progress dialog (with its live status preview) is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  // Cancelling returns focus to the trigger (native <dialog> focus restore) — the menu's
  // own close-and-restore already returned focus to the "Actions for …" trigger before the
  // dialog opened, so that's what the dialog restores focus to.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(actionsButton).toBeFocused();

  await actionsButton.click();
  await page.getByRole('menuitem', { name: 'Report progress' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Percent complete').fill('40');
  // On/before the plan data date (2026-01-05) — an actual after "now" is rejected by N07 (ADR-0035 §6).
  await dialog.getByLabel(/Actual start/).fill('2026-01-02');
  await expect(dialog.getByText('In progress')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save progress' }).click();

  await expect(page.getByRole('cell', { name: 'In progress · 40%', exact: true })).toBeVisible();
});
