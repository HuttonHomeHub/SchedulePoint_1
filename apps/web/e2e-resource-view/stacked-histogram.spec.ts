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
 * The **stacked** resource histogram journey (ADR-0121, `docs/specs/stacked-resource-histogram/`).
 *
 * The sibling journey proves one resource's load. This one proves the thing that epic added: more
 * than one resource in the same picture, told apart by colour.
 *
 * **It exists because of a defect no unit suite in this repository could have reported.** The
 * strip's segments carried `var(--chart-n)` straight to a canvas, and Canvas 2D's `fillStyle`
 * setter DISCARDS an unparseable value and keeps the previous colour — no throw, no warning. The
 * stack would have painted as one solid block while every unit test stayed green, because jsdom has
 * no canvas and a test asserting a segment's `fill` string passes on exactly the value a browser
 * refuses. So the load-bearing assertion here is a **pixel read**: sample a column of the real
 * strip canvas and require at least two distinct colours in it. That question cannot be asked
 * anywhere but a browser, which is why it is asked here and not in a component test.
 *
 * Serial, Chromium only, consistent with its sibling (TECH_DEBT #25a).
 */
test('a planner stacks two trades, tells them apart by colour, and reads the total', async ({
  page,
}) => {
  const stamp = Date.now();
  await onboard(page, stamp);
  await createResource(page, 'Crew A');
  await createResource(page, 'Crew B');
  await openNewPlan(page);
  await startEditing(page);

  const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
  await expect(diagram).toBeVisible();

  // Two activities, one resource each, overlapping in time — so both series are non-zero in the same
  // buckets and the stack has something to stack.
  await drawTask(page, 'Excavate', { x: 260, y: 140 });
  await expect(diagram.getByRole('option')).toHaveCount(1, { timeout: 15_000 });
  await drawTask(page, 'Pour slab', { x: 300, y: 200 });
  await expect(diagram.getByRole('option')).toHaveCount(2, { timeout: 15_000 });
  await assignResource(page, 'Excavate', 'Crew A', 8);
  await assignResource(page, 'Pour slab', 'Crew B', 6);

  const lookToolbar = page.getByRole('toolbar', { name: 'Plan commands' });
  await lookToolbar.getByRole('button', { name: 'Resource view' }).click();

  const stripPanel = page.getByRole('region', { name: 'Resource loading' });
  await expect(stripPanel).toBeVisible();

  // The stacked view is the picker's own option, and it is the default when nothing is picked.
  const resourcePicker = stripPanel.getByLabel('Resource');
  await expect(resourcePicker.locator('option')).toContainText([
    'All resources (stacked)',
    'Crew A',
    'Crew B',
  ]);
  await resourcePicker.selectOption({ label: 'All resources (stacked)' });

  // **The assertion the epic exists for.** Read the real strip canvas back and count distinct
  // colours down one column of a bar. A stack painted with unresolved `var()` fills is a single
  // block; a correctly resolved one is at least two.
  const strip = page.locator('[data-testid="tsld-resource-strip"]');
  await expect(strip).toBeVisible();
  const distinctColours = await strip.evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('the strip canvas has no 2D context');
    const { width, height } = canvas;
    // The tallest column: bars grow from the baseline, so the column with the most non-transparent
    // pixels is a bar rather than a gap. Found rather than assumed, because bucket x positions
    // depend on the zoom the plan happens to open at.
    let bestX = -1;
    let bestInk = 0;
    for (let x = 0; x < width; x += 1) {
      const col = ctx.getImageData(x, 0, 1, height).data;
      let ink = 0;
      for (let y = 0; y < height; y += 1) if ((col[y * 4 + 3] ?? 0) > 0) ink += 1;
      if (ink > bestInk) {
        bestInk = ink;
        bestX = x;
      }
    }
    if (bestX < 0) throw new Error('nothing is painted on the strip canvas at all');
    const col = ctx.getImageData(bestX, 0, 1, height).data;
    const seen = new Set<string>();
    for (let y = 0; y < height; y += 1) {
      const a = col[y * 4 + 3] ?? 0;
      if (a === 0) continue;
      seen.add(`${String(col[y * 4])},${String(col[y * 4 + 1])},${String(col[y * 4 + 2])}`);
    }
    return seen.size;
  });
  // Two fills, plus the axis rule and the ground-coloured boundary between them: >= 2 is the claim
  // that matters, and stating it loosely is deliberate — pinning an exact count would make this a
  // test of the boundary-rule policy rather than of whether the trades are distinguishable.
  expect(distinctColours).toBeGreaterThanOrEqual(2);

  // The text equivalent: both trades named, and the derived Total column present.
  await stripPanel.getByText('Show data table', { exact: true }).click();
  const table = stripPanel.getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Crew A' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Crew B' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Total' })).toBeVisible();

  // **`Stack by` is operable, and only its `Group` option is shaded.** Neither resource has a
  // parent, so grouping would do nothing — but `Kind` needs no groups at all, and until 2026-09-01
  // the whole select was disabled here, which withheld it from exactly the unorganised programme it
  // is most useful on (`docs/TECH_DEBT.md` #228 item 4). This assertion is what caught that: it
  // read `toBeDisabled()` and went red on the change, which is the only place that rule was pinned.
  const stackBy = stripPanel.getByLabel('Stack by');
  await expect(stackBy).toHaveValue('resource');
  await expect(stackBy).toBeEnabled();
  await expect(
    stripPanel.getByRole('option', { name: /^Group — none in the library yet$/ }),
  ).toBeDisabled();

  // **Stacking by kind re-bands the picture end to end.** Both crews are LABOUR (the library
  // form's default), so the two named bands collapse into one called `Labour` — a real
  // re-partition a planner can see, against a real API, which no unit suite can say.
  await expect(stripPanel.getByRole('list', { name: 'Legend' })).toContainText('Crew A');
  await stackBy.selectOption('kind');
  const legend = stripPanel.getByRole('list', { name: 'Legend' });
  await expect(legend).toContainText('Labour');
  await expect(legend).not.toContainText('Crew A');
  // The table is the chart's accessible equivalent and deliberately stays per-resource in every
  // mode — it carries more than the chart, never less. Asserted so the asymmetry is a decision on
  // the record rather than something a later reader "fixes".
  await expect(table.getByRole('columnheader', { name: 'Crew A' })).toBeVisible();
  await stackBy.selectOption('resource');

  // Isolating one resource returns the single-series picture, and says whose it is.
  await resourcePicker.selectOption({ label: 'Crew A' });
  await expect(stripPanel.getByText(/Show data table for Crew A/)).toBeVisible();
});
