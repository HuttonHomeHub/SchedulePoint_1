import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  addActivity,
  createClient,
  createPlan,
  createProject,
  countOverviewRequests,
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

/**
 * "Jump back in" (ADR-0098 M3), which only a real browser can prove.
 *
 * Three of its four claims are about `localStorage` and the network, both of which a unit suite
 * replaces: that opening a plan is remembered at all, that the section costs **no extra request**,
 * and that an entry whose plan has gone stops being offered rather than 404ing on click. The
 * fourth — that the store holds no name — is a unit assertion, and it is the reason the third
 * works.
 */
test('the landing offers the plans this browser was recently in', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Bellway');
  await createProject(page, 'Northgate');
  await createPlan(page, 'Northgate — Phase 1');
  const planUrl = page.url();

  // -------------------------------------------------- 1. Opening a plan is remembered
  const requests = await countOverviewRequests(page, async () => {
    await openOverview(page, orgSlug);
  });
  const jumpBackIn = section(page, 'Jump back in');
  await expect(jumpBackIn.getByRole('link', { name: 'Northgate — Phase 1' })).toBeVisible();

  // -------------------------------------------------- 2. …and costs no request of its own
  expect(requests).toBe(1);

  // -------------------------------------------------- 3. A rename is corrected, not cached
  await page.goto(planUrl);
  const planId = /\/plans\/([0-9a-f-]{36})/.exec(planUrl)?.[1];
  expect(planId).toBeDefined();
  await ensurePen(page);
  const renamed = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const current = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        credentials: 'include',
      });
      const version = (await current.json()).data.version as number;
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed since', version }),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId! },
  );
  if (!renamed.ok) throw new Error(`rename failed: ${renamed.status} ${renamed.body}`);

  await openOverview(page, orgSlug);
  await expect(
    section(page, 'Jump back in').getByRole('link', { name: 'Renamed since' }),
  ).toBeVisible();

  // -------------------------------------------------- 4. A deleted plan disappears, never 404s
  const deleted = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId! },
  );
  if (!deleted.ok) throw new Error(`delete failed: ${deleted.status} ${deleted.body}`);

  await page.goto(`/orgs/${orgSlug}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Absent, not present-and-broken, and not an "a plan you had is gone" message — that sentence
  // would name a plan to somebody who may no longer be entitled to know it exists.
  await expect(page.getByRole('region', { name: 'Jump back in' })).toHaveCount(0);
});

/**
 * The wordmark is the route home, and "Overview" has left the nav (ADR-0098 M4 + M5).
 *
 * These land together because they are one change seen from two sides: the item went only after
 * the conventional route home existed. A journey is the only place the pair can be checked at all —
 * the wordmark has to work from a **plan workspace**, which is the screen furthest from the shell's
 * own routes and the one a planner is actually on when they want to get back.
 */
test('the wordmark returns to the overview, and the nav no longer names it', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Bellway');
  await createProject(page, 'Northgate');
  await createPlan(page, 'Northgate — Phase 1');
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);

  // -------------------------------------------------- 1. The nav has dropped the item
  const nav = page.getByRole('navigation', { name: 'Organisation' });
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveCount(0);

  // -------------------------------------------------- 2. …and the wordmark replaces it
  await page.getByRole('link', { name: 'SchedulePoint — organisation overview' }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Overview Co ${stamp}`);

  // -------------------------------------------------- 3. …and says so once you are there
  await expect(
    page.getByRole('link', { name: 'SchedulePoint — organisation overview' }),
  ).toHaveAttribute('aria-current', 'page');
});
