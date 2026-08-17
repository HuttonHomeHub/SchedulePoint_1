import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { chooseComboboxOption, comboboxField } from './combobox';
import { awaitComputedSchedule, expectNoComputedSchedule, showActivities } from './workspace';

/**
 * The CPM schedule journey (M6): a Planner sets the plan's start date, adds two
 * linked activities, and recalculates — the summary strip and the activities
 * table fill with computed dates and a critical-path badge — with an
 * accessibility check on the result. A second flow covers picking the plan's
 * working-day calendar and recalculating on it. Requires the API (with a
 * database) running and reachable via the dev proxy.
 */
async function onboard(page: Page, stamp: number): Promise<string> {
  const email = `sched-${stamp}@example.com`;
  const orgSlug = `sched-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Sched Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Sched Co ${stamp}`);
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

test('a planner sets a start date, recalculates, and sees the critical path (accessible)', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);

  // Give the plan a start date so it can be scheduled.
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();

  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');

  // Link Excavate → Pour slab so there is a chain to schedule — row actions live behind an
  // overflow "Actions for …" menu (TECH_DEBT #38): open it, then choose Logic.
  await page.getByRole('button', { name: 'Actions for Pour slab' }).click();
  await page.getByRole('menuitem', { name: 'Logic' }).click();
  const dialog = page.getByRole('dialog');
  // The add form is inline in the Logic tab of the activity editor (ADR-0061 §2 / ADR-0062), so
  // there is no sub-dialog to wait out before Close. `exact: true` disambiguates the editor's own
  // "Close" footer button from the dialog chrome's "Close dialog" ✕, whose accessible name is a
  // substring match otherwise.
  await dialog.getByLabel('Predecessor activity').selectOption({ label: 'Excavate' });
  await dialog.getByRole('button', { name: 'Add link' }).click();
  await expect(dialog.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  // Before recompute there is no computed schedule. The legacy page said so in the summary strip;
  // on the workspace that strip is inside the `Summary ▾` popover, so the text is real but one
  // click away — and a precondition check should not depend on opening a popover.
  await expectNoComputedSchedule(page, orgSlug);

  await page.getByRole('button', { name: 'Recalculate' }).click();

  // The summary strip and the table now show the computed schedule.
  await awaitComputedSchedule(page, orgSlug);
  await expect(page.getByRole('cell', { name: 'Critical', exact: true }).first()).toBeVisible();

  // The computed plan view is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});

test('a planner picks the plan calendar and recalculates on it (accessible)', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);

  // Give the plan a start date so it can be scheduled.
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();

  // The plan defaults to the org's seeded Standard (Mon–Fri) calendar. Behind
  // `VITE_LIBRARY_SCOPING` (ADR-0053 §4) this picker is the shared APG combobox, not a native
  // `<select>` — the empty option renders as its label rather than blanking the field.
  //
  // It sits in **Schedule settings** on the workspace, not inline on the page: the legacy stacked
  // layout could afford a settings block beside the table, and the canvas-maximal one collects
  // "everything that changes how this plan's dates are calculated" behind one Row-2 trigger
  // (`Settings…`). So the dialog has to be opened before the picker exists.
  await page.getByRole('button', { name: 'Settings…' }).click();
  await expect(page.getByRole('dialog', { name: 'Schedule settings' })).toBeVisible();
  const calendar = comboboxField(page, 'Calendar');
  await expect(calendar).toHaveValue('Standard');

  // Switch to all-days-work, then back to Standard — the choice persists.
  await chooseComboboxOption(page, 'Calendar', 'None (all days work)');
  await chooseComboboxOption(page, 'Calendar', 'Standard');

  // Close it: it is a modal, so it blocks the activities panel underneath.
  await page
    .getByRole('dialog', { name: 'Schedule settings' })
    .getByRole('button', { name: 'Close dialog' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Schedule settings' })).toBeHidden();

  await addActivity(page, 'Excavate');
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await awaitComputedSchedule(page, orgSlug);

  // The plan view with the calendar picker is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
