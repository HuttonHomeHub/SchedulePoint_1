import { expect, test } from '@playwright/test';

import { addActivity, showActivities, onboard, openNewPlan, startEditing } from './support';

/**
 * Flag-ON smoke journey (TECH_DEBT #25b/#27b harness). Proves the editing surface
 * actually boots with `VITE_TSLD_EDITING` + `VITE_PLAN_EDIT_LOCK` on and the API
 * enforcing (`PLAN_EDIT_LOCK_ENFORCED=true`): a Planner must take the pen before the
 * schedule-editing affordances appear, and a write then succeeds because they hold it.
 * This is the harness's own health check — the substantive keyboard-edit and pen
 * hand-off journeys build on top of it.
 */
test('the pen gates schedule editing; taking it unlocks writes (flag-on stack)', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // The pen layer is live: the banner offers the "Start editing" CTA (VITE_PLAN_EDIT_LOCK on).
  const startEditingBtn = page.getByRole('button', { name: 'Start editing' });
  await expect(startEditingBtn).toBeVisible();

  // Before taking the pen the schedule is read-only: no create affordance, and the surface says so.
  //
  // It says so differently here. `PenReadOnlyNote` — "Read-only — use 'Start editing'…" — was an
  // INLINE hint the legacy stacked page repeated beside each pen-gated section, because that page's
  // single banner could be scrolled far out of view by the time a planner reached them. The
  // workspace has no scroll to lose: the pen's state is a badge in the one-line header, always on
  // screen. So the equivalent assertion is the badge, and the note dies with the layout it was
  // written for.
  await expect(page.getByRole('button', { name: 'New activity' })).toHaveCount(0);
  await expect(page.getByText('Available')).toBeVisible();

  // Take the pen → the editing affordances come alive (the pen gate flips).
  await startEditing(page);
  // The activities panel is collapsed by default on the workspace, so the create affordance is not
  // on screen until it is expanded — the pen gate is what this asserts, not the panel state.
  await showActivities(page);
  await expect(page.getByRole('button', { name: 'New activity' })).toBeVisible();

  // A structural write now succeeds because the caller holds the pen AND the API enforces it
  // (a non-holder would 423). This exercises the whole flag-on stack end to end.
  await addActivity(page, 'Excavate');

  // Release the pen → the schedule returns to read-only (the single-actor lifecycle).
  await page.getByRole('button', { name: 'Stop editing' }).click();
  await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New activity' })).toHaveCount(0);
  await expect(page.getByText('Available')).toBeVisible();
});
