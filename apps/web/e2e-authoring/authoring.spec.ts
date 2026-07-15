import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { drawActivity, onboard, openNewPlan, startEditing } from './support';

/**
 * Flag-ON **canvas-first plan authoring** journey (`VITE_CANVAS_AUTHORING`, ADR-0032) — the layer
 * above ADR-0031's toolbar workspace. Proves the whole authoring loop runs in a real browser:
 *
 * 1. A brand-new plan opens on a **draw-ready blank canvas** (anchored to today) — the diagram region
 *    is present with zero activities, not the "recalculate first" empty state (M1).
 * 2. Drawing the **first activity** silently sets the plan start and the schedule **auto-recalcs** —
 *    the bar plots without anyone pressing Recalculate (M1 + M3).
 * 3. The **Add split-button** places a **milestone** directly on the canvas (M4).
 * 4. The **Link split-button** (mirroring Add) picks the FS/SS/FF kind and arms link-mode in one
 *    gesture — the authoring path for dependencies, with the edge-drag affordance gone (M5).
 *
 * Serial + wide viewport (the suite mutates one shared plan); Chromium only (TECH_DEBT #25a).
 */
test('a planner authors a plan directly on the canvas', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // M1 — the plan opens draw-ready: the diagram region is mounted even with no activities (the canvas
  // anchors to today), so there is no "recalculate/set a start first" detour before the first draw.
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();
  await expect(page.getByText(/No activities to diagram yet/i)).toBeHidden();
  await expect(diagram.getByRole('option')).toHaveCount(0);

  // Take the pen — the Row 2 · Do authoring cluster (Add split-button, Link tool) lights up. (The
  // data date lives off the toolbar now — set silently on first draw, changed via Edit plan.)
  await startEditing(page);
  const toolbar = page.getByRole('toolbar', { name: 'Build and manage' });
  // Match the Add split-button ("Add" / "Adding <kind>") without colliding with the inline
  // "Add note" placeholder that now shares the row (Playwright name matching is substring).
  await expect(toolbar.getByRole('button', { name: /^Add(ing .+)?$/ })).toBeVisible();

  // M1 + M3 — draw the first task; the first draw silently sets the plan start to today and the
  // schedule auto-recalcs, so the bar plots on its own (no Recalculate click).
  await drawActivity(page, 'Task', 'Excavate', { x: 220, y: 120 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });

  // M4 — place a finish milestone straight on the canvas via the Add split-button's type menu.
  await drawActivity(page, 'Finish milestone', 'Handover', { x: 360, y: 180 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });

  // M5 — the Link split-button mirrors Add: one menu-button whose menu picks the FS/SS/FF kind and
  // arms link-mode in a single gesture (the edge-drag affordance is gone). (The click-pick-click
  // creation itself is covered by the gesture-machine unit tests; here we prove the split-button +
  // type menu are wired into the live toolbar.)
  const linkTool = toolbar.getByRole('button', { name: 'Link', exact: true });
  await expect(linkTool).toBeVisible();
  await linkTool.click();
  await page.getByRole('menuitemradio', { name: /Start → Start/ }).click();
  // Picking a kind enters link-mode and relabels the button with the armed code (Linking · SS).
  await expect(toolbar.getByRole('button', { name: /Linking · SS/ })).toBeVisible();

  // The canvas-first authoring workspace is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
