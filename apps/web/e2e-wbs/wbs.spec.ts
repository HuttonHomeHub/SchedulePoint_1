import { expect, test } from '@playwright/test';

import {
  activityCount,
  createPlan,
  diagramActivityList,
  ensurePen,
  onboard,
  openActivitiesPanel,
  openRowMenu,
  recalculate,
  releasePen,
  rowCheckbox,
  seedActivities,
  toggleView,
} from './support';

/**
 * The flag-ON **WBS improvements** journey (`VITE_WBS_IMPROVEMENTS`, ADR-0063).
 *
 * One journey, because the epic's claims are sequential: you cannot check that dissolving a summary
 * keeps its work without first having filed work into one. Serial, on one plan, mirroring the other
 * flag-on suites.
 *
 * What only a real server can prove, and therefore why this exists rather than more unit tests:
 *
 * - the batch membership write is **per-row optimistic-locked** — a mocked `fetch` accepts any
 *   `version`, so the version the multi-select sends is only ever really checked here;
 * - the batch and dissolve are **pen-gated** (423). With the lock enforced, releasing the pen has
 *   to shut the affordances, and a client-side boolean is not evidence that it does;
 * - **no activity is lost** to a dissolve. The count comes from the API, not from what the screen
 *   is showing.
 */
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
let orgSlug = '';

