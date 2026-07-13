import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  addActivity,
  onboard,
  openNewPlan,
  openToolbarOverflow,
  setPlannedStart,
  startEditing,
} from './support';

/**
 * Flag-ON **canvas-maximal, toolbar-hosted workspace** journey (`VITE_CANVAS_TOOLBAR`, ADR-0031) —
 * the layer above ADR-0030's canvas-first workspace. Proves the toolbar layout runs end-to-end in a
 * real browser: opening a plan mounts a slim header + one command `role="toolbar"` over a
 * **chromeless, full-height canvas**, with the activities panel **collapsed by default**. Every former
 * chrome band is one click away in the toolbar — plan actions in the `⋯` overflow, display toggles in
 * the `View▾` popover — and the toolbar is a single roving-tabindex APG widget. It then populates the
 * plan so the frame controls + Project-finish chip light up, exercises the overflow + a popover, drives
 * the collapse/expand focus hand-off, and runs an a11y scan.
 *
 * Wide (desktop) viewport only: the below-`md` single-pane toggle is covered by the component tests;
 * here the full toolbar with the docked bottom panel is the subject.
 */
test('a planner works a plan in the canvas-maximal toolbar workspace', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // The plan opens as the toolbar workspace: one command toolbar over the canvas — not the ADR-0030
  // chrome bands, and not the legacy long-scrolling page. On a fresh plan the canvas shows its
  // empty-state prompt (the labelled diagram region only appears once activities exist), and the
  // activities panel is collapsed to give the canvas the room (canvas-maximal).
  await expect(page.getByRole('toolbar', { name: 'Plan toolbar' })).toBeVisible();
  await expect(page.getByText(/No activities to diagram yet/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand activities panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse activities panel' })).toBeHidden();

  // The slim header omits status/description; the toolbar `⋯` overflow exposes them to any role.
  await openToolbarOverflow(page);
  await page.getByRole('menuitem', { name: /plan details/i }).click();
  const details = page.getByRole('dialog', { name: 'Plan details' });
  await expect(details.getByText('Status')).toBeVisible();
  await expect(details.getByText('Planned start')).toBeVisible();
  await details.getByRole('button', { name: 'Close dialog' }).click();

  // Populate the plan so the canvas has something to plot.
  await setPlannedStart(page, '2026-01-01');
  await startEditing(page); // take the pen — the authoring toolbar group goes live
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');
  await page.getByRole('button', { name: 'Recalculate' }).click();

  // With activities computed, the `hasDiagram`-gated controls light up: the pinned Project-finish
  // chip and the `View▾` lens popover (both `render` items, always inline — unlike the width-
  // demotable Fit/scale buttons, which can slide into the `⋯` overflow on a narrow bar). The canvas
  // now plots the activities in its labelled diagram region with a focusable option each.
  const toolbar = page.getByRole('toolbar', { name: 'Plan toolbar' });
  await expect(toolbar.getByRole('button', { name: 'View' })).toBeVisible();
  await expect(toolbar.getByText('Finish')).toBeVisible();
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();
  await expect(diagram.getByRole('option')).toHaveCount(2);

  // The display toggles moved off the canvas into the `View▾` Tier-2 popover — a non-modal disclosure
  // whose trigger is a roving toolbar member. Toggling a layer and closing keeps the canvas mounted.
  await toolbar.getByRole('button', { name: 'View' }).click();
  const viewPanel = page.getByRole('dialog', { name: 'View' });
  await viewPanel.getByLabel('Labels').click();
  await page.keyboard.press('Escape');
  await expect(viewPanel).toBeHidden();
  await expect(diagram.getByRole('option')).toHaveCount(2);

  // Baselines is reachable via the `⋯` overflow (no capability lost when the chrome band went away).
  await openToolbarOverflow(page);
  await page.getByRole('menuitem', { name: /baselines/i }).click();
  const baselines = page.getByRole('dialog', { name: 'Baselines' });
  await expect(baselines).toBeVisible();
  await baselines.getByRole('button', { name: 'Close dialog' }).click();

  // Adding activities opened the panel, so it's expanded here with the rows docked. Collapse it from
  // its header control; focus lands on the reciprocal Expand control (never stranded — WCAG 2.4.3)
  // and the rows disappear.
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(collapse).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();
  await collapse.click();
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  await expect(expand).toBeFocused();
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeHidden();

  // Re-expand from the collapsed bar; focus returns to the Collapse control and the rows are back.
  await expand.click();
  await expect(collapse).toBeFocused();
  await expect(page.getByRole('cell', { name: 'Excavate', exact: true })).toBeVisible();

  // The toolbar is one roving-tabindex APG widget: arrows move focus between controls. Drive it from
  // the pinned View trigger (a stable, never-demoted target) — ArrowRight moves focus off it.
  const viewTrigger = toolbar.getByRole('button', { name: 'View' });
  await viewTrigger.focus();
  await expect(viewTrigger).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(viewTrigger).not.toBeFocused();

  // The canvas-maximal toolbar workspace is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
