import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttGrid,
  ganttRow,
  onboard,
  seedActivities,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';
import { activityEditor } from '../e2e-support/activity-editor';
import { recalculate, toolbarOffers } from '../e2e-support/toolbar';

/**
 * **M1 — object actions in the Gantt**, driven against a real API with the pen enforced.
 *
 * ADR-0093 took `Report progress` off the command surface because an action whose subject is the
 * selected object belongs on the object's surface. Its replacement — the ADR-0092 canvas dock — was
 * canvas-only, so the Gantt was left with no object-action surface at all. The product owner
 * accepted that on 2026-08-13 **explicitly on the basis that this milestone would close it**, which
 * makes the assertions below the discharge of a promise rather than coverage of a feature.
 *
 * **What this journey proves that no unit test can.** The bar is portalled by `CanvasDock` into the
 * Activities handle row when that outlet is registered and rendered in place when it is not
 * (ADR-0092's parity contract). Which of those happens depends on real mounting order in a real
 * browser, and jsdom has neither. It also drives the registry through the shipped workspace rather
 * than a mounted fragment, so an item wired into a component and not into the layout the flag
 * selects would fail here and pass in isolation — the ADR-0080 defect, which shipped exactly that way.
 *
 * **What it deliberately does NOT prove.** The promise names a *Contributor*, and progress is
 * role-gated rather than pen-gated (ADR-0060 Q-C). There is no Contributor helper in this
 * repository — the role needs the invite/accept flow — and inventing one here would be a second
 * copy of `e2e/members.spec.ts`. So this drives an Org Admin and asserts the *route*; the
 * permission split it rests on is already proven against a real 423 by
 * `e2e-activity-editor/activity-editor.spec.ts`. Stated rather than left for a reader to assume the
 * role was covered.
 */

const GANTT_ONLY_ABSENT = ['Zoom to selection', 'Isolate logic path'] as const;

test.describe.configure({ mode: 'serial' });

test('a planner acts on a Gantt selection from the docked object bar', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 4);

  // Recalculate so the chart has bars — the Gantt renders its not-calculated state otherwise, and a
  // selection assertion against that state would be testing the empty view.
  await recalculate(page);
  await showGantt(page);
  await expect(ganttGrid(page)).toBeVisible();

  // Select a row IN THE GANTT. This is the gesture the promise is about: before M1 it produced a
  // selection with nothing to do with it.
  const row = ganttRow(page, 'Seeded 0');
  await row.click();

  // The bar names its subject, so a planner can tell what they are about to act on.
  const bar = page.getByRole('toolbar', { name: /Actions for/ });
  await expect(bar).toBeVisible();

  // **The promise itself.** Report progress is reachable from a Gantt selection, and it opens the
  // editor on the Progress scope rather than somewhere the planner must then navigate from.
  await bar.getByRole('button', { name: 'Progress' }).click();
  const editor = activityEditor(page);
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('tab', { name: /Progress/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // `Close`, not `Close dialog`: the editor is the drawer's now (ADR-0099), and the ✕ this used to
  // press was the `Dialog` chrome's own. The button below is the editor's, which is the route that
  // clears the subject in either chrome.
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(editor).toBeHidden();
});

test('the Gantt offers no canvas-only action, and no longer offers Add note', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await recalculate(page);
  await showGantt(page);
  await ganttRow(page, 'Seeded 0').click();

  const bar = page.getByRole('toolbar', { name: /Actions for/ });
  await expect(bar).toBeVisible();

  // Absent, not shaded. Zoom-to-selection and isolate are things the object **cannot do in this
  // projection** rather than things this reader may not do, which is ADR-0082's omit branch. A
  // shaded control here would promise a capability the view does not have.
  for (const label of GANTT_ONLY_ABSENT) {
    await expect(bar.getByRole('button', { name: label })).toHaveCount(0);
  }

  // **`Add note` is retired from the Gantt** (M1). Spec F4 found it was the only route a Contributor
  // had to progress here — a button labelled "Add note" plus a tab change, which is the
  // discoverability failure this milestone exists to fix. Leaving it beside the correctly-labelled
  // route would be a third entry point rather than a replacement: ADR-0093's own defect reproduced
  // inside the milestone meant to discharge it.
  //
  // **Asked of the whole command strip, not of the row** (Graphite M8). This was
  // `getByRole('button', { name: 'Add note' })`, which asks only whether the command is *inline* —
  // so it answered "retired" the moment M5's merge demoted `add-note` into the `⋯`, and the
  // positive assertion below answered "gone" for the same reason. Both were wrong about the same
  // fact, in the one suite a sweep never finished.
  expect(await toolbarOffers(page, 'add-note')).toBe(false);

  // It is still the canvas's route into the Logic panel, so the retirement is scoped to this view
  // rather than a deletion. Switching back must bring it home — on the row or in the `⋯`, which is
  // the ladder's business and not this journey's.
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  expect(await toolbarOffers(page, 'add-note')).toBe(true);
});

test('the docked bar in the Gantt is accessible', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
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

  /**
   * The `e2e-toolbar-fit/fit.spec.ts:598-604` configuration, **verbatim and for its reason**:
   * `target-size` is tagged `wcag22aa` AND ships `enabled: false`, so a scan requesting the usual
   * tags silently skips it. ADR-0090 M5 records "the axe scan is green" being true and meaningless
   * for exactly that reason. The widened tag list plus the explicit opt-in is the only configuration
   * in this repository verified to surface a target-size failure a plain scan misses.
   */
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .options({ rules: { 'target-size': { enabled: true } } })
    .include('[role="toolbar"]')
    .analyze();

  expect(results.violations).toEqual([]);
});
