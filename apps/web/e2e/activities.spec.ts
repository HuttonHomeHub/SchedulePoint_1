import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { activityEditor } from '../e2e-support/activity-editor';

import { showActivities } from './workspace';

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
  await page.getByRole('button', { name: /create an account/i }).click();

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

  // The plan workspace shows the (empty) activities panel, and is accessible.
  //
  // The legacy stacked page gave the section an `<h2>Activities`; the workspace names the panel
  // with a plain label in its handle row instead — a heading would claim a document section that
  // the canvas-maximal layout does not have. The empty state is the assertion that survives, and it
  // was always the substantive half.
  await showActivities(page);
  await expect(page.getByText(/No activities yet/)).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);

  // Add a task with a code and a duration.
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The open form dialog is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  await dialog.getByLabel('Name').fill('Excavate');
  await dialog.getByLabel('Code').fill('A100');
  // Just `Duration` since ADR-0070 turned `VITE_SUB_DAY_DURATIONS` on by default: once the field
  // can resolve how many hours this activity's day is worth it reads `d`/`h`/`m` text and stops
  // promising whole days in its label. `10` still means ten days — a bare number always does, which
  // is the property that made the grammar safe to ship into a field planners already used. The
  // whole-days control, and this label, survive on the degraded path and are covered by the unit
  // suites; the sub-day path has its own journey (`e2e-sub-day/`).
  await dialog.getByLabel('Duration', { exact: true }).fill('10');
  // Choosing a constraint reveals its date field — check that revealed state is accessible.
  await dialog.getByLabel('Constraint', { exact: true }).selectOption('SNET');
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
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  await dialog.getByLabel('Name').fill('Kickoff');
  await dialog.getByLabel('Type', { exact: true }).selectOption('START_MILESTONE');
  await expect(dialog.getByLabel('Duration', { exact: true })).toBeHidden();
  await dialog.getByRole('button', { name: 'Create activity' }).click();

  await expect(page.getByRole('cell', { name: 'Kickoff', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Start milestone', exact: true })).toBeVisible();

  // Report progress on the task — the derived status shows in the row afterwards. Row actions
  // live behind an overflow "Actions for …" menu (TECH_DEBT #38): open it, then choose the action.
  //
  // Since ADR-0060 M6 this opens the **tabbed activity editor** on its Progress tab, not a
  // progress-only dialog — Report progress, Edit and Steps are three doors into one editor. This
  // suite runs at the shipped defaults, so it describes that; the previous surface is pinned by the
  // dedicated flag-off suites, and the tabbed permission model by `e2e-activity-editor/`.
  //
  // **`activityEditor`, not `dialog`**: the editor is a modal again (ADR-0101), so both surfaces
  // share a chrome once more — but they are still two dialogs, and `dialog` here is the CREATE one.
  // The helper filters on the editor's own section tablist, which the create dialog does not have.
  const actionsButton = page.getByRole('button', { name: 'Actions for Excavate' });
  await actionsButton.click();
  await page.getByRole('menuitem', { name: 'Report progress' }).click();
  const editor = activityEditor(page);
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('tab', { name: 'Progress', selected: true })).toBeVisible();
  // The editor (three progress panels, live status preview) is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
  /**
   * **Closing hands focus back to whatever opened the editor**, which here is the row menu's
   * "Actions for …" trigger.
   *
   * That is the platform's own reflex rather than a decision of ours: `<dialog>.close()` restores
   * focus to whatever held it when `showModal()` ran, and the row menu has already returned focus to
   * its trigger by then. ADR-0099 docked the editor in the context drawer, which has no such reflex,
   * so that milestone chose the drawer's rail button instead and this line asserted it; ADR-0101
   * returned the editor to a dialog, and with it this behaviour to the one it originally asserted.
   *
   * Nothing is dirty, so the editor closes straight away rather than asking to discard.
   */
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(actionsButton).toBeFocused();

  await actionsButton.click();
  await page.getByRole('menuitem', { name: 'Report progress' }).click();
  await expect(editor).toBeVisible();
  await editor.getByLabel('Percent complete').fill('40');
  // On/before the plan data date (2026-01-05) — an actual after "now" is rejected by N07 (ADR-0035 §6).
  await editor.getByLabel(/Actual start/).fill('2026-01-02');
  await expect(editor.getByText('In progress')).toBeVisible();
  await editor.getByRole('button', { name: 'Save progress' }).click();
  // The editor stays open after a save (ADR-0060) — a multi-scope session would be pointless if
  // saving one section closed the others — so close it before reading the row behind it.
  await expect(editor.getByText('Saved.')).toBeVisible();
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toBeHidden();

  await expect(page.getByRole('cell', { name: 'In progress · 40%', exact: true })).toBeVisible();
});
