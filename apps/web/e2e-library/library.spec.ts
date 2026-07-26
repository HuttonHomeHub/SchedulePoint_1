import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  calendarPickerOptions,
  createClient,
  createPlan,
  createProject,
  drawActivity,
  onboard,
  startEditing,
} from './support';

/**
 * Flag-ON **library scoping & manageability** journey (`VITE_LIBRARY_SCOPING`, ADR-0053). It proves
 * the two claims the whole epic rests on, end to end against a real API and database — the claims a
 * unit test can only assert against a mock:
 *
 * 1. **The calendar tier is a boundary, not a label.** A calendar created in one project is offered
 *    to that project's plan, under its own tier group — and is *absent* from a sibling project's
 *    plan picker. (The API enforces the same thing with a 422; here we prove the picker can never
 *    even offer the refused choice.)
 * 2. **Archive is not delete.** An archived resource keeps the assignment it already has — the row
 *    is still there, still budgeted — while disappearing from the picker that would create new ones.
 *    That distinction is the feature's single biggest usability risk, so it is asserted, not assumed.
 *
 * Serial (one org, two projects and a shared plan mutate throughout); Chromium only (TECH_DEBT #25a).
 */
test('a project calendar is scoped to its project, and archiving retires a resource without unassigning it', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await createClient(page, 'Northgate');

  // ---------------------------------------------------------------- 1. Project-scoped calendar
  await createProject(page, 'Riverside');

  // The project's own Calendars section (ADR-0053 §1) — its calendars, plus every org one.
  const calendarsSection = page.getByRole('table', { name: /Calendars usable in Riverside/ });
  await expect(calendarsSection).toBeVisible();

  await page.getByRole('button', { name: 'New calendar' }).click();
  const calendarDialog = page.getByRole('dialog');
  await calendarDialog.getByLabel('Name').fill('Site shutdown');
  // Opened from a project, the scope choice defaults to that project — no re-picking required.
  await expect(calendarDialog.getByLabel('Scope')).toHaveValue('PROJECT');
  await calendarDialog.getByRole('button', { name: 'Create calendar' }).click();
  await expect(calendarDialog).toBeHidden();

  // It lands in the project's section, badged with the owning project (never bare "Project").
  await expect(calendarsSection.getByText('Site shutdown')).toBeVisible();
  await expect(calendarsSection.getByText('Project: Riverside')).toBeVisible();

  // The library screen is accessible with the new tier column, filters and search in place.
  await page.getByRole('link', { name: 'Calendars', exact: true }).click();
  await expect(page.getByLabel('Search calendars')).toBeVisible();
  await expect(page.getByLabel('Scope')).toHaveValue('org');
  // Default scope is the SHARED library, so the project calendar is deliberately absent…
  await expect(page.getByRole('cell', { name: 'Site shutdown' })).toHaveCount(0);
  // …and switching the filter reveals it — which the URL now records, so the view is shareable.
  await page.getByLabel('Scope').selectOption('all');
  await expect(page.getByRole('cell', { name: 'Site shutdown' })).toBeVisible();
  await expect(page).toHaveURL(/[?&]scope=all/);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);

  // A reload keeps the filtered view — the whole point of putting it in the URL.
  await page.reload();
  await expect(page.getByLabel('Scope')).toHaveValue('all');

  // (1a) Inside Riverside, the plan picker offers it.
  await createClientProjectPlan(page, 'Riverside', 'Riverside Plan');
  expect((await calendarPickerOptions(page)).join('\n')).toContain('Site shutdown');

  // (1b) In a SIBLING project it is not offered at all — the tier is a real boundary.
  await createClientProjectPlan(page, 'Northbank', 'Northbank Plan', { newProject: true });
  expect((await calendarPickerOptions(page)).join('\n')).not.toContain('Site shutdown');

  // ------------------------------------------------------------------- 2. Resource archiving
  await page.getByRole('link', { name: 'Resources', exact: true }).click();
  await page.getByRole('button', { name: 'New resource' }).click();
  const resourceDialog = page.getByRole('dialog');
  await resourceDialog.getByLabel('Name').fill('Crew A');
  await resourceDialog.getByRole('button', { name: 'Create resource' }).click();
  await expect(resourceDialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Crew A' })).toBeVisible();

  // Assign it to an activity on the Riverside plan.
  await openPlan(page, 'Riverside', 'Riverside Plan');
  await startEditing(page);
  await drawActivity(page, 'Excavate', { x: 220, y: 120 });
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await diagram.getByRole('option').first().click();

  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const assignDialog = page.getByRole('dialog', { name: 'Resources' });
  await expect(assignDialog).toBeVisible();
  // The picker is the shared searched Combobox behind the flag, not a native select.
  await assignDialog.getByRole('combobox', { name: 'Resource' }).press('ArrowDown');
  await assignDialog
    .getByRole('option', { name: /Crew A/ })
    .first()
    .click();
  await assignDialog.getByLabel('Budgeted units').fill('16');
  await assignDialog.getByRole('button', { name: 'Assign resource' }).click();
  await expect(assignDialog.getByText('Crew A')).toBeVisible();
  await assignDialog.getByRole('button', { name: 'Close' }).click();
  await expect(assignDialog).toBeHidden();

  // Archive it from the library.
  await page.getByRole('link', { name: 'Resources', exact: true }).click();
  await page.getByRole('button', { name: 'Archive Crew A' }).click();
  // Archived rows are hidden by default — the row leaves the ACTIVE list…
  await expect(page.getByRole('cell', { name: 'Crew A' })).toHaveCount(0);
  // …and is still there, badged, once the filter includes it (and the URL says so).
  await page.getByLabel('Show archived').selectOption('include');
  await expect(page).toHaveURL(/[?&]archived=include/);
  const archivedRow = page.getByRole('row', { name: /Crew A/ });
  await expect(archivedRow.getByText('Archived')).toBeVisible();
  await expect(page.getByText(/keeps working and still schedules exactly as before/)).toBeVisible();

  // The existing assignment SURVIVES — archive retires a resource from new selections only.
  await openPlan(page, 'Riverside', 'Riverside Plan');
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await diagram.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const reopened = page.getByRole('dialog', { name: 'Resources' });
  await expect(reopened).toBeVisible();
  // The assignment is untouched: the row is still listed under "Assigned".
  await expect(reopened.getByText('Crew A')).toBeVisible();

  // …but it is no longer OFFERED for a new assignment.
  await reopened.getByRole('combobox', { name: 'Resource' }).press('ArrowDown');
  const offered = await reopened.getByRole('listbox').getByRole('option').allInnerTexts();
  expect(offered.join('\n')).not.toContain('Crew A');
});

/** Navigate Clients → client → project → plan, creating the project/plan on the way. */
async function createClientProjectPlan(
  page: Page,
  projectName: string,
  planName: string,
  { newProject = false }: { newProject?: boolean } = {},
): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  if (newProject) await createProject(page, projectName);
  else await page.getByRole('link', { name: projectName }).click();
  await createPlan(page, planName);
}

/** Navigate to an existing plan: Clients → client → project → plan. */
async function openPlan(page: Page, projectName: string, planName: string): Promise<void> {
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('link', { name: projectName }).click();
  await page.getByRole('link', { name: planName }).click();
}
