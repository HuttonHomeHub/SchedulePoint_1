import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';
import { recalculate } from '../e2e-support/toolbar';

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
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
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

/** The open plan's id, from the URL — `/orgs/:org/…/plans/:id/…`. */
function currentPlanId(page: Page): string {
  const planId = new URL(page.url()).pathname.split('/plans/')[1]?.split('/')[0];
  if (!planId) throw new Error(`no plan id in ${page.url()}`);
  return planId;
}

/**
 * Forces the plan onto the all-days calendar, the SAME move the API's own R1/R2 fixtures make
 * (`apps/api/test/baselines.e2e-spec.ts`'s `makePlan`) — org creation seeds an active Standard
 * (Mon–Fri) calendar, and a new plan defaults to it, so a bare "5 days later" would land on a
 * different weekday than it started and mean a different number of WORKING days depending on
 * which weekdays it crossed. All-days makes a calendar-day shift and a working-day shift the same
 * number, which is what lets T5 assert an exact "+5" without hand-computing which days are
 * weekends.
 */
async function useAllDaysCalendar(page: Page, orgSlug: string): Promise<void> {
  const planId = currentPlanId(page);
  const status = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const planRes = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      const plan = (await planRes.json()) as { data: { version: number } };
      const patchRes = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarId: null, version: plan.data.version }),
      });
      return patchRes.status;
    },
    { org: orgSlug, id: planId },
  );
  expect(status).toBe(200);
  // The PATCH bumped the plan's `version` behind React Query's cache, so the next `Edit plan` save
  // would send the stale one and be refused as "changed elsewhere". Reload so the page reads it.
  await page.reload();
}

