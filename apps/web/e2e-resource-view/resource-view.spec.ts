import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  assignResource,
  createResource,
  drawTask,
  onboard,
  openNewPlan,
  startEditing,
} from './support';

/**
 * Flag-ON **canvas-axis-aligned resource strip + on-bar over-allocation highlight** journey
 * (`VITE_CANVAS_RESOURCE_VIEW`, Stage E, `docs/specs/canvas-resource-view/`, ADR-0049). Proves the
 * `resource-view` lens's whole M1 loop runs in a real browser, over the canvas-maximal toolbar
 * (ADR-0031) and canvas-first authoring (ADR-0032):
 *
 * 1. A planner creates a library resource, then draws one task on the canvas and assigns that resource
 *    to it with budgeted units — real UI flows, seeding the resource histogram the strip reads (no API
 *    short-cut).
 * 2. Toggling **Resource view** from the Look row's lens group reveals the docked
 *    `<section aria-label="Resource loading">` panel and its `aria-hidden` canvas-sibling strip
 *    (`data-testid="tsld-resource-strip"`); focus moves into the panel on reveal.
 * 3. The picker + bucket-size `Select` are exercised (switching Week → Day), and the "Show data table"
 *    disclosure reveals the parallel accessible `<table>` (the strip canvas's WCAG 2.2 AA equivalent).
 * 4. Toggling Resource view back off unmounts the panel and removes the strip canvas, reclaiming the
 *    band — the parity gate's "byte-for-byte when inactive" from the user's seat.
 * 5. **Over-allocation:** genuinely producing `levelingWindowExceeded`/`selfOverAllocated` needs resource
 *    levelling to actually run over a real capacity conflict (`levelResources` on, two overlapping
 *    assignments exceeding a resource's `maxUnitsPerHour`, then a recalculation) — not reliably
 *    deterministic to assemble in this harness alongside the M1 strip journey above. This suite instead
 *    asserts the **disabled-with-reason empty state** (Stage E M2 acceptance criterion: "Given no
 *    activity is over-allocated … it is disabled-with-reason") on the plan this journey already built,
 *    which — with no levelling ever run — deterministically has zero over-allocated activities. The
 *    marking/announcement/clickable-to-off (B5) behaviours themselves are covered at the unit level
 *    (`TsldPanel.resource-view.test.tsx`, `tsld-toolbar-resource-view.test.tsx`).
 * 6. An axe pass over the Look-row toolbar + the "Resource loading" region confirms the docked strip
 *    stays WCAG 2.2 AA.
 *
 * Serial (the suite mutates one shared plan); Chromium only (TECH_DEBT #25a).
 */
test('a planner reveals the canvas resource strip, reads a resource’s load, and finds the over-allocation lens empty', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await createResource(page, 'Crew A'); // seed the org resource library before opening any plan
  await openNewPlan(page);
  await startEditing(page); // take the pen — Add + drawing go live

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();

  // (1) Draw one task; the first draw silently sets the plan start and auto-recalcs (ADR-0032), then
  // assign the library resource to it with budgeted units — seeding real histogram data.
  await drawTask(page, 'Survey', { x: 260, y: 140 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await assignResource(page, 'Survey', 'Crew A', 8);

  const lookToolbar = page.getByRole('toolbar', { name: 'View and navigate' });

  // (2) Reveal the resource view: the docked panel + the aria-hidden canvas strip both appear, and
  // focus moves into the panel (mirrors the activities-panel expand focus move).
  // Both lenses moved into `View ▾` in ADR-0090 M2-T2 — they were 32 px each on a Row 1 that was
  // 109 px over its container. `openView()` is idempotent, so each use reads as "reach the control"
  // rather than "manage a popover", which is what keeps the assertions below about the LENS.
  const viewTrigger = lookToolbar.getByRole('button', { name: /^View/ });
  const openView = async (): Promise<void> => {
    if ((await viewTrigger.getAttribute('aria-expanded')) !== 'true') await viewTrigger.click();
  };
  const resourceViewButton = page.getByRole('checkbox', { name: 'Resource view' });
  await openView();
  await expect(resourceViewButton).toBeEnabled();
  await resourceViewButton.click();

  const stripPanel = page.getByRole('region', { name: 'Resource loading' });
  await expect(stripPanel).toBeVisible();
  await expect(page.locator('[data-testid="tsld-resource-strip"]')).toBeVisible();
  // Best-effort focus-management proof: the panel moves focus into itself on reveal.
  //
  // **And that now happens from inside an open popover** (ADR-0090 M2-T2 moved this lens into
  // `View ▾`), so revealing the strip ejects the planner from the popover they were using. The
  // assertion is deliberately placed immediately after the click, with no intervening re-open,
  // because that ordering is what documents the behaviour: anything else here would quietly paper
  // over it. It is defensible — ADR-0049 moves focus to a revealed panel on purpose — but it does
  // mean `View ▾` now holds one toggle that behaves differently from its neighbours, which is
  // `docs/TECH_DEBT.md` #125 for the M5 gate pass rather than something to fix mid-relocation.
  await expect(stripPanel).toBeFocused();

  // (3) Exercise the resource picker (the freshly-assigned resource is the only — and so default —
  // series) and the reused bucket-size Select, then expand the parallel accessible table.
  const resourcePicker = stripPanel.getByLabel('Resource');
  await expect(resourcePicker).toBeVisible();
  await expect(resourcePicker.locator('option')).toHaveText(['Crew A']);

  const bucketSizeSelect = stripPanel.getByLabel('Bucket size');
  await expect(bucketSizeSelect).toHaveValue('WEEK');
  await bucketSizeSelect.selectOption('DAY');
  await expect(bucketSizeSelect).toHaveValue('DAY');

  await stripPanel.getByText(/Show data table for Crew A/).click();
  const table = stripPanel.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.locator('caption')).toContainText('day bucket');
  await expect(table.getByRole('columnheader', { name: 'Crew A' })).toBeVisible();

  // (5) Over-allocation empty state: this plan never ran levelling, so there is deterministically
  // nothing over-allocated — the item shades with the reason (shade-don't-hide, matching Next-conflict).
  const overAllocationButton = page.getByRole('checkbox', { name: 'Flag over-allocated' });
  await openView();
  await expect(overAllocationButton).toBeVisible();
  await expect(overAllocationButton).toHaveAttribute('aria-disabled', 'true');
  // The empty-state reason is `aria-describedby`-linked now, not a `title` — so it is readable by a
  // screen reader on a shut control, which a `title` is not (ADR-0083). Asserting the linked text
  // rather than the attribute is what makes this a test of the reason and not of the markup.
  await expect(
    page.locator(`#${await overAllocationButton.getAttribute('aria-describedby')}`),
  ).toHaveText(/No over-allocation to show/);
  await expect(overAllocationButton).not.toBeChecked();

  // (6) The Look-row toolbar + the open "Resource loading" region stay accessible with the strip open
  // and the table expanded.
  const results = await new AxeBuilder({ page })
    .include('[role="toolbar"][aria-label="View and navigate"]')
    .include('section[aria-label="Resource loading"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // (4) Toggle Resource view back off — the panel unmounts and the strip canvas is gone (band reclaimed,
  // byte-for-byte parity with the inactive state).
  await openView();
  await resourceViewButton.click();
  await openView();
  await expect(resourceViewButton).not.toBeChecked();
  await expect(page.getByRole('region', { name: 'Resource loading' })).toHaveCount(0);
  await expect(page.locator('[data-testid="tsld-resource-strip"]')).toHaveCount(0);
});
