import type { Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import { CODES_PLAN, SWIMLANES_PLAN, openSeededPlan } from './support';

/**
 * **Does the activities table scroll sideways, and does its Name column stay in view when it does?**
 * (`docs/specs/baseline-slip-and-pinned-names/`, M3: the check written before the fix.)
 *
 * It lives in `e2e-swimlanes`, not beside `activities-panel-scroll.spec.ts` as the plan first said,
 * because the widest table needs a catalogue plan and this is the suite that seeds one (the plan's
 * "code columns and swimlanes" are two plans here: `plan:capability-codes` has the code columns,
 * `plan:capability-swimlanes` the Swimlane column).
 *
 * **Machine-independent by construction.** Nothing here is a pixel figure: overflow is
 * `scrollWidth > clientWidth` on the region, the pin is "the Name cell lies inside the region's box
 * and a pointer at its centre reaches it", and the Name column's share is a ratio.
 *
 * **Two tests, because they answer two questions.** The first records whether the table overflows at
 * 1024, 1280 and 1440 wide (growing, never shrinking: a shrink leaves Chromium's hit-testing stale)
 * and fails on nothing; it prints annotations. The second is the case M4 must turn green, and it
 * asserts overflow first with a message that names the stop rule, so a table that does not scroll
 * sideways is told apart from a table that scrolls and loses its Name.
 *
 * **Red recipe** (the recording the plan asks for): run this file against a tree without
 * `pinnedColumn` on the activities table. Expect the second test to fail on the Name-cell
 * assertion, with the cell outside the region's box after scrolling to the far right.
 */

test.describe.configure({ mode: 'serial' });

const STAMP = Date.now() + 1300;

/** Show the Activities panel (folded by default) with its rows. */
async function expandActivities(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(expand.or(collapse).first()).toBeVisible();
  if (await expand.isVisible()) await expand.click();
  await expect(collapse).toBeVisible();
  await expect(page.getByRole('region', { name: 'Activities', exact: true })).toBeVisible();
}

interface RegionReading {
  scrollWidth: number;
  clientWidth: number;
  nameShare: number;
}

async function readRegion(page: Page): Promise<RegionReading> {
  return page.getByRole('region', { name: 'Activities', exact: true }).evaluate((region) => {
    const heads = Array.from(region.querySelectorAll('thead th'));
    const name = heads.find((th) => th.textContent?.trim() === 'Name');
    const nameWidth = name ? name.getBoundingClientRect().width : 0;
    return {
      scrollWidth: region.scrollWidth,
      clientWidth: region.clientWidth,
      nameShare: nameWidth / region.clientWidth,
    };
  });
}

test.describe('the activities table, scrolled sideways', () => {
  test.use({ viewport: { width: 1024, height: 600 } });

  test('records whether it overflows at 1024, 1280 and 1440 wide, on the widest plans', async ({
    page,
  }, testInfo) => {
    await openSeededPlan(page, STAMP, CODES_PLAN);
    await expandActivities(page);

    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const reading = await readRegion(page);
      testInfo.annotations.push({
        type: `codes plan, ${String(width)} wide`,
        description: `overflows sideways: ${String(reading.scrollWidth > reading.clientWidth)}; Name column is ${reading.nameShare.toFixed(2)} of the region's width`,
      });
    }
  });

  test('the Name column stays inside the region after scrolling to the far right at 1024', async ({
    page,
  }, testInfo) => {
    await openSeededPlan(page, STAMP + 1, SWIMLANES_PLAN);
    await expandActivities(page);

    const region = page.getByRole('region', { name: 'Activities', exact: true });
    const before = await readRegion(page);
    testInfo.annotations.push({
      type: 'swimlanes plan, 1024 wide',
      description: `Name column is ${before.nameShare.toFixed(2)} of the region's width`,
    });
    expect(
      before.scrollWidth,
      'STOP RULE (M3): the activities table does not scroll sideways at 1024 wide, so there is nothing to pin',
    ).toBeGreaterThan(before.clientWidth);

    await region.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));

    const verdict = await region.evaluate((el) => {
      const heads = Array.from(el.querySelectorAll('thead th'));
      const index = heads.findIndex((th) => th.textContent?.trim() === 'Name');
      if (index < 0) return { rendered: 0, misplaced: ['no Name column'] };
      const box = el.getBoundingClientRect();
      const rows = Array.from(el.querySelectorAll('tbody tr[data-index]'));
      const misplaced: string[] = [];
      let judged = 0;
      for (const row of rows) {
        const cell = row.children[index];
        if (!cell) continue;
        const r = cell.getBoundingClientRect();
        // Only a row whose whole band is on screen is judged: a rendered row scrolled out BELOW the
        // region (overscan, or a short panel at 1024 x 600) is out of view for a vertical reason,
        // which says nothing about the pin. Sideways containment is what the pin owns.
        if (r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) continue;
        judged += 1;
        const inside = r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const reachable = hit !== null && cell.contains(hit);
        if (!inside || !reachable) {
          misplaced.push(
            `${row.getAttribute('data-index') ?? '?'}: ${inside ? 'inside' : 'outside'}, ${reachable ? 'reachable' : 'unreachable'}`,
          );
        }
      }
      return { rendered: judged, misplaced };
    });

    expect(verdict.rendered, 'rows are on screen to check').toBeGreaterThan(0);
    expect(
      verdict.misplaced,
      'every rendered Name cell is inside the region and reachable at the far right',
    ).toEqual([]);
  });
});