/** An activity's id, optimistic version and drawn start, read straight off the API. */
async function findActivity(
  page: Page,
  orgSlug: string,
  name: string,
): Promise<{ id: string; version: number; visualEffectiveStart: string | null }> {
  const planId = currentPlanId(page);
  const row = await page.evaluate(
    async ({ org, id, activityName }: { org: string; id: string; activityName: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      const body = (await response.json()) as {
        data: { id: string; name: string; version: number; visualEffectiveStart: string | null }[];
      };
      return body.data.find((a) => a.name === activityName) ?? null;
    },
    { org: orgSlug, id: planId, activityName: name },
  );
  if (row === null) throw new Error(`no activity named ${name}`);
  return row;
}

/**
 * Hand-place an activity through the API — T5's "drag" (`placement-baseline-variance`
 * §2 R2). A raw PATCH rather than a canvas/grid gesture: what this journey proves is that the
 * TABLE reads the resulting placement correctly, not that a particular pointer gesture writes
 * one — that is ADR-0052/0095's territory, exercised elsewhere.
 */
async function patchVisualStart(
  page: Page,
  orgSlug: string,
  activityId: string,
  version: number,
  visualStart: string,
): Promise<void> {
  const status = await page.evaluate(
    async (args: { org: string; id: string; visualStart: string; version: number }) => {
      const response = await fetch(`/api/v1/organizations/${args.org}/activities/${args.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visualStart: args.visualStart, version: args.version }),
      });
      return response.status;
    },
    { org: orgSlug, id: activityId, visualStart, version },
  );
  expect(status).toBe(200);
}

/** Recalculate through the API directly — the counterpart to an out-of-band PATCH the UI's own
 *  toolbar `Recalculate` button has no reason to know about yet. */
async function recalcViaApi(page: Page, orgSlug: string): Promise<void> {
  const planId = currentPlanId(page);
  const status = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/schedule/recalculate`,
        { method: 'POST', credentials: 'include' },
      );
      return response.status;
    },
    { org: orgSlug, id: planId },
  );
  expect(status).toBe(200);
}

/** `n` calendar days after a `YYYY-MM-DD` day, as `YYYY-MM-DD` (all-days calendar, so this is
 *  also `n` WORKING days — see {@link useAllDaysCalendar}). */
function plusDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

test('a planner captures a baseline and sees per-activity variance (accessible)', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openNewPlan(page);
  await useAllDaysCalendar(page, orgSlug);

  // Schedule the plan: a start date + one activity, then recalculate.
  await page.getByRole('button', { name: 'Edit plan' }).click();
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await addActivity(page, 'Excavate');
  await recalculate(page);
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
  // just-captured baseline, and the plan-level roll-up appears above the table, naming the
  // basis it compares (M2, US-2, `placement-baseline-variance`) — this baseline was just
  // captured on `FULL`, so it reads placed dates.
  await expect(page.getByRole('columnheader', { name: 'Finish variance' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'On baseline' }).first()).toBeVisible();
  await expect(page.getByText(/vs\. Contract Baseline \(placed dates\):/)).toBeVisible();

  // T5 (`placement-baseline-variance` M1): hand-place the baselined activity 5 days later
  // through the API — the "drag" — and recalculate. Its bar has genuinely moved, so on the
  // PLACED basis both its Start and Finish variance now read the slip; before this epic they
  // read 0 (the network dates never moved).
  const excavate = await findActivity(page, orgSlug, 'Excavate');
  if (excavate.visualEffectiveStart === null) {
    throw new Error('Excavate has no computed start to shift from');
  }
  await patchVisualStart(
    page,
    orgSlug,
    excavate.id,
    excavate.version,
    plusDays(excavate.visualEffectiveStart, 5),
  );
  await recalcViaApi(page, orgSlug);
  // The API write happened out-of-band (not through the UI), so the workspace's cached
  // queries have not seen it — reload rather than waiting on a mechanism with nothing to
  // trigger it.
  await page.reload();
  await showActivities(page);
  await expect(page.getByRole('cell', { name: '5 d behind' })).toHaveCount(2); // Start + Finish

  // Add a new activity after capture and recalculate → it reads as "Added" variance.
  await addActivity(page, 'Pour slab');
  await recalculate(page);
  // "Added" shows in all three variance columns (start/finish/float) for the new activity.
  await expect(page.getByRole('cell', { name: 'Added' }).first()).toBeVisible();

  // Earned Value phases planned value on the PLACED span (`ev-placed-planned-value`, #405 (c)). A
  // START-accrued activity, hand-placed three days after the data date and created after capture, is
  // not due yet: measured on its early dates (the data date itself) its whole budget read as planned.
  // Created through the API like the drag above — what is proved is the PV cell the planner reads.
  const gutterStatus = await page.evaluate(
    async ({ org, id, start }: { org: string; id: string; start: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Gutter',
          durationDays: 10,
          budgetedExpense: 1_000_000,
          accrualType: 'START',
          visualStart: start,
        }),
      });
      return response.status;
    },
    { org: orgSlug, id: currentPlanId(page), start: '2026-01-04' },
  );
  expect(gutterStatus).toBe(201);
  await recalcViaApi(page, orgSlug);
  await page.reload();
  await page.getByRole('button', { name: 'Analysis' }).click();
  await page.getByRole('menuitem', { name: /Earned value/ }).click();
  const earnedValue = page.getByRole('dialog', { name: /Earned value/ });
  const table = earnedValue.getByRole('table', { name: 'Earned value by activity' });
  await expect(table).toBeVisible();
  const headers = await table.getByRole('columnheader').allInnerTexts();
  const pvColumn = headers.findIndex((h) => h.trim() === 'PV');
  expect(pvColumn).toBeGreaterThanOrEqual(0);
  await expect(
    table
      .getByRole('row', { name: /Gutter/ })
      .getByRole('cell')
      .nth(pvColumn),
  ).toHaveText(/^\D*0\.00$/);
  await earnedValue.getByRole('button', { name: 'Close dialog' }).click();
  await expect(earnedValue).toBeHidden();

  // The plan view with the baselines panel + variance column is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
