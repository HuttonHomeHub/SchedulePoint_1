import AxeBuilder from '@axe-core/playwright';
import { type Locator, type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

/** The organisation nav in the header — scoped so its links don't clash with breadcrumbs. */
function navLink(page: Page, name: string): Locator {
  return page
    .getByRole('navigation', { name: 'Organisation' })
    .getByRole('link', { name, exact: true });
}

async function onboard(page: Page, label: string): Promise<string> {
  const stamp = Date.now();
  const orgSlug = `${label}-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Tidy Tester');
  await page.getByLabel('Email').fill(`${label}-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`${label} Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/** Seeds through the public API with the browser's own session; the journey is about the screen. */
function api(page: Page, orgSlug: string) {
  const base = `/api/v1/organizations/${orgSlug}`;
  return {
    async post(path: string, data: unknown): Promise<{ id: string }> {
      const res = await page.request.post(`${base}${path}`, { data });
      expect(res.ok(), `POST ${path}: ${res.status()}`).toBe(true);
      return ((await res.json()) as { data: { id: string } }).data;
    },
    async bindPlan(planId: string, calendarId: string): Promise<void> {
      const read = await page.request.get(`${base}/plans/${planId}`);
      const version = ((await read.json()) as { data: { version: number } }).data.version;
      const res = await page.request.patch(`${base}/plans/${planId}`, {
        data: { calendarId, version },
      });
      expect(res.ok(), `PATCH plan: ${res.status()}`).toBe(true);
    },
  };
}

/**
 * **Remove unused calendars… from the project screen** (ADR-0208 D5, spec US-2, M2).
 *
 * A project holds one calendar a plan uses ("Kept") and two copies nothing uses, as a run of
 * re-imports leaves behind. The planner opens the project, presses **Remove unused calendars…**, sees
 * exactly the two copies ticked and "Kept" absent, deletes both in one confirmation, and then finds
 * each in **Recently deleted** as its own row with its own Restore. Restoring one brings it back to
 * the project and leaves the other in the bin, which is the property one shared delete batch would
 * have broken.
 */
test('a planner clears a project’s unused calendars and restores one of them (accessible)', async ({
  page,
}) => {
  const orgSlug = await onboard(page, 'caltidy');
  const seed = api(page, orgSlug);
  const client = await seed.post('/clients', { name: 'Northgate' });
  const project = await seed.post(`/clients/${client.id}/projects`, { name: 'Riverside' });
  const own = (name: string) =>
    seed.post('/calendars', {
      name,
      workingWeekdays: 31,
      scope: 'PROJECT',
      projectId: project.id,
    });
  const kept = await own('Kept');
  await own('Site 6-Day (imported 2026-10-20)');
  await own('Site 6-Day (imported 2026-10-21)');
  const plan = await seed.post(`/projects/${project.id}/plans`, {
    name: 'Rev A',
    plannedStart: '2026-01-05',
  });
  await seed.bindPlan(plan.id, kept.id);

  await page.goto(`/orgs/${orgSlug}/projects/${project.id}`);
  const section = page.getByRole('table', { name: /^Calendars belonging to/ });
  await expect(section.getByRole('button', { name: 'Edit Kept' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove unused calendars…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove unused calendars' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toHaveCount(2);
  await expect(dialog.getByRole('checkbox', { name: /imported 2026-10-20/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /imported 2026-10-21/ })).toBeChecked();
  await expect(dialog.getByText('Kept')).toHaveCount(0);

  // The open dialog stays WCAG 2.2 AA, with its checkbox list and the destructive action.
  const results = await new AxeBuilder({ page })
    .include('dialog[open]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await dialog.getByRole('button', { name: 'Delete 2 calendars' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText('2 calendars deleted. You can restore them from Recently deleted.'),
  ).toBeAttached();
  // Nothing is left to remove, so the entry point goes, and the used calendar stays.
  await expect(page.getByRole('button', { name: 'Remove unused calendars…' })).toHaveCount(0);
  // The button that held focus is gone, so focus is handed to the Calendars section (ADR-0135).
  await expect(page.getByRole('region', { name: 'Calendars', exact: true })).toBeFocused();
  await expect(section.getByRole('button', { name: 'Edit Kept' })).toBeVisible();
  await expect(section.getByRole('button', { name: /imported/ })).toHaveCount(0);

  // Each copy is its own row in the bin, with its own Restore.
  await navLink(page, 'Recently deleted').click();
  await expect(
    page.getByRole('button', { name: 'Restore calendar Site 6-Day (imported 2026-10-20)' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Restore calendar Site 6-Day (imported 2026-10-21)' }),
  ).toBeVisible();
  await expect(page.getByRole('table', { name: /recently deleted/i }).getByRole('row')).toHaveCount(
    3, // the header row + one per calendar
  );

  await page
    .getByRole('button', { name: 'Restore calendar Site 6-Day (imported 2026-10-20)' })
    .click();
  await expect(
    page.getByRole('button', { name: 'Restore calendar Site 6-Day (imported 2026-10-21)' }),
  ).toBeVisible();

  // The restored one is back in the project, and it is offered for removal again.
  await page.goto(`/orgs/${orgSlug}/projects/${project.id}`);
  await expect(
    section.getByRole('button', { name: 'Edit Site 6-Day (imported 2026-10-20)' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove unused calendars…' })).toBeVisible();
});
