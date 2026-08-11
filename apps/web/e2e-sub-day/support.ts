import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **sub-day durations and lags** suite
 * (`VITE_SUB_DAY_DURATIONS`, ADR-0070). The onboarding + hierarchy helpers mirror
 * `e2e-activity-editor/support.ts`; the plan surface is the legacy stacked page (canvas pinned off
 * in the config), so activities are added inline from the table.
 */

/** Sign up + create an organisation; returns the org slug. The actor is the org's Org Admin. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `subday-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Sub Day Tester');
  await page.getByLabel('Email').fill(`subday-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Subday Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/**
 * Create an **eight-hour** working-week calendar through the API and return its id.
 *
 * Through the API rather than the shift editor's UI on purpose: that surface has its own journey
 * (`e2e-calendar-shifts`), and a suite about durations should not fail because a time field moved.
 * What matters here is only that the plan is measured on a day worth **480 minutes and not 1440** —
 * the factor the whole epic turns on, and the one a 24-hour default would silently get wrong.
 */
export async function createEightHourCalendar(page: Page, orgSlug: string): Promise<string> {
  return page.evaluate(async (slug) => {
    const shifts = [0, 1, 2, 3, 4].map((weekday) => ({
      weekday,
      startMinute: 8 * 60,
      endMinute: 16 * 60,
    }));
    const res = await fetch(`/api/v1/organizations/${slug}/calendars`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Eight hour week', shifts }),
    });
    const body = (await res.json()) as { data: { id: string; hoursPerDay: number } };
    if (body.data.hoursPerDay !== 8) {
      throw new Error(`expected an 8-hour day, got ${String(body.data.hoursPerDay)}`);
    }
    return body.data.id;
  }, orgSlug);
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

/**
 * Create a plan under the current project, bind it to the given calendar, and open it.
 *
 * The **create** dialog carries no calendar field — a plan is bound to one by editing it — so the
 * binding goes through the API and the page is reloaded onto the result. Doing it in the UI would
 * make this suite depend on the plan-settings surface, which has its own coverage and is not what
 * these tests are about; what matters here is only that the plan's day is worth 480 minutes.
 */
export async function createAndOpenPlan(
  page: Page,
  name: string,
  orgSlug: string,
  calendarId: string,
): Promise<string> {
  await page.getByRole('button', { name: 'New plan' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel(/Planned start/).fill('2026-01-05');
  await dialog.getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();

  const planId = planIdOf(page.url());
  await page.evaluate(
    async ({ slug, planId, calendarId }) => {
      const read = await fetch(`/api/v1/organizations/${slug}/plans/${planId}`);
      const { data } = (await read.json()) as { data: { version: number } };
      const res = await fetch(`/api/v1/organizations/${slug}/plans/${planId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ calendarId, version: data.version }),
      });
      if (!res.ok) throw new Error(`plan calendar PATCH ${String(res.status)}`);
    },
    { slug: orgSlug, planId, calendarId },
  );
  await page.reload();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  return planId;
}

/**
 * The plan id, read from the URL rather than from a list fetch: there is no org-level plans route,
 * and guessing at one is how a test ends up asserting its own request instead of the server's rule.
 */
export function planIdOf(url: string): string {
  const id = /\/plans\/([0-9a-f-]{36})/.exec(url)?.[1];
  if (!id) throw new Error(`no plan id in ${url}`);
  return id;
}

/** Take the pen, whether or not this session already holds it. Writes are pen-gated (ADR-0028). */
export async function ensurePen(page: Page): Promise<void> {
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) return;
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(stop).toBeVisible();
}

/**
 * Add an activity, typing its duration in the sub-day grammar. Requires the pen.
 *
 * The label is `Duration` and **not** `Duration (working days)` — that difference is itself part of
 * the contract: the flag-off field names the unit because days are all it takes, and this one does
 * not because they are not.
 */
export async function addActivity(page: Page, name: string, duration: string): Promise<void> {
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Duration', { exact: true }).fill(duration);
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

/** Open an activity's editor (or the flag-off edit dialog) from its row actions menu. */
export async function openEdit(page: Page, activityName: string): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${activityName}` }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  // The tabbed editor, landing on General — where the duration field lives (ADR-0060 §7).
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeVisible();
}
