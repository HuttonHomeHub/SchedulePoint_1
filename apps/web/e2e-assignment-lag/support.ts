import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the flag-ON **per-assignment join lag** suite (`VITE_ASSIGNMENT_LAG`,
 * ADR-0071 M4). The onboarding + hierarchy helpers mirror `e2e-sub-day/support.ts`; the plan surface
 * is the legacy stacked page (canvas pinned off in the config), so activities are added inline from
 * the table and Resources opens from the row actions menu.
 */

/** Sign up + create an organisation; returns the org slug. The actor is the org's Org Admin. */
export async function onboard(page: Page, stamp: number): Promise<string> {
  const orgSlug = `lag-co-${stamp}`;
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Lag Tester');
  await page.getByLabel('Email').fill(`lag-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Lag Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
  return orgSlug;
}

/**
 * Create an **eight-hour** working-week calendar through the API and return its id.
 *
 * Eight hours, not twenty-four, is the whole point: it makes `1d` mean **480** stored minutes, so a
 * factor read from the wrong place (or defaulted) produces a visibly different number rather than a
 * coincidentally equal one. A 24-hour calendar would let the epic's central defect pass.
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

/** Create an org resource through the API — the library screen has its own journey. */
export async function createResource(page: Page, orgSlug: string, name: string): Promise<void> {
  await page.evaluate(
    async ({ slug, name }) => {
      const res = await fetch(`/api/v1/organizations/${slug}/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, kind: 'EQUIPMENT' }),
      });
      if (!res.ok) throw new Error(`resource POST ${String(res.status)}`);
    },
    { slug: orgSlug, name },
  );
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
 * Create a plan under the current project, bind it to the given calendar, and open it. The create
 * dialog carries no calendar field, so the binding goes through the API and the page reloads onto
 * the result — the plan-settings surface has its own coverage and is not what this suite is about.
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

/** The plan id, read from the URL rather than from a list fetch. */
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

/** Add a plain activity from the table. Requires the pen. */
/**
 * Make the activities table visible.
 *
 * The panel is **collapsed by default** on the plan workspace (ADR-0030), and it returns to that
 * default on every reload — which is what this suite does mid-test to defeat the client cache. So
 * this is needed in two places, not one: before the New-activity button can be clicked, and again
 * after any `page.reload()` before the table can be read. Idempotent, so calling it when the panel
 * is already open costs nothing.
 */
export async function showActivities(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  // **Wait on the TOGGLE, not on the table.** Two traps, both paid for:
  //
  // 1. `DataTable` returns its empty state instead of a `<table>` when there are no rows
  //    (`data-table.tsx:86`), so an empty plan has no table to wait for — and this helper runs
  //    before the first activity exists.
  // 2. `isVisible()` is a snapshot, not a wait. Called straight after `page.reload()` it answers
  //    "no" because the app has not painted, the expand is skipped, and the missing table then
  //    reads exactly like the edit under test having failed to persist.
  //
  // The toggle is present in one state or the other whenever the workspace has rendered, which is
  // the invariant worth waiting on. Idempotent.
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
}

export async function addActivity(page: Page, name: string): Promise<void> {
  await showActivities(page);
  await page.getByRole('button', { name: 'New activity' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create activity' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
}

/**
 * Open an activity's resources from its row actions menu.
 *
 * With the tabbed editor — which is what every shipped bundle contains — this lands on the
 * editor's **Resources tab** rather than a dialog of its own (ADR-0062). The panel inside is the
 * same component either way, which is why this suite's assertions did not have to move with it.
 */
export async function openResources(page: Page, activityName: string): Promise<void> {
  await page.getByRole('button', { name: `Actions for ${activityName}` }).click();
  await page.getByRole('menuitem', { name: 'Resources' }).click();
  await expect(page.getByRole('tablist', { name: 'Activity sections' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Resources', selected: true })).toBeVisible();
}

/**
 * Read an activity's assignments **back from the API**, not from the DOM.
 *
 * The DOM is the thing under test: asserting the field still shows what was typed proves the field
 * kept a string, which is not the claim. The claim is that a stored number is right, so the
 * assertion reads storage.
 */
export async function readAssignments(
  page: Page,
  orgSlug: string,
  activityId: string,
): Promise<{ resourceId: string; lagMinutes: number; version: number }[]> {
  return page.evaluate(
    async ({ slug, activityId }) => {
      const res = await fetch(`/api/v1/organizations/${slug}/activities/${activityId}/assignments`);
      const body = (await res.json()) as {
        data: { resourceId: string; lagMinutes: number; version: number }[];
      };
      return body.data;
    },
    { slug: orgSlug, activityId },
  );
}

/** The plan's activities, from the API — for the id the assignment read needs. */
export async function readActivities(
  page: Page,
  orgSlug: string,
  planId: string,
): Promise<{ id: string; name: string }[]> {
  return page.evaluate(
    async ({ slug, planId }) => {
      const res = await fetch(`/api/v1/organizations/${slug}/plans/${planId}/activities?limit=100`);
      const body = (await res.json()) as { data: { id: string; name: string }[] };
      return body.data;
    },
    { slug: orgSlug, planId },
  );
}
