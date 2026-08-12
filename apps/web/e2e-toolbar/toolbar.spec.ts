import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { addActivity, onboard, openNewPlan, startEditing } from './support';

/**
 * The **canvas-maximal, toolbar-hosted workspace** journey (ADR-0031 two-row amendment).
 *
 * **No longer flag-on: it is the only plan workspace there is.** `VITE_CANVAS_TOOLBAR` selected this
 * layout or ADR-0030's, and ADR-0088 D3 retired the flag and deleted the alternative — so this
 * suite now drives the surface every planner gets, unconditionally.
 *
 * Proves the toolbar layout runs end-to-end in a real browser: opening a plan mounts a one-line header + **two** command
 * `role="toolbar"` rows (Look / Do) over a **chromeless, full-height canvas**, with the activities
 * panel **collapsed by default**. Every former chrome band is inline on the two rows (plan actions as
 * icon buttons on Row 2, display toggles in the `View▾` popover) and each row is a roving-tabindex APG
 * widget. It then populates the plan so the frame controls + Project-finish chip light up, exercises an
 * inline plan action + a popover, drives the collapse/expand focus hand-off, and runs an a11y scan.
 *
 * Wide (desktop) viewport only: the below-`md` single-pane toggle is covered by the component tests;
 * here the full toolbar with the docked bottom panel is the subject.
 */
test('a planner works a plan in the canvas-maximal toolbar workspace', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // The plan opens as the toolbar workspace: two command rows over the canvas — not the ADR-0030
  // chrome bands, and not the legacy long-scrolling page. On a fresh plan the canvas shows its
  // empty-state prompt (the labelled diagram region only appears once activities exist), and the
  // activities panel is collapsed to give the canvas the room (canvas-maximal).
  await expect(page.getByRole('toolbar', { name: 'View and navigate' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Build and manage' })).toBeVisible();
  await expect(page.getByText(/No activities to diagram yet/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand activities panel' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Collapse activities panel' })).toBeHidden();

  // Plan-details facts (status + data date) are folded into the Row 1 Summary popover (ADR-0031
  // amendment) — a read surface reachable to any role, no standalone Plan-details button.
  await page.getByRole('button', { name: /Summary/ }).click();
  const summary = page.getByRole('dialog', { name: 'Summary' });
  await expect(summary.getByText('Status')).toBeVisible();
  // "Data date" appears twice in the popover by design (PlanSummaryPanel folds the plan-details
  // facts AND the computed ScheduleSummaryStrip together, ADR-0031) — assert the first is visible.
  await expect(summary.getByText('Data date').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(summary).toBeHidden();

  // Populate the plan so the canvas has something to plot (the plan already carries a mandatory
  // planned start from creation, so the bars plot after a recalc).
  await startEditing(page); // take the pen — the authoring toolbar group goes live
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');
  await page.getByRole('button', { name: 'Recalculate' }).click();

  // With activities computed, the `hasDiagram`-gated controls light up on Row 1 · Look — the `View▾`
  // lens popover — and the Project-finish read-out appears in the PLAN HEADER, where ADR-0090 M2-T3
  // moved it. A change of location, not of capability: the number is more prominent beside the
  // status pill than it was at the far end of a 25-item row.
  const lookRow = page.getByRole('toolbar', { name: 'View and navigate' });
  await expect(lookRow.getByRole('button', { name: /^View/ })).toBeVisible();
  await expect(lookRow.getByText('Finish')).toHaveCount(0);
  await expect(page.getByText('Finish', { exact: true })).toBeVisible();
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();
  await expect(diagram.getByRole('option')).toHaveCount(2);

  // The display toggles moved off the canvas into the `View▾` Tier-2 popover — a non-modal disclosure
  // whose trigger is a roving toolbar member. Toggling a layer and closing keeps the canvas mounted.
  await lookRow.getByRole('button', { name: 'View', exact: true }).click();
  const viewPanel = page.getByRole('dialog', { name: 'View' });
  await viewPanel.getByLabel('Labels').click();
  await page.keyboard.press('Escape');
  await expect(viewPanel).toBeHidden();
  await expect(diagram.getByRole('option')).toHaveCount(2);

  // Baselines sits behind the Row-2 `Analysis` trigger since ADR-0090 M2-T5 — three ways of
  // measuring a plan against something, behind one stop. No capability lost, one click deeper.
  await page.getByRole('button', { name: 'Analysis' }).click();
  await page.getByRole('menuitem', { name: 'Baselines…' }).click();
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

  // The panel is a real WAI-ARIA window splitter: keyboard-resizable, and resizing keeps the canvas
  // mounted (no jump / remount — the split just re-proportions).
  //
  // **Ported from `e2e-workspace/workspace.spec.ts`, which was deleted with `VITE_CANVAS_TOOLBAR`**
  // (ADR-0088 D3). That suite drove the ADR-0030 layout the flag's off-branch selected, and almost
  // everything it proved is proved here for the layout that ships — except this. The test review
  // caught the gap and asked for the assertion to be ported rather than lost silently, which is the
  // difference between deleting a redundant suite and deleting coverage.
  const resizer = page.getByRole('separator', { name: 'Resize activities panel' });
  await resizer.focus();
  const before = await resizer.getAttribute('aria-valuenow');
  await page.keyboard.press('ArrowDown'); // shrink one step — reliably below the default, above min
  await expect(resizer).not.toHaveAttribute('aria-valuenow', before ?? '');
  await expect(diagram.getByRole('option')).toHaveCount(2);

  // Row 1 is one roving-tabindex APG widget: arrows move focus between controls. Drive it from the
  // pinned View trigger (a stable, never-demoted target) — ArrowRight moves focus off it.
  const viewTrigger = lookRow.getByRole('button', { name: 'View', exact: true });
  await viewTrigger.focus();
  await expect(viewTrigger).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(viewTrigger).not.toBeFocused();

  // The canvas-maximal toolbar workspace is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
