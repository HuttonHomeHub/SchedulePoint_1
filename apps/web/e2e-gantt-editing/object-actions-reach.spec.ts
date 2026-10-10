import { type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttRow,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  startEditing,
  syncClient,
} from '../e2e-gantt/support';
import { activityEditor } from '../e2e-support/activity-editor';
import { expect, test } from '../e2e-support/test';
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

test('Clear visual start is absent for an unplaced activity, and the bar is not', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await ganttPlanWithSelection(page, Date.now());
  const bar = page.getByRole('toolbar', { name: /Actions for/ });

  // **This case has been reversed three times, and the third reversal returns it to its original
  // assertion for a different reason — which is why the history is kept rather than tidied.**
  //
  // 1. It first required the control to be PRESENT, `toBeDisabled()` and carrying a linked reason:
  //    ADR-0082's SHADE branch.
  // 2. The foot-row-and-deck epic flipped it to ABSENT on ADR-0082's OMIT branch, because outside
  //    Visual mode the action did not APPLY — a plan scheduled Early had no hand-placed start
  //    anywhere in it — and the control was holding 146 px of a row whose wrap cost the diagram
  //    36 px at 1646.
  // 3. One-planning-surface M-F-T6 removed that condition and, for one commit, made the control
  //    unconditional. `e2e-workspace-chrome/dock.spec.ts` went red on its 0 px equality, and
  //    `measure-toolbar/m-f-foot-row.spec.ts` put a number on it: **0 px at 1920, 36 at 1646, 76 at
  //    1440**. So the predicate moved down a level rather than away — from "this plan is a planning
  //    surface" to "this ACTIVITY carries a placement".
  //
  // The observation is therefore what it was in (2) and the reason is not. This fixture seeds
  // activities and places none of them, so there is nothing to clear.
  await expect(bar.getByRole('button', { name: 'Clear visual start' })).toHaveCount(0);

  // **The pinned positive**, and it is why this is two assertions rather than one. `toHaveCount(0)`
  // passes just as well if the bar never rendered, if the selection was lost, or if the control was
  // deleted outright — a green result that cannot tell "correctly omitted" from "gone" is the
  // ADR-0093 defect this repository keeps re-filing.
  await expect(bar.getByRole('button', { name: 'Edit' })).toBeVisible();
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

test('a flagged row states its reason on the docked bar, and its menu offers nothing inert', async ({
  page,
}) => {
  // The positive case the test above names as a gap (ADR-0186): a plan seeded into conflict, with
  // the Gantt as the host. The conflict is a mandatory start before the data date, which needs no
  // drag and so works in a view with no canvas (`conflict-review.spec.ts` seeds it the same way).
  test.setTimeout(120_000);
  const orgSlug = await ganttPlanWithSelection(page, Date.now());
  const failure = await page.evaluate(
    async ({ org, planId }: { org: string; planId: string }) => {
      const base = `/api/v1/organizations/${org}`;
      const list = await fetch(`${base}/plans/${planId}/activities?limit=100`, {
        credentials: 'include',
      });
      const rows = (
        (await list.json()) as { data: Array<{ id: string; name: string; version: number }> }
      ).data;
      const row = rows.find((r) => r.name === 'Seeded 0');
      if (!row) return 'no Seeded 0';
      const res = await fetch(`${base}/activities/${row.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          constraintType: 'MANDATORY_START',
          constraintDate: '2025-12-22',
          version: row.version,
        }),
      });
      return res.ok ? null : `${String(res.status)} ${await res.text()}`;
    },
    { org: orgSlug, planId: openPlanId(page) },
  );
  if (failure !== null) throw new Error(`pinning the constraint failed: ${failure}`);
  await syncClient(page);
  await recalculate(page);
  await ganttRow(page, 'Seeded 0').click();

  const bar = page.getByRole('toolbar', { name: 'Actions for Seeded 0' });
  await expect(bar).toBeVisible();
  // The copy IS the assertion: the reason, in words, on the docked bar.
  const reason = page.locator('[data-conflict-reason]');
  await expect(reason).toHaveText('Constraint not met');
  await expect(
    reason.locator('xpath=ancestor::*[@data-surface][1]'),
    'the same chrome surface the Diagram’s bar sits on, so the contrast gate’s composite applies here too',
  ).toHaveAttribute('data-surface', 'chrome');
  const remedy = bar.getByRole('button', { name: 'Review the constraint…' });
  await expect(remedy).toHaveAccessibleDescription('Constraint not met');

  // The row's `⋯` menu: no 'Conflict reason' item and no inert 'Fix this conflict' — the remedy is
  // on the bar, and a menu item needs an activation path.
  await page.getByRole('button', { name: 'Actions for Seeded 0' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Conflict reason' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: 'Fix this conflict' })).toHaveCount(0);
  await expect(menu.getByRole('menuitem').first()).toBeVisible();
});

test('Make milestone… converts from a Gantt selection and returns focus to its row', async ({
  page,
}) => {
  // ADR-0162 decision 4, M4-T3's Gantt case. The canvas case lives in
  // `e2e-workspace-chrome/zero-duration.spec.ts`; this is the same registry item reached from the
  // Gantt's bar, whose restore target is the grid rather than the diagram's listbox — the part a
  // canvas journey cannot show. A zero-duration task with no predecessor preselects Start (D5).
  test.setTimeout(120_000);
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  const id = await page.evaluate(
    async ({ org, planId }: { org: string; planId: string }) => {
      const res = await fetch(`/api/v1/organizations/${org}/plans/${planId}/activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Zero 0', code: 'Z0001', durationDays: 0 }),
      });
      if (!res.ok) throw new Error(`create ${String(res.status)} ${await res.text()}`);
      return ((await res.json()) as { data: { id: string } }).data.id;
    },
    { org: orgSlug, planId: openPlanId(page) },
  );
  // The create went straight to the API, so tell the client (`syncClient`, TECH_DEBT #183);
  // `recalculate()` presses nothing on a plan the client believes is current (ADR-0109 D3).
  await syncClient(page);
  await recalculate(page);
  await showGantt(page);
  await ganttRow(page, 'Zero 0').click();
  const bar = page.getByRole('toolbar', { name: /Actions for/ });

  await bar.getByRole('button', { name: 'Make milestone…' }).click();
  const dialog = page.getByRole('dialog', { name: /milestone/ });
  await expect(dialog.getByRole('radio', { name: 'Start milestone' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dialog.getByRole('button', { name: 'Make milestone', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // Focus is on this activity's row, not on <body>: the bar button that opened the dialog is gone
  // once the task is a milestone.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement?.closest('[role="row"]')?.getAttribute('data-activity-id') ?? null,
      ),
    )
    .toBe(id);
  await expect
    .poll(async () =>
      page.evaluate(
        async ({ org, activityId }: { org: string; activityId: string }) => {
          const res = await fetch(`/api/v1/organizations/${org}/activities/${activityId}`, {
            credentials: 'include',
          });
          return ((await res.json()) as { data: { type: string } }).data.type;
        },
        { org: orgSlug, activityId: id },
      ),
    )
    .toBe('START_MILESTONE');
});