/** Both cases below read the Name cell's box and the document's width in the open table. */
async function pinReadings(page: Page): Promise<{ position: string; pageOverflows: boolean }> {
  const region = page.getByRole('region', { name: 'Activities', exact: true });
  const position = await region.evaluate((el) => {
    const heads = Array.from(el.querySelectorAll('thead th'));
    const index = heads.findIndex((th) => th.textContent?.trim() === 'Name');
    const cell = el.querySelector('tbody tr[data-index]')?.children[index];
    return cell ? getComputedStyle(cell).position : 'no cell';
  });
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  return { position, pageOverflows };
}

test.describe('the pinned Name column: what else holds while it is pinned (M4)', () => {
  test.use({ viewport: { width: 1024, height: 600 } });

  test('Tab lands right of the pin, the Name header is on top at the corner, the page does not scroll', async ({
    page,
  }) => {
    await openSeededPlan(page, STAMP + 2, SWIMLANES_PLAN);
    await expandActivities(page);
    const region = page.getByRole('region', { name: 'Activities', exact: true });
    await region.evaluate((el) => el.scrollTo({ left: 0, top: 0 }));

    // The Actions menu button is the last column's control, so focusing it scrolls the region
    // sideways; `scroll-padding-inline-start` is what keeps it out from under the pinned Name cell.
    // Scoped to the region: the Project Explorer's tree rows carry "Actions for …" buttons too, and
    // the first on the page is Northgate's.
    const actions = region.getByRole('button', { name: /^Actions for /u }).first();
    await actions.focus();
    const geometry = await region.evaluate((el) => {
      const heads = Array.from(el.querySelectorAll('thead th'));
      const index = heads.findIndex((th) => th.textContent?.trim() === 'Name');
      const nameCell = el.querySelector('tbody tr[data-index]')?.children[index];
      const focused = document.activeElement;
      if (!nameCell || !focused) return null;
      const box = el.getBoundingClientRect();
      const pin = nameCell.getBoundingClientRect();
      const f = focused.getBoundingClientRect();
      return {
        insideRegion: f.left >= box.left - 0.5 && f.right <= box.right + 0.5,
        rightOfPin: f.left >= pin.right - 0.5,
      };
    });
    expect(geometry, 'a Name cell and a focused control exist').not.toBeNull();
    expect(geometry?.insideRegion, 'the focused Actions button is inside the region').toBe(true);
    expect(
      geometry?.rightOfPin,
      'the focused Actions button is right of the pinned Name cell',
    ).toBe(true);

    // Scrolled both ways, the Name header is what a pointer reaches at its own centre.
    await region.evaluate((el) => el.scrollTo({ left: el.scrollWidth, top: el.scrollHeight }));
    const header = page.getByRole('columnheader', { name: 'Name' });
    const box = await header.boundingBox();
    if (!box) throw new Error('the Name header has no box');
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('th')?.textContent?.trim() === 'Name',
      { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) },
    );
    expect(onTop, 'the Name header is on top at the corner after scrolling both ways').toBe(true);

    expect((await pinReadings(page)).pageOverflows, 'no sideways page scroll at 1024').toBe(false);
  });

  test('forced colours keep the pinned cell opaque and its right border', async ({ page }) => {
    await openSeededPlan(page, STAMP + 3, SWIMLANES_PLAN);
    await page.emulateMedia({ forcedColors: 'active' });
    await expandActivities(page);
    const region = page.getByRole('region', { name: 'Activities', exact: true });
    await region.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    const style = await region.evaluate((el) => {
      const heads = Array.from(el.querySelectorAll('thead th'));
      const index = heads.findIndex((th) => th.textContent?.trim() === 'Name');
      const cell = el.querySelector('tbody tr[data-index]')?.children[index];
      if (!cell) return null;
      const computed = getComputedStyle(cell);
      return {
        background: computed.backgroundColor,
        borderRightStyle: computed.borderRightStyle,
        borderRightWidth: computed.borderRightWidth,
      };
    });
    expect(style, 'a Name cell exists').not.toBeNull();
    expect(style?.background, 'the pinned cell is not transparent').not.toBe('rgba(0, 0, 0, 0)');
    expect(style?.borderRightStyle).not.toBe('none');
    expect(style?.borderRightWidth).not.toBe('0px');
  });
});

test.describe('below 1024 the Name column is not pinned (reflow, ADR-0179)', () => {
  test.use({ viewport: { width: 1024, height: 700 }, acknowledgeViewportNotice: true });

  test('the Name cell is not sticky and the page does not scroll sideways at 1000', async ({
    page,
  }) => {
    // Seed and open at 1024: the shell's links are not all reachable below the floor. Only reading
    // computed style and the document's width follows the shrink, so Chromium's stale hit-testing
    // after a shrink (`zero-duration.spec.ts`) cannot matter here.
    await openSeededPlan(page, STAMP + 4, SWIMLANES_PLAN);
    await expandActivities(page);
    await page.setViewportSize({ width: 1000, height: 700 });
    const { position, pageOverflows } = await pinReadings(page);
    expect(position, 'the Name cell at 1000 wide').not.toBe('sticky');
    expect(pageOverflows, 'no sideways page scroll at 1000').toBe(false);
  });
});
