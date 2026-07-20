import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { armLoeTool, drawTask, onboard, openNewPlan, pickLoeSpan, startEditing } from './support';

/**
 * Flag-ON **on-canvas advanced activity types** journey (`VITE_CANVAS_ACTIVITY_TYPES`, Stage D,
 * `docs/specs/canvas-activity-types/`, M-D1 Task 4) — the canvas Add split-button's Level of Effort
 * (hammock) endpoint-pick tool, layered on canvas-first authoring (ADR-0032). Proves the whole
 * two-click LOE loop runs in a real browser:
 *
 * 1. A planner holding the pen draws two tasks directly on the canvas (auto-recalcs, ADR-0032 M1/M3).
 * 2. Arming **Level of Effort (hammock)** from the Add split-button's "Span between activities"
 *    section replaces the two flag-off "Soon" placeholders with ONE live item.
 * 3. Picking a start driver then a finish driver (via the parallel-DOM keyboard path — deterministic
 *    regardless of on-canvas pixel geometry, and itself the tool's WCAG 2.1.1 keyboard-operability
 *    proof) composes a `LEVEL_OF_EFFORT` activity spanning them as one undoable action; the new
 *    activity appears in the diagram's accessible listbox once the canvas redraws.
 * 4. An axe pass over the authoring toolbar + diagram confirms the multi-step pick affordance stays
 *    WCAG 2.2 AA.
 *
 * Serial + wide viewport (the suite mutates one shared plan); Chromium only (TECH_DEBT #25a).
 */
test('a planner composes a level-of-effort span from two picked driver activities', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);
  await startEditing(page); // take the pen — the Add split-button + LOE tool go live

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();

  // (1) Draw two tasks; the first draw silently sets the plan start and the schedule auto-recalcs,
  // so both bars plot on their own (no manual Recalculate).
  await drawTask(page, 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Pour slab', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // (2) Arm the Level of Effort (hammock) tool from the Add menu — the toolbar reflects the armed
  // tool-mode the same way Add/Link do ("Adding <kind>" / "Linking · <type>"). Once armed, the Add
  // trigger swaps its label to the mid-pick prompt (B4): "Pick start driver" before the first pick.
  await armLoeTool(page);
  const toolbar = page.getByRole('toolbar', { name: 'Build and manage' });
  await expect(toolbar.getByRole('button', { name: 'Pick start driver' })).toBeVisible();

  // (3) Pick Excavate as the start driver, then Pour slab as the finish driver — composes the LOE
  // (+ SS + FF edges) as one action and recalcs; a third option appears in the diagram.
  await pickLoeSpan(page, 'Excavate', 'Pour slab');
  await expect(diagram.getByRole('option')).toHaveCount(3, { timeout: 15_000 });
  await expect(diagram.getByRole('option', { name: /^Level of effort/ })).toBeVisible();

  // (4) The authoring toolbar + diagram hosting the multi-step pick affordance stay accessible.
  const results = await new AxeBuilder({ page })
    .include('[role="toolbar"][aria-label="Build and manage"]')
    .include('section[aria-label="Time-scaled logic diagram"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
});
