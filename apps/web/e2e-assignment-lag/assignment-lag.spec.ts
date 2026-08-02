import { expect, test } from '@playwright/test';

import { chooseComboboxOption } from '../e2e/combobox';

import {
  addActivity,
  createAndOpenPlan,
  createEightHourCalendar,
  createResource,
  ensurePen,
  onboard,
  openProject,
  openResources,
  readActivities,
  readAssignments,
} from './support';

/**
 * **Flag-ON journey — the per-assignment join lag** (`VITE_ASSIGNMENT_LAG`, ADR-0071 M4).
 *
 * What only a real API and a real database can prove, and why each of these is here:
 *
 * 1. **The factor.** `1d` on an eight-hour calendar must store **480** minutes. A mocked fetch
 *    echoes whatever it is handed, so a unit test can prove the client SENT 480 but never that 480
 *    is what the engine will measure. Getting this wrong is a wrong date, silently — the defect the
 *    whole ADR-0070/ADR-0068 factor rule exists to prevent.
 * 2. **The pen.** Every assignment write is pen-gated (ADR-0028). Without the lock the save is a
 *    423, and a suite that never takes the pen would pass against a build that dropped the gate.
 * 3. **The optimistic version.** A mocked fetch accepts any `version`; only a real server rejects a
 *    stale one. Editing the lag twice in a row is the cheapest way to prove the row's version is
 *    actually being refreshed between saves.
 * 4. **The reachability of the calendar.** ADR-0070's journey caught, twice, that the plan's
 *    calendar never reached a control on the surface where the work is really done — the field
 *    rendered, looked right, and quietly refused `4h`. That failure mode is invisible to every gate
 *    that does not run the real thing, so it is the first thing asserted here.
 *
 * **One test, not five.** The claims are strictly sequential — each edits the assignment the last
 * one made — and Playwright gives every test its own browser context, which would drop the session
 * cookie and the pen along with it. Splitting them would test five signed-out pages. Both sibling
 * flag-on journeys (`e2e-sub-day`, `e2e-wbs`) are single journeys for the same reason.
 */
test('the join lag round-trips through the real API, pen-gated', async ({ page }) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  const calendarId = await createEightHourCalendar(page, orgSlug);
  await createResource(page, orgSlug, 'Tower crane');
  await openProject(page);
  const planId = await createAndOpenPlan(page, 'Lag Plan', orgSlug, calendarId);

  await ensurePen(page);
  await addActivity(page, 'Steel erection');
  await openResources(page, 'Steel erection');

  const dialog = page.getByRole('dialog');
  const assign = dialog.getByRole('group', { name: 'Assign a resource' });
  // ------------------------------------------------------ 1. A typed day is the CALENDAR's day
  // The label itself is the first assertion: `Joins after` (not `Joins after (hours or minutes)`)
  // means the factor RESOLVED. The degraded wording here would be the ADR-0070 defect repeating —
  // a field that renders, looks right, and then refuses the unit a planner reaches for.
  await expect(assign.getByLabel('Joins after')).toBeVisible();

  // The resource picker is the shared APG `Combobox`, not a native `<select>`:
  // `VITE_LIBRARY_SCOPING` is default-on (ADR-0053 §4), so this is the control a planner
  // actually meets. Pinning that flag off to get a `<select>` back would have driven a surface
  // nobody sees.
  await chooseComboboxOption(assign, 'Resource', 'Tower crane (Equipment)');
  await assign.getByLabel('Budgeted units').fill('40');
  await assign.getByLabel('Joins after').fill('1d');
  await assign.getByRole('button', { name: 'Assign resource' }).click();

  await expect(dialog.getByText('Tower crane')).toBeVisible();

  // Read STORAGE, not the field. 480 = one eight-hour day. A 1,440 here would be the epic's
  // central defect — a day taken from the wrong calendar — and is exactly what an eight-hour
  // fixture exists to make visible.
  const activities = await readActivities(page, orgSlug, planId);
  const activityId = activities.find((a) => a.name === 'Steel erection')?.id ?? '';
  expect(activityId).not.toBe('');
  const assignments = await readAssignments(page, orgSlug, activityId);
  expect(assignments).toHaveLength(1);
  expect(assignments[0]?.lagMinutes).toBe(480);

  // ------------------------------------------------------------- 2. Two edits, no stale version
  const row = dialog.getByRole('listitem').filter({ hasText: 'Tower crane' });
  // Seeded from storage in the grammar the field accepts back: 480 minutes on an eight-hour day
  // reads as `1d`, not `8h` and not `480`.
  await expect(row.getByLabel('Joins after')).toHaveValue('1d');

  await row.getByLabel('Joins after').fill('4h');
  await row.getByRole('button', { name: 'Save join delay for Tower crane' }).click();
  await expect
    .poll(async () => (await readAssignments(page, orgSlug, activityId))[0]?.lagMinutes)
    .toBe(240);

  // The SECOND save is the point: it can only succeed if the row's optimistic `version` was
  // refreshed by the first. A mocked fetch would accept a stale one and this would pass against a
  // build that never refetched.
  await row.getByLabel('Joins after').fill('2d 4h');
  await row.getByRole('button', { name: 'Save join delay for Tower crane' }).click();
  await expect
    .poll(async () => (await readAssignments(page, orgSlug, activityId))[0]?.lagMinutes)
    .toBe(2 * 480 + 240);

  // --------------------------------------------- 3. Zero is a real value, not a no-op or a clear
  await row.getByLabel('Joins after').fill('0d');
  await row.getByRole('button', { name: 'Save join delay for Tower crane' }).click();
  await expect
    .poll(async () => (await readAssignments(page, orgSlug, activityId))[0]?.lagMinutes)
    .toBe(0);

  // ------------------------------------------ 4. Refused at the field rather than as a server 500
  // Past ASSIGNMENT_LAG_MINUTES_MAX on any calendar. The client mirrors the API's own ceiling so
  // the planner is told at the field; the assertion that matters is that Save is unavailable and
  // nothing was written.
  await row.getByLabel('Joins after').fill('99999d');
  const save = row.getByRole('button', { name: 'Save join delay for Tower crane' });
  // `aria-disabled`, not the native attribute (ADR-0060 M6) — asserted by mechanism, because the
  // whole point of the fix is WHICH one is used, and Playwright's `toBeDisabled()` accepts either.
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  // Shaded is not enough on its own: an `aria-disabled` control is still clickable, so the click
  // guard has to be real. Pressing it must write nothing.
  await save.click({ force: true });
  expect((await readAssignments(page, orgSlug, activityId))[0]?.lagMinutes).toBe(0);

  // ------------------------------------------------------------- 5. Not authorable without the pen
  // ADR-0028: an assignment write is a structural edit. Releasing the pen must take the control
  // away entirely — not leave it lit and let the save 423.
  //
  // Released deliberately from this page rather than by navigating away. Leaving the plan flushes a
  // release on unmount, so a `goto` would also arrive pen-less — but then the assertion below would
  // pass on a build that had dropped `Stop editing` entirely, which is not the claim.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();

  await openResources(page, 'Steel erection');
  const readOnly = page.getByRole('dialog');
  await expect(readOnly.getByLabel('Joins after')).toHaveCount(0);
  await expect(
    readOnly.getByRole('button', { name: 'Save join delay for Tower crane' }),
  ).toHaveCount(0);
});
