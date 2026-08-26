import { expect, test, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttRow,
  onboard,
  seedActivities,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';
import { activityEditor } from '../e2e-support/activity-editor';
import { recalculate } from '../e2e-support/toolbar';

/**
 * **Every remaining action the Gantt's object bar offers, driven from a Gantt selection.**
 *
 * `src/features/gantt/coverage.structural.test.ts` asks that an action reachable in this view be
 * exercised by a journey, or not render. It caught five that were not — `Fix this conflict`,
 * `Resources`, `Duplicate`, `Delete` and `Clear visual start` — on its first run, which is the
 * gate doing the job the Q4 merge condition needs from it: with no feature flag, each milestone
 * reaches the auto-pulling host as it merges, and "the bar appeared" is not the same claim as "its
 * controls work here".
 *
 * They are the same registry items the canvas drives, which is exactly why they need driving here
 * too: ADR-0080 shipped a bulk bar wired into one host and not the layout its flag selected, and
 * every unit test passed. A shared registry makes a defect *less* likely and not impossible — what
 * differs between the hosts is the context each supplies.
 *
 * **What each case asserts.** For an action whose effect is a surface, that the surface opens. For
 * one that is legitimately shut in this state, that it is **shaded with a reason** rather than
 * missing or silently inert (ADR-0082). Both are real outcomes; the failure this guards against is
 * a control that looks live and does nothing.
 */

async function ganttPlanWithSelection(page: Page, stamp: number): Promise<string> {
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await recalculate(page);
  await showGantt(page);
  await ganttRow(page, 'Seeded 0').click();
  await expect(page.getByRole('toolbar', { name: /Actions for/ })).toBeVisible();
  return orgSlug;
}

test.describe.configure({ mode: 'serial' });

test('Resources opens the editor on its own scope', async ({ page }) => {
  test.setTimeout(120_000);
  await ganttPlanWithSelection(page, Date.now());
  const bar = page.getByRole('toolbar', { name: /Actions for/ });

  await bar.getByRole('button', { name: 'Resources' }).click();
  const editor = activityEditor(page);
  await expect(editor).toBeVisible();
  // Routed to the scope the control names, not merely to the editor — the ADR-0060 per-scope
  // contract, which is the whole reason these entry routes exist rather than one "Edit".
  await expect(editor.getByRole('tab', { name: /Resources/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('Duplicate creates a second activity from a Gantt selection', async ({ page }) => {
  test.setTimeout(120_000);
  await ganttPlanWithSelection(page, Date.now());
  const bar = page.getByRole('toolbar', { name: /Actions for/ });

  await bar.getByRole('button', { name: 'Duplicate', exact: true }).click();
  // The copy lands in the grid this view renders, which is the part a canvas test cannot show: the
  // Gantt has its own row model and a write that never reaches it is invisible from the canvas.
  // Counting, so NOT `ganttRow` — that helper takes `.first()` because every other call site wants
  // one row, and a count through it would always read 1 and pass whatever the duplicate did.
  await expect(
    page.getByRole('row').filter({ has: page.getByRole('gridcell', { name: /^Seeded 0\b/ }) }),
  ).toHaveCount(2, {
    timeout: 20_000,
  });
});

test('Delete asks before removing, and removes on confirm', async ({ page }) => {
  test.setTimeout(120_000);
  await ganttPlanWithSelection(page, Date.now());
  const bar = page.getByRole('toolbar', { name: /Actions for/ });
  const before = await page.getByRole('row').count();

  await bar.getByRole('button', { name: 'Delete', exact: true }).click();
  // Destructive and confirmed — never a one-click removal from a chart a planner is reading.
  // `role="alertdialog"`, not `dialog` (`components/ui/confirm-dialog.tsx:38`), which is correct for
  // a destructive confirmation and is why `getByRole('dialog')` found nothing on the first run. The
  // dialog itself is mounted at the workspace outside the view branch, so it was never a Gantt gap —
  // checked before assuming one, because "the Gantt is missing a dialog" is the shape I was looking
  // for and would have been an easy thing to believe.
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: /Delete/ }).click();

  await expect
    .poll(async () => page.getByRole('row').count(), { timeout: 20_000 })
    .toBeLessThan(before);
});

test('Clear visual start is shaded with a reason on an EARLY plan', async ({ page }) => {
  test.setTimeout(120_000);
  await ganttPlanWithSelection(page, Date.now());
  const bar = page.getByRole('toolbar', { name: /Actions for/ });

  // `clearVisualPlacementGate`'s first rung: there is nothing to clear on a plan that is not in
  // VISUAL mode. Shaded **with a reason**, not hidden — the reader is told why rather than left to
  // wonder whether the control exists (ADR-0082's shade branch, and the distinction ADR-0094 D6
  // moved this control onto this bar to make).
  const clear = bar.getByRole('button', { name: 'Clear visual start' });
  await expect(clear).toBeVisible();
  await expect(clear).toBeDisabled();
  // The reason is linked, not merely adjacent — an sr-only sibling via aria-describedby, so a
  // screen-reader user gets it with the control rather than by hunting for nearby text.
  await expect(clear).toHaveAttribute('aria-describedby', /.+/);
});

test('Fix this conflict is absent when the selected activity has none', async ({ page }) => {
  test.setTimeout(120_000);
  await ganttPlanWithSelection(page, Date.now());
  const bar = page.getByRole('toolbar', { name: /Actions for/ });

  // ADR-0094 D4 makes the remedy map total, so every conflict HAS a remedy — but an activity with
  // no conflict must not be offered one. Absent rather than shaded: there is no problem to fix, so
  // a shaded "Fix this conflict" would invent a state the activity is not in.
  //
  // The positive case (a conflicted activity offers its remedy) needs a plan seeded into conflict,
  // which is `e2e-workspace-chrome/conflict-review.spec.ts`'s subject against the canvas. Naming
  // that here rather than duplicating the fixture — and naming it as a gap in THIS view, which M4
  // closes when it puts conflicts on the chart.
  await expect(bar.getByRole('button', { name: 'Fix this conflict' })).toHaveCount(0);
});
