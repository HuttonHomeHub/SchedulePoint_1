import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  addActivity,
  onboard,
  openNewPlan,
  openPlanActions,
  setPlannedStart,
  startEditing,
} from './support';

/**
 * Flag-ON **canvas-first workspace** journey (`VITE_CANVAS_WORKSPACE`, ADR-0030). Proves the
 * workspace layout runs end-to-end in a real browser: opening a plan mounts the TSLD canvas as
 * the primary surface with the activities table docked in a drag-resizable bottom panel — not
 * the legacy long-scrolling page — and the panel collapses/expands from the keyboard with focus
 * following onto the reciprocal control (no drop to `<body>`, WCAG 2.4.3). It also exercises the
 * overflow **Plan details** read surface and the drag-resizer, then runs an a11y scan.
 *
 * Wide (desktop) viewport only: the below-`md` single-pane view toggle is covered by the
 * component tests; here the split layout with the bottom panel is the subject.
 */
test('a planner works a plan in the canvas-first workspace', async ({ page }) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await openNewPlan(page);

  // The plan opens as the workspace, not the legacy page: the canvas is the primary surface with
  // the activities table docked as its own labelled bottom region below it. On a fresh plan the
  // canvas shows its empty-state prompt (the labelled diagram region only appears once activities
  // exist), so assert that + the bottom panel to prove the canvas-first layout mounted.
  const activities = page.getByRole('region', { name: 'Activities' });
  await expect(activities).toBeVisible();
  await expect(page.getByText(/No activities to diagram yet/i)).toBeVisible();

  // The slim header omits status/description; the overflow "Plan details" exposes them to any role.
  await openPlanActions(page);
  await page.getByRole('menuitem', { name: /plan details/i }).click();
  const details = page.getByRole('dialog', { name: 'Plan details' });
  await expect(details.getByText('Status')).toBeVisible();
  await expect(details.getByText('Planned start')).toBeVisible();
  await details.getByRole('button', { name: 'Close dialog' }).click();

  // Populate the plan so the canvas has something to plot.
  await setPlannedStart(page, '2026-01-01');
  await startEditing(page); // take the pen — editing affordances go live
  await addActivity(page, 'Excavate');
  await addActivity(page, 'Pour slab');
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.getByText('Project finish')).toBeVisible();

  // With activities present the canvas now plots them: the labelled diagram region appears with a
  // focusable option per activity (the parallel a11y layer).
  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();

  // Collapse the activities panel from its header control; focus lands on the expand control of
  // the collapsed bar (never stranded on the removed panel — the whole point of the focus hand-off).
  await activities.getByRole('button', { name: 'Collapse activities panel' }).click();
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  await expect(expand).toBeFocused();
  await expect(activities).toBeHidden();

  // Re-expand; focus returns to the collapse control so the keyboard user stays on the panel.
  await expand.click();
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(collapse).toBeFocused();
  await expect(page.getByRole('region', { name: 'Activities' })).toBeVisible();

  // The panel is a real WAI-ARIA window splitter: keyboard-resizable, and resizing keeps the
  // canvas mounted (no jump / remount — the split just re-proportions).
  const resizer = page.getByRole('separator', { name: 'Resize activities panel' });
  await resizer.focus();
  const before = await resizer.getAttribute('aria-valuenow');
  await page.keyboard.press('ArrowDown'); // shrink one step — reliably below the default, above min
  await expect(resizer).not.toHaveAttribute('aria-valuenow', before ?? '');
  await expect(diagram.getByRole('option')).toHaveCount(2);

  // The canvas-first workspace is accessible.
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([]);
});
