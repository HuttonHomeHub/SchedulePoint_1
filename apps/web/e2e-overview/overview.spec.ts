import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  addActivity,
  createClient,
  createPlan,
  createProject,
  ensurePen,
  onboard,
  openOverview,
  section,
} from './support';

/**
 * The organisation overview, driven end to end (ADR-0098 M2).
 *
 * **What only this can see.** Three of the four claims this screen makes are untestable in a unit
 * suite, because a unit suite hands the component its own payload:
 *
 * 1. **The endpoint exists and the client asks for it correctly.** `apiFetch` prefixes
 *    `API_BASE_URL`, which is already `/api/v1` — the staff console shipped a doubled prefix that
 *    its own tests agreed with, because they mock `apiFetch` and branch on whatever string the code
 *    happens to pass. Only a real request against a real API can see that.
 * 2. **An activity edit moves its plan.** The read model's ordering key is a `GREATEST` over three
 *    tables precisely because `plans.updated_at` does not move when an activity changes. A mocked
 *    payload proves nothing about that; a real edit followed by a real read does.
 * 3. **The actor is the person who made the change.** Attribution runs from a session, through
 *    `updated_by`, through a join scoped to `org_members`. A unit test asserts a name it supplied
 *    itself.
 *
 * A brand-new organisation is created per run, so the assertions are about work this test did.
 */
test.describe.configure({ mode: 'serial' });

test('the landing shows what changed, who changed it, and what is waiting', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);

  // -------------------------------------------------- 1. A brand-new organisation says so
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Overview Co ${stamp}`);
  await expect(page.getByText('This organisation is empty')).toBeVisible();
  // An Org Admin may act, so the action is offered. The role-gated absence is a unit assertion —
  // this journey proves the writer half against the real role the API handed back.
  await expect(page.getByRole('link', { name: 'Add your first client' })).toBeVisible();
  // The section headings are NOT rendered in this state: an empty organisation is one fact, not
  // three empty frames.
  await expect(page.getByRole('region', { name: 'Recently changed' })).toHaveCount(0);

  // -------------------------------------------------- 2. Build a plan, and change it
  await createClient(page, 'Bellway');
  await createProject(page, 'Northgate');
  await createPlan(page, 'Northgate — Phase 1');
  await ensurePen(page);
  await addActivity(page, orgSlug, 'Pour slab');

  // -------------------------------------------------- 3. The overview noticed
  //
  // **In a SECOND tab, and this is the journey's first finding.** The obvious version of this test
  // navigated the same page to the overview and then asserted the held pen — and failed, because
  // `use-plan-edit-lock.ts:168-184` releases the lease on nav-away and on `pagehide`. That is the
  // product being right: a pen you released is not one you are holding, and reporting it would be
  // the false statement this screen exists to avoid. So the shape that actually produces a held
  // lock is the real one — the plan is open somewhere and you are looking at the overview — and
  // that is what this drives. Written down because the same wrong assumption is one keystroke away
  // for whoever touches this next.
  const overviewPage = await page.context().newPage();
  await openOverview(overviewPage, orgSlug);
  const recent = section(overviewPage, 'Recently changed');
  const row = recent.getByRole('link', { name: 'Northgate — Phase 1' });
  await expect(row).toBeVisible();
  await expect(recent.getByText('Northgate · Bellway')).toBeVisible();
  // The actor is this session's user, resolved through org_members — not a name the test supplied.
  await expect(recent.getByText('Ada Overview')).toBeVisible();
  // The exact instant is in the markup, not only in a hover title a keyboard reader never sees.
  await expect(recent.locator('time').first()).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);

  // -------------------------------------------------- 4. The pen held in the other tab is reported
  const attention = section(overviewPage, 'Needs your attention');
  await expect(attention).toBeVisible();
  await expect(attention.getByText('You are holding the editing lock.')).toBeVisible();

  // -------------------------------------------------- 5. Exactly one h1, and no second landmark
  await expect(overviewPage.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(overviewPage.getByRole('main')).toHaveCount(1);

  // -------------------------------------------------- 6. The row is the way back into work
  await row.click();
  await expect(overviewPage).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
});

test('the settled overview has no accessibility violations', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Bellway');
  await createProject(page, 'Northgate');
  await createPlan(page, 'Northgate — Phase 1');
  await openOverview(page, orgSlug);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
