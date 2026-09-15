import { expect, test, type Page } from '@playwright/test';

import {
  addActivity,
  createClient,
  createPlan,
  createProject,
  ensurePen,
  onboard,
  openOverview,
  openPlanId,
  section,
} from './support';

/**
 * R1 — "are these figures current, or stale?" — driven **both ways** against a real API.
 *
 * **A marker that never clears is indistinguishable from a marker that is always on.** Asserting
 * only that an edited plan says so would pass against a line hard-wired on, and the landing would
 * carry a warning no planner could ever remove. So this calculates, edits, asserts the line
 * appears, recalculates, and asserts it is **gone**.
 *
 * Only a real run can see this. The signal rests on `stampScheduleComputedAt` writing
 * `schedule_computed_at` and NOT `plans.updated_at` (ADR-0022, pinned structurally by
 * `schedule/stamp-no-user-columns.structural.spec.ts`) — a property of the write path that a mocked
 * fetch agrees with whatever it is handed.
 *
 * The plan is driven through the API rather than the canvas for `addActivity`'s stated reason: the
 * assertion is about the read model noticing an ACTIVITY edit, and drawing a bar would test the
 * canvas. The overview is opened in this same tab between steps, which releases the pen — so the
 * pen is re-taken where a step needs it.
 */
test.describe.configure({ mode: 'serial' });

async function api(
  page: Page,
  orgSlug: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const result = await page.evaluate(
    async ({ org, verb, url, payload }) => {
      const response = await fetch(`/api/v1/organizations/${org}${url}`, {
        method: verb,
        credentials: 'include',
        ...(payload === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
      });
      return { ok: response.ok, status: response.status, text: await response.text() };
    },
    { org: orgSlug, verb: method, url: path, payload: body },
  );
  if (!result.ok) throw new Error(`${method} ${path}: ${result.status} ${result.text}`);
  return result.text === '' ? null : (JSON.parse(result.text) as { data: unknown }).data;
}

test('the landing says a plan was edited since it was calculated, and stops saying so', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);

  await createClient(page, 'Harbourside Estates');
  await createProject(page, 'Dockside Regeneration');
  await createPlan(page, 'Quay Wall Reconstruction');
  const planId = openPlanId(page);
  await ensurePen(page);
  await addActivity(page, orgSlug, 'Pour slab');

  const recent = () => section(page, 'Recently changed');

  // ---- Never calculated is its OWN state, not "edited since". -------------------------------
  await openOverview(page, orgSlug);
  await expect(recent().getByText('Not yet calculated')).toBeVisible();
  await expect(recent().getByText(/Edited since it was last calculated/)).toBeHidden();

  // ---- Calculate it. Both lines go: silence is the healthy state. ----------------------------
  await api(page, orgSlug, 'POST', `/plans/${planId}/edit-lock`, {});
  await api(page, orgSlug, 'POST', `/plans/${planId}/schedule/recalculate`, {});
  await openOverview(page, orgSlug);
  await expect(recent().getByText('Not yet calculated')).toBeHidden();
  await expect(recent().getByText(/Edited since it was last calculated/)).toBeHidden();

  // ---- Edit an activity. The line appears. ---------------------------------------------------
  const activities = (await api(page, orgSlug, 'GET', `/plans/${planId}/activities`)) as Array<{
    id: string;
    version: number;
  }>;
  const first = activities[0];
  if (!first)
    throw new Error('the seeded plan has no activities — nothing below would mean anything');
  await api(page, orgSlug, 'PATCH', `/activities/${first.id}`, {
    durationDays: 9,
    version: first.version,
  });

  await openOverview(page, orgSlug);
  await expect(recent().getByText(/Edited since it was last calculated/)).toBeVisible();

  // ---- Recalculate. The line must GO. This is the half a hard-wired `true` would fail. -------
  await api(page, orgSlug, 'POST', `/plans/${planId}/edit-lock`, {});
  await api(page, orgSlug, 'POST', `/plans/${planId}/schedule/recalculate`, {});
  await openOverview(page, orgSlug);
  await expect(recent().getByText(/Edited since it was last calculated/)).toBeHidden();
  await expect(recent().getByText('Not yet calculated')).toBeHidden();
});
