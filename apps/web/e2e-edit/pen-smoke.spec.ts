import { expectPenFree, releaseThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';

import { addActivity, showActivities, onboard, openNewPlan } from './support';

/**
 * Smoke journey (TECH_DEBT #25b/#27b harness). Proves the editing surface
 * actually boots with the API
 * enforcing (`PLAN_EDIT_LOCK_ENFORCED=true`): a Planner must hold the pen before the
 * schedule-editing affordances appear (the plan opening free gives it to them, ADR-0220), and a
 * write then succeeds because they hold it.
 * This is the harness's own health check — the substantive keyboard-edit and pen
 * hand-off journeys build on top of it.
 */
test('the pen gates schedule editing; a Planner holds it on opening and Stop makes it read-only (flag-on stack)', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // The pen layer is live and the plan opened free, so this planner holds it without pressing
  // anything (ADR-0220). `pen-auto.spec.ts` is the journey for that take; here it is the state the
  // rest of the lifecycle starts from. The test never calls `holdThePen`.
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  await expect(page.getByText('You’re editing this plan.', { exact: true })).toBeVisible();

  // The editing affordances are alive (the pen gate is open). The activities panel is collapsed by
  // default on the workspace, so the create affordance is not on screen until it is expanded — the
  // pen gate is what this asserts, not the panel state.
  await showActivities(page);
  await expect(page.getByRole('button', { name: 'New activity' })).toBeVisible();

  // A structural write succeeds because the caller holds the pen AND the API enforces it
  // (a non-holder would 423). This exercises the whole flag-on stack end to end.
  await addActivity(page, 'Excavate');

  // Release the pen → the schedule returns to read-only (the single-actor lifecycle), and it is
  // offered back: Stop is respected, so nothing takes it again until the plan is next opened.
  //
  // It says so as a badge. `PenReadOnlyNote` — "Read-only — use 'Start editing'…" — was an INLINE
  // hint the legacy stacked page repeated beside each pen-gated section, because that page's
  // single banner could be scrolled far out of view by the time a planner reached them. The
  // workspace has no scroll to lose: the pen's state is a badge in the one-line header, always on
  // screen. So the equivalent assertion is the badge, and the note dies with the layout it was
  // written for.
  await releaseThePen(page);
  await expectPenFree(page);
  await expect(page.getByRole('button', { name: 'New activity' })).toHaveCount(0);
  await expect(page.getByText('Available')).toBeVisible();
});
