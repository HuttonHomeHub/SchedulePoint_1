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
  await navLink(page, 'Calendars').click();
  await expect(page.getByLabel('Search calendars')).toBeVisible();
  await expect(page.getByLabel('Scope')).toHaveValue('org');
  // Default scope is the SHARED library, so the project calendar is deliberately absent…
  // Exact: the row's ACTIONS cell also carries the calendar name, via the "Move to organisation:
  // Site shutdown" button's `aria-label` folded into that cell's accessible name.
  await expect(page.getByRole('cell', { name: 'Site shutdown', exact: true })).toHaveCount(0);
  // …and switching the filter reveals it — which the URL now records, so the view is shareable.
  await page.getByLabel('Scope').selectOption('all');
  await expect(page.getByRole('cell', { name: 'Site shutdown', exact: true })).toBeVisible();
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
  await navLink(page, 'Resources').click();
  await createResource(page, 'Crew A');
  // A second, never-archived resource. It keeps the assign picker non-empty at the end of the
  // journey, so "Crew A is no longer offered" is a REAL absence: with Crew A alone — archived and
  // already assigned — the picker collapses to its empty state and proves nothing.
  await createResource(page, 'Crew B');
  // Exact, for the same reason as the calendar rows: the actions cell carries "Edit/Archive/Delete
  // Crew A" in its accessible name.
  await expect(page.getByRole('cell', { name: 'Crew A', exact: true })).toBeVisible();

  // Assign it to an activity on the Riverside plan.
  await openPlan(page, 'Riverside', 'Riverside Plan');
  await startEditing(page);
  await drawActivity(page, 'Excavate', { x: 220, y: 120 });
  await selectOnlyActivity(page);

  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  // With the activity-editor convergence flag default-on (ADR-0062), this opens the tabbed
  // activity editor on its Resources tab (titled with the activity's own name) rather than the
  // standalone `ActivityResourcesDialog`.
  const assignDialog = page.getByRole('dialog');
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
  // Exact: the dialog chrome's own ✕ is labelled "Close dialog", which a substring match would
  // ambiguously also select (the `e2e-resource-view/support.ts` precedent).
  await assignDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(assignDialog).toBeHidden();

  // Archive it from the library.
  await navLink(page, 'Resources').click();
  await page.getByRole('button', { name: 'Archive Crew A' }).click();
  // Archived rows are hidden by default — the row leaves the ACTIVE list…
  await expect(page.getByRole('cell', { name: 'Crew A', exact: true })).toHaveCount(0);
  // …and is still there, badged, once the filter includes it (and the URL says so).
  await page.getByLabel('Show archived').selectOption('include');
  await expect(page).toHaveURL(/[?&]archived=include/);
  const archivedRow = page.getByRole('row', { name: /Crew A/ });
  await expect(archivedRow.getByText('Archived')).toBeVisible();
  await expect(page.getByText(/keeps working and still schedules exactly as before/)).toBeVisible();

  // The existing assignment SURVIVES — archive retires a resource from new selections only.
  await openPlan(page, 'Riverside', 'Riverside Plan');
  // Re-take the pen: navigating away released it, and assignment writes are pen-gated (ADR-0028),
  // so without it the dialog renders read-only and its assign form — the picker asserted below —
  // is not rendered at all.
  await startEditing(page);
  await selectOnlyActivity(page);
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  const reopened = page.getByRole('dialog');
  await expect(reopened).toBeVisible();
  // The assignment is untouched: the row is still listed under "Assigned".
  await expect(reopened.getByText('Crew A')).toBeVisible();

  // …but it is no longer OFFERED for a new assignment, while untouched Crew B still is — the
  // picker being live is what makes Crew A's absence meaningful.
  await reopened.getByRole('combobox', { name: 'Resource' }).press('ArrowDown');
  const offered = (await reopened.getByRole('listbox').getByRole('option').allInnerTexts()).join(
    '\n',
  );
  expect(offered).toContain('Crew B');
  expect(offered).not.toContain('Crew A');
});

/** Create a library resource from the Resources screen (defaults to the Labour kind). */
async function createResource(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New resource' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create resource' }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Select the plan's single activity through the canvas's **parallel a11y listbox** (ADR-0026). That
 * layer is a keyboard surface sitting behind the canvas, so a pointer click at an option is
 * intercepted by the `<canvas>` itself; focusing the listbox selects the first activity, which is
 * how every other canvas suite drives it (`e2e-loe/support.ts`).
 */
async function selectOnlyActivity(page: Page): Promise<void> {
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await diagram.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
  await expect(diagram.getByRole('option', { selected: true })).toHaveCount(1);
}

/**
 * A link in the org's own top nav. Scoped, because once the journey is deep in the hierarchy the
 * breadcrumb repeats these names — a bare `getByRole('link', { name: 'Clients' })` then matches the
 * nav link AND the breadcrumb link.
 */
function navLink(page: Page, name: string): ReturnType<Page['getByRole']> {
  return page.getByLabel('Organisation', { exact: true }).getByRole('link', { name, exact: true });
}

/** Navigate Clients → client → project → plan, creating the project/plan on the way. */
async function createClientProjectPlan(
  page: Page,
  projectName: string,
  planName: string,
  { newProject = false }: { newProject?: boolean } = {},
): Promise<void> {
  await navLink(page, 'Clients').click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  if (newProject) await createProject(page, projectName);
  else await page.getByRole('link', { name: projectName }).click();
  await createPlan(page, planName);
}

/** Navigate to an existing plan: Clients → client → project → plan. */
async function openPlan(page: Page, projectName: string, planName: string): Promise<void> {
  await navLink(page, 'Clients').click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('link', { name: projectName }).click();
  await page.getByRole('link', { name: planName }).click();
}
