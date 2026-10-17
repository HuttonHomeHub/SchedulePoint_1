import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

/** The organisation nav in the header — scoped so its links don't clash with breadcrumbs. */
function navLink(page: Page, name: string): Locator {
  return page
    .getByRole('navigation', { name: 'Organisation' })
    .getByRole('link', { name, exact: true });
}

/**
 * The recycle-bin journeys: a planner deletes hierarchy rows, finds them in
 * "Recently deleted", and restores them. Covers the cascade view (a deleted
 * client is restorable while its deleted descendants show "restore the parent
 * first") with an accessibility check, and the direct single-item restore
 * round-trip. Requires the API (with a database) running via the dev proxy.
 */
async function onboard(page: Page, label: string): Promise<string> {
  const stamp = Date.now();
  const email = `${label}-${stamp}@example.com`;
  const orgName = `${label} Co ${stamp}`;
  const orgSlug = `${label}-co-${stamp}`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Bin Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();

  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(orgName);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

test('a deleted client cascade is shown and restored from the recycle bin (accessible)', async ({
  page,
}) => {
  await onboard(page, 'bin');

  // Build a client → project → plan.
  await navLink(page, 'Clients').click();
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
  await expect(page.getByRole('link', { name: 'Baseline' })).toBeVisible();

  // Delete the client (cascades to the project + plan).
  await navLink(page, 'Clients').click();
  await page.getByRole('button', { name: 'Actions for Northgate in Clients' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  // This suite's API leaves the clear-out off (the default), so the sentence promises no deadline
  // (`docs/TECH_DEBT.md` #140); `e2e-recently-deleted` pins the armed wording.
  await expect(page.getByRole('alertdialog')).toContainText(
    'You can restore it from Recently deleted.',
  );
  await expect(page.getByRole('alertdialog')).not.toContainText('permanently');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/No clients yet/)).toBeVisible();

  // The recycle bin: ONE row for the whole deletion (ADR-0096).
  await navLink(page, 'Recently deleted').click();
  await expect(page.getByRole('heading', { name: 'Recently deleted' })).toBeVisible();

  // **This asserted three rows and "Restore its parent first" twice until ADR-0096.** A cascade
  // stamps one `delete_batch_id` and the restore is keyed on it, so the descendants were never
  // independently actionable and that message described work the product already does. It is gone
  // because the situation is, and the count is the honest way to say so.
  await expect(page.getByText('Restore its parent first')).toHaveCount(0);
  await expect(page.getByRole('table', { name: /recently deleted/i }).getByRole('row')).toHaveCount(
    2, // the header row + one deletion
  );
  // What it took is disclosed rather than hidden, and named by kind.
  await expect(
    page.getByRole('button', { name: 'Northgate: and 1 project, 1 plan', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Restore client Northgate and 1 project, 1 plan' }),
  ).toBeVisible();

  // The recycle-bin screen is accessible.
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  // Restoring the client brings the whole batch back and empties the bin.
  await page
    .getByRole('button', { name: 'Restore client Northgate and 1 project, 1 plan' })
    .click();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();

  // The client is active again.
  await navLink(page, 'Clients').click();
  await expect(page.getByRole('link', { name: 'Northgate' })).toBeVisible();
});

test('a directly-deleted plan can be restored from the recycle bin', async ({ page }) => {
  await onboard(page, 'binplan');

  await navLink(page, 'Clients').click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Acme');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Acme' }).click();

  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Depot');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Depot' }).click();

  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Baseline');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await expect(page.getByRole('link', { name: 'Baseline' })).toBeVisible();

  // Delete just the plan.
  await page.getByRole('button', { name: 'Actions for Baseline in Plans' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(/No plans yet/)).toBeVisible();

  // Restore it from the bin (exact name cell — avoids the announcer and actions cell).
  await navLink(page, 'Recently deleted').click();
  await expect(page.getByRole('cell', { name: 'Baseline', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore plan Baseline' }).click();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();

  // It's back under its project (navigate there through the hierarchy).
  await navLink(page, 'Clients').click();
  await page.getByRole('link', { name: 'Acme' }).click();
  await page.getByRole('link', { name: 'Depot' }).click();
  await expect(page.getByRole('link', { name: 'Baseline' })).toBeVisible();
});

/**
 * The library half of the bin (ADR-0195). Rows are seeded through the API with the browser's own
 * session — these journeys are about what the screen does with a deleted resource or calendar, not
 * about authoring one — and the first two each start with a delete made through the real library UI,
 * because the invalidation that puts the row in the bin is the seam a unit suite cannot see.
 */
function libraryApi(page: Page, orgSlug: string) {
  const base = `/api/v1/organizations/${orgSlug}`;
  return {
    async post(path: string, data: unknown): Promise<{ id: string }> {
      const res = await page.request.post(`${base}${path}`, { data });
      expect(res.ok(), `POST ${path}: ${res.status()}`).toBe(true);
      return ((await res.json()) as { data: { id: string } }).data;
    },
    async remove(path: string): Promise<void> {
      const res = await page.request.delete(`${base}${path}`);
      expect(res.ok(), `DELETE ${path}: ${res.status()}`).toBe(true);
    },
  };
}

test('a resource deleted in the library is restored from the recycle bin (accessible)', async ({
  page,
}) => {
  const orgSlug = await onboard(page, 'binres');
  const api = libraryApi(page, orgSlug);
  await api.post('/resources', { name: 'Crane A', kind: 'EQUIPMENT' });

  await navLink(page, 'Resources').click();
  await page.getByRole('button', { name: 'Actions for Crane A' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  // Library rows never expire, so the sentence promises recovery and names no deadline.
  await expect(page.getByRole('alertdialog')).toContainText(
    'You can restore it from Recently deleted.',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Actions for Crane A' })).toHaveCount(0);

  await navLink(page, 'Recently deleted').click();
  await expect(page.getByRole('cell', { name: 'Resource', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Crane A', exact: true })).toBeVisible();
  await expect(page.getByText(/Expires/)).toHaveCount(0);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole('button', { name: 'Restore resource Crane A' }).click();
  await expect(page.getByText('Resource “Crane A” restored.')).toBeAttached();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();

  await navLink(page, 'Resources').click();
  await expect(page.getByRole('button', { name: 'Actions for Crane A' })).toBeVisible();
});

test('a child deleted before its group needs the group restored first, in two presses', async ({
  page,
}) => {
  const orgSlug = await onboard(page, 'bingrp');
  const api = libraryApi(page, orgSlug);
  const group = await api.post('/resources', { name: 'Groundworks', kind: 'GROUP' });
  const child = await api.post('/resources', {
    name: 'Crew A',
    kind: 'LABOUR',
    parentId: group.id,
  });
  await api.remove(`/resources/${child.id}`);
  await api.remove(`/resources/${group.id}`);

  await navLink(page, 'Recently deleted').click();
  await expect(page.getByText(/Blocked by a deleted resource group, .Groundworks./)).toBeVisible();
  await page.getByRole('button', { name: 'Restore resource group first…: Groundworks' }).click();

  // The confirmation names the group and what comes back with it, then takes a second press.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Resource “Crew A” sits inside Groundworks');
  await dialog.getByRole('button', { name: 'Restore Groundworks' }).click();

  await page.getByRole('button', { name: 'Restore resource Crew A' }).click();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();
});

test('a calendar deleted in the library is restored from the recycle bin', async ({ page }) => {
  const orgSlug = await onboard(page, 'bincal');
  const api = libraryApi(page, orgSlug);
  await api.post('/calendars', { name: 'Crane hours', workingWeekdays: 31 });

  await navLink(page, 'Calendars').click();
  await page.getByRole('button', { name: 'Actions for Crane hours' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'You can restore it from Recently deleted.',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();

  await navLink(page, 'Recently deleted').click();
  await expect(page.getByRole('cell', { name: 'Calendar (organisation)' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore calendar Crane hours' }).click();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();

  await navLink(page, 'Calendars').click();
  await expect(page.getByRole('button', { name: 'Actions for Crane hours' })).toBeVisible();
});

test('a project’s own calendar is listed inside the project’s deletion', async ({ page }) => {
  const orgSlug = await onboard(page, 'binpcal');
  const api = libraryApi(page, orgSlug);
  const client = await api.post('/clients', { name: 'Northgate' });
  const project = await api.post(`/clients/${client.id}/projects`, { name: 'Tower' });
  await api.post('/calendars', {
    name: 'Tower week',
    workingWeekdays: 31,
    scope: 'PROJECT',
    projectId: project.id,
  });
  await api.remove(`/projects/${project.id}`);

  await navLink(page, 'Recently deleted').click();
  // ONE row, rooted at the project, naming the calendar it took — and the calendar is not
  // separately restorable (it comes back with its project).
  await expect(page.getByRole('table', { name: /recently deleted/i }).getByRole('row')).toHaveCount(
    2,
  );
  await expect(
    page.getByRole('button', { name: 'Restore project Tower and 1 calendar' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore project Tower and 1 calendar' }).click();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();
});

test('the Show filter narrows the bin by the keyboard and survives a reload', async ({ page }) => {
  const orgSlug = await onboard(page, 'binshow');
  const api = libraryApi(page, orgSlug);
  const resource = await api.post('/resources', { name: 'Crane A', kind: 'EQUIPMENT' });
  const calendar = await api.post('/calendars', { name: 'Crane hours', workingWeekdays: 31 });
  await api.remove(`/resources/${resource.id}`);
  await api.remove(`/calendars/${calendar.id}`);

  await navLink(page, 'Recently deleted').click();
  const group = page.getByRole('radiogroup', { name: 'Show' });
  await expect(group.getByRole('radio', { name: 'All' })).toBeChecked();
  await expect(page.getByRole('cell', { name: 'Crane A', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Crane hours', exact: true })).toBeVisible();

  // The APG radiogroup: Arrow keys move the selection (All → Clients, projects & plans → Resources).
  await group.getByRole('radio', { name: 'All' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio', { name: 'Resources' })).toBeChecked();
  await expect(page).toHaveURL(/[?&]show=resources/);
  await expect(page.getByRole('cell', { name: 'Crane A', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Crane hours', exact: true })).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: 'Resources' }),
  ).toBeChecked();
  await expect(page.getByRole('cell', { name: 'Crane hours', exact: true })).toHaveCount(0);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);
});

/**
 * A plan restore never brings work back onto a deleted calendar (ADR-0200, `docs/TECH_DEBT.md` #519).
 * The row says what its restore would refuse before anything is pressed, and the cure is the two-press
 * flow ADR-0195 shipped for resources: restore the calendar, then the plan.
 */
test('a plan whose calendar was deleted after it is restored in two presses (accessible)', async ({
  page,
}) => {
  const orgSlug = await onboard(page, 'bincalplan');
  const api = libraryApi(page, orgSlug);
  const client = await api.post('/clients', { name: 'Northgate' });
  const project = await api.post(`/clients/${client.id}/projects`, { name: 'Tower' });
  const calendar = await api.post('/calendars', { name: 'Mon-Wed', workingWeekdays: 7 });
  const plan = await api.post(`/projects/${project.id}/plans`, {
    name: 'Tower A',
    plannedStart: '2026-01-05',
  });
  const read = await page.request.get(`/api/v1/organizations/${orgSlug}/plans/${plan.id}`);
  const version = ((await read.json()) as { data: { version: number } }).data.version;
  const bound = await page.request.patch(`/api/v1/organizations/${orgSlug}/plans/${plan.id}`, {
    data: { calendarId: calendar.id, version },
  });
  expect(bound.ok(), `PATCH plan: ${bound.status()}`).toBe(true);
  await api.remove(`/plans/${plan.id}`);
  await api.remove(`/calendars/${calendar.id}`);

  await navLink(page, 'Recently deleted').click();
  // The blocker is named under the row it blocks, before any press.
  await expect(page.getByText('Uses deleted calendar “Mon-Wed”')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore plan Tower A' })).toHaveCount(0);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole('button', { name: 'Restore calendar first…: Mon-Wed' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Plan “Tower A” uses the calendar “Mon-Wed”');
  await dialog.getByRole('button', { name: 'Restore Mon-Wed' }).click();

  await page.getByRole('button', { name: 'Restore plan Tower A' }).click();
  await expect(page.getByText(/Nothing has been deleted/)).toBeVisible();
});

/**
 * A plan cannot come back onto a calendar that now belongs to another project (ADR-0200 D5). The
 * server refuses, the alert says why in the planner's words, and its link goes to the library where
 * the cure (making the calendar organisation-wide again) is made.
 */
test('a plan whose calendar moved to another project is refused, with a way to the library', async ({
  page,
}) => {
  const orgSlug = await onboard(page, 'bincalmove');
  const api = libraryApi(page, orgSlug);
  const base = `/api/v1/organizations/${orgSlug}`;
  const client = await api.post('/clients', { name: 'Northgate' });
  const project = await api.post(`/clients/${client.id}/projects`, { name: 'Tower' });
  const elsewhere = await api.post(`/clients/${client.id}/projects`, { name: 'Elsewhere' });
  const calendar = await api.post('/calendars', { name: 'Site hours', workingWeekdays: 31 });
  const plan = await api.post(`/projects/${project.id}/plans`, {
    name: 'Tower A',
    plannedStart: '2026-01-05',
  });
  const planRead = await page.request.get(`${base}/plans/${plan.id}`);
  const planVersion = ((await planRead.json()) as { data: { version: number } }).data.version;
  const bound = await page.request.patch(`${base}/plans/${plan.id}`, {
    data: { calendarId: calendar.id, version: planVersion },
  });
  expect(bound.ok(), `PATCH plan: ${bound.status()}`).toBe(true);
  await api.remove(`/plans/${plan.id}`);
  const calRead = await page.request.get(`${base}/calendars/${calendar.id}`);
  const calVersion = ((await calRead.json()) as { data: { version: number } }).data.version;
  const narrowed = await page.request.patch(`${base}/calendars/${calendar.id}`, {
    data: { scope: 'PROJECT', projectId: elsewhere.id, version: calVersion },
  });
  expect(narrowed.ok(), `PATCH calendar: ${narrowed.status()}`).toBe(true);

  await navLink(page, 'Recently deleted').click();
  // Not a deleted calendar, so the row predicts nothing and the press is what finds out.
  await page.getByRole('button', { name: 'Restore plan Tower A' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'now belongs to another project' });
  await expect(alert).toContainText('It uses the calendar “Site hours”');
  await expect(alert.getByRole('link', { name: 'Open the calendars library' })).toBeVisible();
});
