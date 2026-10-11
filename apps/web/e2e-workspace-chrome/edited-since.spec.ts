import { expect, test } from '../e2e-support/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  openPlanId,
  recalculate,
  seedActivities,
} from './support';

/**
 * **The workspace says what the overview says** (`docs/TECH_DEBT.md` #452).
 *
 * The product owner's report, 2026-10-05: the overview listed a plan as "Edited since it was last
 * calculated (1 week ago)", "but if i go into the project the recalculate button isn't there or no
 * message appears in the canvas".
 *
 * The status bar only knew about edits made in THIS tab, and about plans never calculated at all.
 * An edit made anywhere else — another session, a colleague, or before the tab was opened — left
 * the server's stamp ahead of its last calculation, which the overview reads and the workspace did
 * not. The edit here is made through the REST API rather than the canvas for exactly that reason:
 * it is the edit this tab never saw.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 1300;

test('a plan edited elsewhere since its calculation says so, and Recalculate clears it', async ({
  page,
}) => {
  const orgSlug = await onboard(page, STAMP);
  await createHierarchy(page);
  await newPlan(page, 'Echo');
  await ensurePen(page);
  const [first] = await seedActivities(page, orgSlug, [
    { name: 'Echo one', laneIndex: 0 },
    { name: 'Echo two', laneIndex: 1 },
  ]);
  if (!first) throw new Error('seeding returned no activity');
  await recalculate(page, orgSlug);
  const bar = page.locator('[data-schedule-state]');
  await expect(bar).toHaveAttribute('data-schedule-state', 'current');

  // A scheduling-input edit this tab does not make: a duration change straight to the API. The
  // reload inside `recalculate` released the pen (pagehide), so it is taken again first.
  await ensurePen(page);
  const planId = openPlanId(page);
  await page.evaluate(
    async ({ org, plan, id }: { org: string; plan: string; id: string }) => {
      const list = await fetch(`/api/v1/organizations/${org}/plans/${plan}/activities`, {
        credentials: 'include',
      });
      const rows = ((await list.json()) as { data: { id: string; version: number }[] }).data;
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error('activity not listed');
      const response = await fetch(`/api/v1/organizations/${org}/activities/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ durationDays: 6, version: row.version }),
      });
      if (!response.ok)
        throw new Error(`PATCH ${String(response.status)}: ${await response.text()}`);
    },
    { org: orgSlug, plan: planId, id: first.id },
  );

  // Opened afresh, the tab has made no edit — and must still say what the overview says.
  await page.reload();
  await ensurePen(page);
  await expect(bar).toHaveAttribute('data-schedule-state', 'stale');
  await expect(bar.getByText('Edited since it was last calculated')).toBeVisible();

  await bar.getByRole('button', { name: 'Recalculate' }).click();
  await expect(bar).toHaveAttribute('data-schedule-state', 'current');
  await expect(page.getByText('Edited since it was last calculated')).toHaveCount(0);

  // And the server agrees: reopened, it stays current.
  await page.reload();
  await expect(bar).not.toHaveAttribute('data-schedule-state', 'pending');
  await expect(bar).toHaveAttribute('data-schedule-state', 'current');
});

/**
 * **A shared calendar's edit is an edit to every plan on it** (`docs/TECH_DEBT.md` #449). The plan's
 * own rows are untouched; only the calendar changes, so before the fix the status bar kept saying
 * "current" over dates the new exception had moved. The calendar is edited through the REST API for
 * the same reason as above: it is the edit this tab never saw.
 */
test('a calendar exception added elsewhere marks the plans on that calendar stale', async ({
  page,
}) => {
  const orgSlug = await onboard(page, STAMP + 1);
  await createHierarchy(page);
  await newPlan(page, 'Foxtrot');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Foxtrot one', laneIndex: 0 }]);
  const planId = openPlanId(page);

  // Bind the plan to a new organisation calendar (a plan-settings write, so it stamps by itself),
  // then calculate so the baseline for "edited since" is after it.
  const calendarId = await page.evaluate(
    async ({ org, plan }: { org: string; plan: string }) => {
      const send = async (path: string, method: string, body: unknown) => {
        const response = await fetch(`/api/v1/organizations/${org}/${path}`, {
          method,
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok)
          throw new Error(`${method} ${path} ${String(response.status)}: ${await response.text()}`);
        return (await response.json()) as { data: { id: string; version: number } };
      };
      const calendar = await send('calendars', 'POST', {
        name: 'Site week',
        workingWeekdays: 31,
      });
      const current = await (
        await fetch(`/api/v1/organizations/${org}/plans/${plan}`, { credentials: 'include' })
      ).json();
      await send(`plans/${plan}`, 'PATCH', {
        calendarId: calendar.data.id,
        version: (current as { data: { version: number } }).data.version,
      });
      return calendar.data.id;
    },
    { org: orgSlug, plan: planId },
  );
  await recalculate(page, orgSlug);
  const bar = page.locator('[data-schedule-state]');
  await expect(bar).toHaveAttribute('data-schedule-state', 'current');

  await page.evaluate(
    async ({ org, calendar }: { org: string; calendar: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/calendars/${calendar}/exceptions`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ date: '2026-02-10', label: 'Site closed' }),
        },
      );
      if (!response.ok)
        throw new Error(`POST exception ${String(response.status)}: ${await response.text()}`);
    },
    { org: orgSlug, calendar: calendarId },
  );

  await page.reload();
  await ensurePen(page);
  await expect(bar).toHaveAttribute('data-schedule-state', 'stale');

  await bar.getByRole('button', { name: 'Recalculate' }).click();
  await expect(bar).toHaveAttribute('data-schedule-state', 'current');
});