test('WBS: group, see, dissolve — without losing work', async ({ page }) => {
  test.slow();

  orgSlug = await onboard(page, STAMP);
  await createPlan(page, 'Riverside Programme');
  await ensurePen(page);

  // ---------------------------------------------------------------- seed
  // One summary and five loose activities. Seeded through the API: what this journey is about is
  // what happens to them next, not how they were typed in.
  await seedActivities(page, orgSlug, [
    { name: 'Substructure', type: 'WBS_SUMMARY' },
    { name: 'Excavate' },
    { name: 'Blind' },
    { name: 'Reinforce' },
    { name: 'Pour' },
    { name: 'Strike' },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  const seeded = await activityCount(page, orgSlug);
  expect(seeded).toBe(6);

  // ------------------------------------------------- M4b: multi-select bulk assign
  // The canvas-first workspace (ADR-0030) puts the table in a collapsible bottom panel, so reach it
  // explicitly before asserting anything about its contents.
  await openActivitiesPanel(page);

  // Presence BEFORE absence, and in that order deliberately: `toHaveCount(0)` is satisfied just as
  // well by a table that never rendered, so the summary-has-no-checkbox assertion below is only
  // meaningful once some other row is known to have one. Asserted the other way round, this block
  // passed against a collapsed panel and failed five lines later for an unrelated-looking reason.
  await expect(rowCheckbox(page, 'Excavate')).toBeVisible();
  // A summary offers no checkbox — nesting one is the Breakdown picker's job (spec C-1b).
  await expect(rowCheckbox(page, 'Substructure')).toHaveCount(0);

  await rowCheckbox(page, 'Excavate').check();
  await rowCheckbox(page, 'Blind').check();
  await rowCheckbox(page, 'Reinforce').check();
  await rowCheckbox(page, 'Pour').check();
  await rowCheckbox(page, 'Strike').check();

  const assignTo = page.getByLabel('Assign to');
  await expect(assignTo).toBeVisible();
  await assignTo.selectOption({ label: 'Substructure' });
  await expect(page.getByText('5 activities will move')).toBeVisible();
  await page.getByRole('button', { name: 'Assign' }).click();

  // The batch landed — every row now names its parent in the read-only WBS column. Read from the
  // table rather than from a toast: a toast proves a request was made, not that it was accepted.
  await expect(page.getByRole('button', { name: 'Assign' })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /Excavate/ }).getByText('Substructure')).toBeVisible();

  // Nothing was created or destroyed by a re-parent.
  expect(await activityCount(page, orgSlug)).toBe(seeded);

  await recalculate(page, orgSlug);
  await ensurePen(page);

  // ------------------------------------------------- M4: the pinned canvas band
  // The a11y invariant first (ADR-0063 §4): summaries leave the SCENE when the band is on, and must
  // not leave the accessibility tree with it. The listbox is the only way an AT user reaches a bar.
  const before = await diagramActivityList(page).getByRole('option').count();
  await toggleView(page, 'WBS band');
  await expect(page.getByTestId('tsld-wbs-band')).toBeVisible();
  await expect(diagramActivityList(page).getByRole('option')).toHaveCount(before);

  // The band sits under the ruler and above the scene — the scene's top moved down with it.
  const bandBox = await page.getByTestId('tsld-wbs-band').boundingBox();
  expect(bandBox?.height ?? 0).toBeGreaterThan(0);

  await toggleView(page, 'WBS band');
  await expect(page.getByTestId('tsld-wbs-band')).toHaveCount(0);

  // ------------------------------------------------- M3: the derived Unassigned bucket
  // Everything is filed right now, so there is nothing unassigned. Add one loose activity and the
  // bucket appears — derived, never persisted.
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  const grid = page.getByRole('treegrid', { name: 'Schedule as a bar chart' });
  await expect(grid).toBeVisible();
  await expect(grid.getByText('Unassigned')).toHaveCount(0);

  await seedActivities(page, orgSlug, [{ name: 'Loose end' }]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await page.getByRole('button', { name: 'Gantt', exact: true }).click();
  await expect(grid.getByText('Unassigned')).toBeVisible();
  await expect(grid.getByText('Loose end')).toBeVisible();

  // ------------------------------------------------- M2: dissolve keeps the work
  await page.getByRole('button', { name: 'TSLD', exact: true }).click();
  const beforeDissolve = await activityCount(page, orgSlug);

  await openRowMenu(page, 'Substructure');
  await page.getByRole('menuitem', { name: 'Dissolve' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText(/keeps the work/)).toBeVisible();
  await expect(confirm.getByText(/its 5 activities move up to the top level/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Dissolve' }).click();
  await expect(confirm).toBeHidden();

  // **The invariant.** Exactly one row left — the summary — and every activity that was in it is
  // still in the plan. Counted at the API, because a table can be showing a stale page.
  await expect(page.getByRole('cell', { name: 'Substructure', exact: true })).toHaveCount(0);
  expect(await activityCount(page, orgSlug)).toBe(beforeDissolve - 1);
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();

  // ------------------------------------------------- M0-T4: the honest delete warning
  // Cascade delete is the opposite of dissolve, and the confirmation has to say so with a number.
  const [second] = await seedActivities(page, orgSlug, [
    { name: 'Superstructure', type: 'WBS_SUMMARY' },
  ]);
  expect(second).toBeDefined();
  await page.reload();
  await ensurePen(page);
  await openActivitiesPanel(page);

  await rowCheckbox(page, 'Excavate').check();
  await rowCheckbox(page, 'Blind').check();
  await page.getByLabel('Assign to').selectOption({ label: 'Superstructure' });
  await page.getByRole('button', { name: 'Assign' }).click();
  await expect(page.getByRole('button', { name: 'Assign' })).toHaveCount(0);

  await openRowMenu(page, 'Superstructure');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const deleteConfirm = page.getByRole('alertdialog');
  // The number is the point: "delete this summary" hides that it takes two activities with it.
  await expect(deleteConfirm.getByText(/the 2 activities below it/)).toBeVisible();
  await deleteConfirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(deleteConfirm).toBeHidden();

  // ------------------------------------------------- the pen actually gates
  await releasePen(page);
  // Dissolve is a structural write: without the pen the row menu does not offer it at all, the same
  // as Edit and Delete.
  await openRowMenu(page, 'Superstructure');
  await expect(page.getByRole('menuitem', { name: 'Dissolve' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Selecting is a READ, so the checkboxes stay live without the pen — and they must, because the
  // bar they open is the only place that says why the write is shut. The bar is SHADED with that
  // reason rather than hidden: `aria-disabled`, so it keeps its place in the tab order.
  await rowCheckbox(page, 'Excavate').check();
  const assign = page.getByRole('button', { name: 'Assign' });
  await expect(assign).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('status')).toContainText('Start editing');
});
