import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  onboard,
  seedActivities,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';

/**
 * **M0-T1 R2 — how the Gantt spends its horizontal budget**, measured before M2 adds a column.
 *
 * The plan's M2-T1 risk is "grid width grows and the chart shrinks → **measure** against R2 rather
 * than assuming". This is that measurement, and it is taken at **1646 CSS px** — the product owner's
 * Surface Pro, and the width ADR-0091's retrospective established two whole epics had never once
 * used while reasoning confidently about 1920, 1440, 1024 and 768.
 *
 * **It settled a discrepancy found by reading, and the browser confirmed it.** `GanttPanel.tsx`
 * declared `GRID_WIDTH = 420` while separately deriving `TOTAL_COLUMN_WIDTH` from the columns as
 * **500**, and that derived value was exported and consumed by **nothing** — two answers to one
 * question, one of them dead. Every grid child is `shrink-0`, so on the face of it the row overflows
 * its own box by 80 px. Whether that is what actually *happens* was a question for a browser:
 * `shrink-0` inside an overflowing flex parent, a sticky ancestor and a sibling chart cell is
 * exactly the combination where reading the CSS gives the wrong answer. ADR-0090 was drafted
 * without a shell and was wrong three times; ADR-0091's headline claim was falsified on its first
 * run. So this reports the **rendered** boxes.
 *
 * It did happen. First run, 1646×1097: the pinned block ended at x=709 and **Float rendered at
 * 729–789**, 80 px on top of the chart, its header overlapping the Timeline header, painted over the
 * bars by the pinned block's own `z-10`. `GRID_WIDTH` is now derived, and the same run reports
 * `lastIdentityCellOverhangPx: 0` with the Duration column added — a grid of 584 px against a chart
 * of 773 px, which is the trade the plan's M2-T1 risk asked to have measured rather than assumed.
 *
 * A harness, not a gate: it writes JSON for a human and fails nothing.
 */

interface ColumnBox {
  label: string;
  x: number;
  width: number;
}

test('R2 — the grid/chart split and the real column boxes at 1646', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1646, height: 1097 });

  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 12);
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await showGantt(page);
  await expect(page.getByRole('treegrid')).toBeVisible();

  const measurement = await page.evaluate(() => {
    const grid = document.querySelector('[role="treegrid"]');
    if (grid === null) throw new Error('no treegrid');

    // The header cells carry the column labels; the body cells carry the widths a row really uses.
    // Reading BOTH is the point — a header that agrees with the body proves nothing about whether
    // either fits, and a header/body disagreement is itself the finding.
    const headers = [...grid.querySelectorAll('[role="columnheader"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: (el.textContent ?? '').trim(),
        x: Math.round(r.x),
        width: Math.round(r.width),
      };
    });

    const firstRow = grid.querySelector('[role="row"][aria-rowindex="2"]');
    const cells =
      firstRow === null
        ? []
        : [...firstRow.querySelectorAll('[role="gridcell"]')].map((el) => {
            const r = el.getBoundingClientRect();
            return {
              label: (el.textContent ?? '').trim().slice(0, 24),
              x: Math.round(r.x),
              width: Math.round(r.width),
            };
          });

    // The pinned grid block: the sticky container the identity columns live in.
    const pinned = firstRow?.querySelector('.sticky') ?? null;
    const pinnedRect = pinned?.getBoundingClientRect();

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      gridBox: (() => {
        const r = grid.getBoundingClientRect();
        return { x: Math.round(r.x), width: Math.round(r.width) };
      })(),
      pinnedBox:
        pinnedRect === undefined
          ? null
          : { x: Math.round(pinnedRect.x), width: Math.round(pinnedRect.width) },
      headers,
      cells,
    };
  });

  // Derived, not asserted: does the last identity cell end beyond the pinned block it sits in?
  //
  // The identity cells are every cell EXCEPT the chart's. Slicing to `headers.length` was wrong on
  // the first run and quietly so — "Timeline" is a `columnheader` too, so the slice kept the chart
  // cell and reported ITS overhang under a name that says "identity". The raw boxes were right and
  // the one derived number was not, which is the shape a reader trusts and cannot check.
  const identityCells = measurement.cells.filter((c) => c.label !== '');
  const lastIdentity = identityCells.at(-1);
  const pinnedRight =
    measurement.pinnedBox === null ? null : measurement.pinnedBox.x + measurement.pinnedBox.width;
  const overhang =
    lastIdentity === undefined || pinnedRight === null
      ? null
      : Math.round(lastIdentity.x + lastIdentity.width - pinnedRight);

  const report = {
    at: '1646x1097',
    ...measurement,
    derived: {
      // Read off the rendered boxes rather than restated from the source. The first version of this
      // block hard-coded `420` and `500` — the two literals whose disagreement it existed to expose
      // — so the moment the fix landed it would report the OLD numbers beside the NEW measurement,
      // in a file whose whole purpose is to be believed (ADR-0058: verify the claim, do not trust
      // the document; the document here was the harness).
      pinnedBlockWidth: measurement.pinnedBox?.width ?? null,
      identityColumnsRenderedTotal: identityCells.reduce(
        (sum: number, c: ColumnBox) => sum + c.width,
        0,
      ),
      lastIdentityCellOverhangPx: overhang,
      chartRegionPx:
        measurement.pinnedBox === null
          ? null
          : Math.round(measurement.viewport.width - measurement.pinnedBox.width),
    },
  };

  mkdirSync('measure-output', { recursive: true });
  writeFileSync('measure-output/gantt-grid-width.json', JSON.stringify(report, null, 2));
  // A harness is read at the terminal by the person who ran it; the JSON file is the record and this
  // is the reading. `warn`/`error` would be a lie about severity for a successful measurement.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
});
