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
 * R2 — "where does each programme stand?" — driven against a real API, a real recalculation and a
 * real baseline capture.
 *
 * **What only a real run can see here is the ARITHMETIC's frame.** `movementSentence` is pure and
 * its unit cases hand it a movement; `baselineMovementOf` is pure and its unit cases inject a
 * measurement frame. Neither can be wrong about which calendar the product walks, or which
 * hours-per-day factor it divides by — those are resolved in the service from rows the engine and
 * the baseline capture wrote (ADR-0125 D4, ADR-0068). A mocked fetch agrees with whatever it is
 * handed.
 *
 * **And the whole section's presence is a server decision.** `planStanding` is OMITTED for a caller
 * who may not read schedules and sent (possibly empty) for one who may, and the screen renders no
 * frame at all in the first case. Nothing in a unit test crosses that seam.
 *
 * Each state is asserted by its **SENTENCE**, not by a class or a test id — because the defect this
 * section exists to prevent is a state with no sentence, which renders as a dash or a blank and
 * reads as breakage (ADR-0061). Asserting the words is asserting the fix.
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

test('the landing says where each programme stands, through every state a plan passes', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);

  await createClient(page, 'Harbourside Estates');
  await createProject(page, 'Dockside Regeneration');
  await createPlan(page, 'Quay Wall Reconstruction');
  const planId = openPlanId(page);

  const stands = () => section(page, 'Where the work stands');

  // ---- PLAN_EMPTY. The first state every plan is in, and the one most likely to render blank. --
  await openOverview(page, orgSlug);
  await expect(stands()).toBeVisible();
  await expect(stands().getByText('No activities yet')).toBeVisible();
  await expect(stands().getByText('No finish date yet')).toBeVisible();

  // ---- PLAN_NOT_SCHEDULED. Distinct from empty, with a different remedy. ----------------------
  await page.goto(`/orgs/${orgSlug}/plans/${planId}`);
  await ensurePen(page);
  await addActivity(page, orgSlug, 'Pour slab');
  await openOverview(page, orgSlug);
  await expect(stands().getByText(/Not yet calculated/)).toBeVisible();
  await expect(stands().getByText('No activities yet')).toBeHidden();

  // ---- NO_BASELINE. It now has a finish, and nothing to measure it against. -------------------
  await api(page, orgSlug, 'POST', `/plans/${planId}/edit-lock`, {});
  await api(page, orgSlug, 'POST', `/plans/${planId}/schedule/recalculate`, {});
  await openOverview(page, orgSlug);
  await expect(stands().getByText(/No baseline to measure against/)).toBeVisible();
  // The finish is a real date now, so the "no finish date yet" sentence must be GONE — otherwise
  // the row would carry two contradictory statements about the same plan.
  await expect(stands().getByText('No finish date yet')).toBeHidden();

  // ---- UNCHANGED. Captured from this very schedule, so it cannot have moved. ------------------
  await api(page, orgSlug, 'POST', `/plans/${planId}/baselines`, { name: 'Contract award' });
  await openOverview(page, orgSlug);
  await expect(stands().getByText(/Finishing as planned in .Contract award./)).toBeVisible();

  // ---- MOVED. A longer activity pushes the finish out. ---------------------------------------
  //
  // **Longer, not merely another.** Two activities with no dependency between them both start at
  // the data date and run in PARALLEL, so a second equal one leaves `MAX(early_finish)` exactly
  // where it was — which is what the API e2e's first draft of this case did, reporting UNCHANGED
  // and being right to.
  await api(page, orgSlug, 'POST', `/plans/${planId}/edit-lock`, {});
  const created = (await api(page, orgSlug, 'POST', `/plans/${planId}/activities`, {
    name: 'Long pour',
    durationDays: 40,
    laneIndex: 1,
  })) as { id: string };
  expect(created.id).toBeTruthy();
  await api(page, orgSlug, 'POST', `/plans/${planId}/schedule/recalculate`, {});

  await openOverview(page, orgSlug);
  // The DIRECTION is a word, not a colour (WCAG 1.4.1) — so that is what is asserted. A test that
  // matched a class would pass against a row that told a colour-blind reader nothing.
  await expect(stands().getByText(/working days later than .Contract award./)).toBeVisible();
  await expect(stands().getByText(/Finishing as planned/)).toBeHidden();
});

/**
 * **A Viewer sees the section too, and that is the point rather than an oversight.**
 *
 * `schedule:read` is granted to every member role (`common/auth/org-permissions.spec.ts:108`), so
 * the omission branch is unreachable through any role this product can mint — the same shape as
 * ADR-0116's `PLAN_START_REQUIRED` and M1's shaded `Revoke`. The gate is pinned where it IS
 * reachable, in `overview.service.spec.ts`, against a principal built by hand.
 *
 * What this asserts is the reachable half: that a Viewer, who can do nothing about any of it, is
 * still told where the organisation's work stands — because knowing is not a write.
 */
test('a Viewer is told where the work stands, having no way to change it', async ({ browser }) => {
  const stamp = Date.now();
  const adminPage = await (await browser.newContext()).newPage();
  const orgSlug = await onboard(adminPage, stamp);

  await createClient(adminPage, 'Harbourside Estates');
  await createProject(adminPage, 'Dockside Regeneration');
  await createPlan(adminPage, 'Quay Wall Reconstruction');
  await ensurePen(adminPage);
  await addActivity(adminPage, orgSlug, 'Pour slab');

  await adminPage.goto(`/orgs/${orgSlug}/members`);
  await adminPage.getByRole('button', { name: 'Invite member' }).click();
  const dialog = adminPage.getByRole('dialog');
  await dialog.getByLabel('Email').fill(`viewer-${stamp}@example.com`);
  await dialog.getByLabel('Role', { exact: true }).selectOption('VIEWER');
  await dialog.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await adminPage.getByLabel('Invitation link').inputValue();

  const viewerPage = await (await browser.newContext()).newPage();
  await viewerPage.goto('/sign-up');
  await viewerPage.getByLabel('Full name').fill('Val Viewer');
  await viewerPage.getByLabel('Email').fill(`viewer-${stamp}@example.com`);
  await viewerPage.getByLabel('Password').fill('correct-horse-battery');
  await viewerPage.getByRole('button', { name: /create an account/i }).click();
  await expect(
    viewerPage.getByRole('heading', { name: /create your organisation/i }),
  ).toBeVisible();
  await viewerPage.goto(acceptUrl);
  await viewerPage.getByRole('button', { name: /accept and join/i }).click();

  await openOverview(viewerPage, orgSlug);
  await expect(section(viewerPage, 'Where the work stands')).toBeVisible();
  await expect(
    section(viewerPage, 'Where the work stands').getByText(/Not yet calculated/),
  ).toBeVisible();
});
