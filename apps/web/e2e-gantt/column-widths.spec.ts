import AxeBuilder from '@axe-core/playwright';
import { type CDPSession, type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';
import { unfoldViewSections } from '../e2e-support/toolbar';

import {
  chartMeetsGrid,
  createClient,
  createPlan,
  createProject,
  ganttGrid,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  startEditing,
  syncClient,
} from './support';

/**
 * **Typed Gantt column widths** (ADR-0173 M1, `docs/specs/gantt-column-resize/`).
 *
 * A planner sets a column's width in `View ▾` → Columns, it applies to the real grid, survives a
 * reload, and `Reset widths` puts it back. This drives the capability a unit suite can only assert
 * against a mock: the seam between the toolbar's popover and the panel the host mounts — which is
 * where the ADR-0081 class of defect (a capability with no working entry point) hides.
 *
 * The fields are located by **accessible name**, never by their position or copy of the layout, and
 * widths are read off the rendered header boxes rather than restated: the grid is what a planner
 * sees, so it is what is asserted.
 *
 * **M2 adds the drag** (`aria-hidden` edges on the headers, pointer only), with the typed field as
 * its stated equivalent, and a coarse-pointer case asserting the edges are not rendered at all.
 *
 * Serial; Chromium only (TECH_DEBT #25a). One org per test.
 */

const STORAGE_KEY = 'schedulepoint:gantt-column-widths';

/** A plan with a few activities, opened in the Gantt at the product owner's real width. */
async function ganttPlan(page: Page): Promise<string> {
  // 1646 CSS px is the product owner's Surface Pro, and the width ADR-0091's retrospective found two
  // epics had never used while reasoning about 1920 and 1440.
  await page.setViewportSize({ width: 1646, height: 1097 });
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await showGantt(page);
  return orgSlug;
}

const header = (page: Page, name: string) =>
  ganttGrid(page).getByRole('columnheader', { name, exact: false }).first();

async function headerWidth(page: Page, name: string): Promise<number> {
  const box = await header(page, name).boundingBox();
  if (box === null) throw new Error(`no box for the ${name} header`);
  return Math.round(box.width);
}

async function openView(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  // Columns starts folded (toolbar-redesign M2-T3).
  await unfoldViewSections(page);
}

const field = (page: Page, name: string) => page.getByRole('spinbutton', { name });

test('a typed column width applies, survives a reload, and resets', async ({ page }) => {
  test.setTimeout(240_000);
  await ganttPlan(page);

  await expect.poll(() => headerWidth(page, 'Code')).toBe(80);
  await chartMeetsGrid(page, 'at standard widths');

  await openView(page);
  await expect(field(page, 'Code width')).toHaveValue('80');
  // The standard state says so: nothing to reset yet, and the reason is shown.
  await expect(page.getByRole('button', { name: 'Reset widths' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // The Table width twin shows the divider's own number.
  const separator = page.getByRole('separator', { name: 'Grid width' });
  const tableWidth = await separator.getAttribute('aria-valuenow');
  await expect(field(page, 'Table width')).toHaveValue(tableWidth ?? '');

  // +60 px: Activity (180, floor 120) can give all of it, so the pane — and the chart's left edge —
  // stays where the planner put it.
  await field(page, 'Code width').fill('140');
  await page.keyboard.press('Enter');

  await expect.poll(() => headerWidth(page, 'Code')).toBe(140);
  await expect(separator).toHaveAttribute('aria-valuenow', tableWidth ?? '');
  await chartMeetsGrid(page, 'after widening Code within what Activity can give');
  await expect(page.getByRole('button', { name: 'Reset widths' })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );

  // Out of range is clamped, never refused.
  await field(page, 'Code width').fill('20');
  await page.keyboard.press('Enter');
  await expect(field(page, 'Code width')).toHaveValue('48');
  await expect.poll(() => headerWidth(page, 'Code')).toBe(48);

  // +80 px: Activity can give only 60 before its 120 px floor, so the table pushes the other 20 into
  // the chart — the floor wins (spec §2.4). The pane grows by exactly the overflow, the divider's
  // minimum rises to match, and the pinned columns still end where the chart begins.
  await field(page, 'Code width').fill('160');
  await page.keyboard.press('Enter');
  await expect.poll(() => headerWidth(page, 'Code')).toBe(160);
  const pushed = Number(tableWidth) + 20;
  await expect(separator).toHaveAttribute('aria-valuenow', String(pushed));
  await expect(separator).toHaveAttribute('aria-valuemin', String(pushed));
  await chartMeetsGrid(page, 'after widening Code past what Activity can give');

  // axe over the open Columns group — the spinbuttons, their labels and the hint.
  const results = await new AxeBuilder({ page })
    .include('fieldset')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');

  // Remembered on this device: a real reload, not a re-render.
  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect.poll(() => headerWidth(page, 'Code')).toBe(160);
  await chartMeetsGrid(page, 'after a reload');

  await openView(page);
  await expect(field(page, 'Code width')).toHaveValue('160');
  await page.getByRole('button', { name: 'Reset widths' }).click();
  await expect.poll(() => headerWidth(page, 'Code')).toBe(80);
  await expect(field(page, 'Code width')).toHaveValue('80');
  await chartMeetsGrid(page, 'after Reset widths');
  // Reset DELETES the stored preference rather than writing today's defaults into the browser, so a
  // future change to a default still reaches this planner.
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect(page.getByRole('button', { name: 'Reset widths' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('the same sequence works with the keyboard alone', async ({ page }) => {
  test.setTimeout(240_000);
  await ganttPlan(page);

  // No mouse: the View trigger is reached and opened by key.
  await page.getByRole('button', { name: 'View', exact: true }).focus();
  await page.keyboard.press('Enter');
  // Columns starts folded (toolbar-redesign M2-T3), and it is opened by key too: a disclosure
  // button is focusable and Enter toggles it (APG), so no pointer is needed anywhere in this case.
  await page
    .getByRole('dialog', { name: /^View/ })
    .getByRole('button', { name: 'Columns' })
    .focus();
  await page.keyboard.press('Enter');

  await field(page, 'Code width').focus();
  // ArrowUp is the field's own step (16 px, the divider's step) and it APPLIES — it must not move
  // toolbar focus, which is the ADR-0111 #192 class this surface was reviewed for.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(field(page, 'Code width')).toBeFocused();
  await expect(field(page, 'Code width')).toHaveValue('112');
  await expect.poll(() => headerWidth(page, 'Code')).toBe(112);
  await chartMeetsGrid(page, 'after stepping Code');

  // Reset by key: focus the shaded-when-standard button and press Enter.
  await page.getByRole('button', { name: 'Reset widths' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => headerWidth(page, 'Code')).toBe(80);
});

test('a typed width the chart guard limits is limited aloud, never silently', async ({ page }) => {
  test.setTimeout(240_000);
  await ganttPlan(page);
  // A window too narrow to take the whole of 300 px without crowding the chart: the table may not
  // grow past its pane, so Activity absorbs what it can and the guard limits the rest. The guard
  // reads the scroller's width at the moment of typing, so resizing after the plan is open is enough.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(ganttGrid(page)).toBeVisible();

  await openView(page);
  await field(page, 'Code width').fill('300');
  await page.keyboard.press('Enter');

  const status = page.getByRole('status').filter({ hasText: /Code width limited to/ });
  await expect(status).toHaveText(
    /Code width limited to \d+ px so the chart keeps at least 240 px\./,
  );
  // The field and the grid agree with what the message says, and neither shows the 300 typed.
  const shown = Number(await field(page, 'Code width').inputValue());
  expect(shown).toBeLessThan(300);
  expect(shown).toBeGreaterThanOrEqual(48);
  await expect.poll(() => headerWidth(page, 'Code')).toBe(shown);
  await expect(field(page, 'Code width')).not.toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Escape');
  await chartMeetsGrid(page, 'after a limited width');
});

test('a hidden column has no width field, and returns at the width it was given', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await ganttPlan(page);

  await openView(page);
  // Predecessors is hidden by default, so it has nothing to size.
  await expect(field(page, 'Predecessors width')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Predecessors' }).click();
  await expect(field(page, 'Predecessors width')).toHaveValue('90');
  await field(page, 'Predecessors width').fill('200');
  await page.keyboard.press('Enter');
  await expect.poll(() => headerWidth(page, 'Predecessors')).toBe(200);

  await page.getByRole('checkbox', { name: 'Predecessors' }).click();
  await expect(field(page, 'Predecessors width')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Predecessors' }).click();
  await expect(field(page, 'Predecessors width')).toHaveValue('200');
  await chartMeetsGrid(page, 'with Predecessors at 200');
});

test('the pinned columns still end where the chart begins at every width, with a baseline', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const orgSlug = await ganttPlan(page);

  // A baseline adds the `vs baseline` column to the pinned block — the state the floor-wins ceiling
  // exists for (ADR-0095's Float incident was this arithmetic missing that column).
  const planId = openPlanId(page);
  const captured = await page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/baselines`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Widths check' }),
      });
      return { ok: response.ok, status: response.status, body: await response.text() };
    },
    { org: orgSlug, id: planId },
  );
  expect(captured.ok, `capturing a baseline failed: ${captured.status} ${captured.body}`).toBe(
    true,
  );
  await syncClient(page);
  await showGantt(page);
  await expect(
    ganttGrid(page).getByRole('columnheader', { name: 'vs baseline' }),
    'no variance column — the baseline did not reach the grid, so nothing below is being tested',
  ).toBeVisible();
  await chartMeetsGrid(page, 'with a baseline, at standard widths');

  // **All at the maximum**, written straight to storage: typing is chart-guarded (a width that would
  // leave the chart under 240 px is clamped), so this is the state a planner reaches by widening
  // columns and then narrowing the window, or on another monitor — which the guard deliberately does
  // not undo (nothing is shrunk automatically). Six columns at 400 need far more than the old 720
  // ceiling, so a pane clamped to 720 would put the columns over the chart.
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        widths: { code: 400, duration: 400, earlyStart: 400, earlyFinish: 400, totalFloat: 400 },
      }),
    );
  }, STORAGE_KEY);
  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect.poll(() => headerWidth(page, 'Code')).toBe(400);
  await chartMeetsGrid(page, 'with a baseline, every column at the maximum');

  const separator = page.getByRole('separator', { name: 'Grid width' });
  // The floor wins: the ceiling is never below the floor, however wide the columns are.
  const min = Number(await separator.getAttribute('aria-valuemin'));
  const max = Number(await separator.getAttribute('aria-valuemax'));
  expect(max).toBeGreaterThanOrEqual(min);

  await separator.focus();
  await page.keyboard.press('Home');
  await chartMeetsGrid(page, 'with a baseline, every column at the maximum, at the floor');

  await openView(page);
  await page.getByRole('button', { name: 'Reset widths' }).click();
  await expect.poll(() => headerWidth(page, 'Code')).toBe(80);
  await chartMeetsGrid(page, 'with a baseline, after Reset widths');
});

/** The Code header's right edge, as a point a mouse can press: the strip is centred on it. */
async function codeEdge(page: Page): Promise<{ x: number; y: number }> {
  const box = await header(page, 'Code').boundingBox();
  if (box === null) throw new Error('no box for the Code header');
  return { x: box.x + box.width, y: box.y + box.height / 2 };
}

test('dragging a column edge widens it, Activity gives way, and it is remembered', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await ganttPlan(page);
  await expect.poll(() => headerWidth(page, 'Code')).toBe(80);
  const separator = page.getByRole('separator', { name: 'Grid width' });
  const tableWidth = await separator.getAttribute('aria-valuenow');
  const activityBefore = await headerWidth(page, 'Activity');
  const sortBefore = await header(page, 'Code').getAttribute('aria-sort');
  const chartLeft = (await header(page, 'Timeline').boundingBox())?.x;

  // The strip is a 24 × 24-or-larger target, measured directly: it is `aria-hidden` and has no role,
  // so the deck sweep's selector never sees it.
  const strip = ganttGrid(page).locator('[data-gantt-column-edge]').first();
  const stripBox = await strip.boundingBox();
  expect(stripBox?.width).toBeGreaterThanOrEqual(24);
  expect(stripBox?.height).toBeGreaterThanOrEqual(24);

  const edge = await codeEdge(page);
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 30, edge.y, { steps: 6 });
  await page.mouse.move(edge.x + 60, edge.y, { steps: 6 });
  await page.mouse.up();

  await expect.poll(() => headerWidth(page, 'Code')).toBe(140);
  // Activity gave up exactly what Code took, and the divider the planner placed did not move.
  await expect.poll(() => headerWidth(page, 'Activity')).toBe(activityBefore - 60);
  await expect(separator).toHaveAttribute('aria-valuenow', tableWidth ?? '');
  expect((await header(page, 'Timeline').boundingBox())?.x).toBe(chartLeft);
  await chartMeetsGrid(page, 'after dragging the Code edge');
  // A drag is not a click on the sort control beside it.
  await expect(header(page, 'Code')).toHaveAttribute('aria-sort', sortBefore ?? 'none');

  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect.poll(() => headerWidth(page, 'Code')).toBe(140);

  const again = await codeEdge(page);
  await page.mouse.dblclick(again.x, again.y);
  await expect.poll(() => headerWidth(page, 'Code')).toBe(80);
  await chartMeetsGrid(page, 'after a double-click reset');

  // Activity's edge is the table width: the Grid width divider follows it.
  const activity = await header(page, 'Activity').boundingBox();
  if (activity === null) throw new Error('no box for the Activity header');
  const ay = activity.y + activity.height / 2;
  await page.mouse.move(activity.x + activity.width, ay);
  await page.mouse.down();
  await page.mouse.move(activity.x + activity.width + 40, ay, { steps: 8 });
  await page.mouse.up();
  await expect(separator).toHaveAttribute('aria-valuenow', String(Number(tableWidth) + 40));
  await chartMeetsGrid(page, 'after dragging the Activity edge');
});

test('under a coarse pointer there are no edges, and the typed field is a 44 px target', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // `hasTouch` must be given to the context that builds THIS page, never via `test.use()`
  // (`e2e-workspace-fit/command-surface.spec.ts`'s coarse fixture records why).
  const page = await browser.newPage({ viewport: { width: 1646, height: 1097 }, hasTouch: true });
  try {
    await ganttPlan(page);
    const pointer = await page.evaluate(() =>
      window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
    );
    expect(
      pointer,
      'this context did not report a coarse pointer — the case is about nothing',
    ).toBe('coarse');

    // Present in the DOM, but not rendered: `pointer-coarse:hidden` (ADR-0173 D3).
    const strips = ganttGrid(page).locator('[data-gantt-column-edge]');
    expect(await strips.count()).toBeGreaterThan(0);
    for (const strip of await strips.all()) await expect(strip).toBeHidden();

    await openView(page);
    const box = await field(page, 'Code width').boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  } finally {
    await page.close();
  }
});

test('a finger drag of the Grid width divider follows the finger to the end', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // A context of its own with `hasTouch` (see the coarse case above), driven with CDP touch events
  // because `touch-action` is only consulted for a real touch gesture (TECH_DEBT #439).
  const page = await browser.newPage({ viewport: { width: 1646, height: 1097 }, hasTouch: true });
  try {
    await ganttPlan(page);
    const pointer = await page.evaluate(() =>
      window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
    );
    expect(
      pointer,
      'this context did not report a coarse pointer — a mouse drag proves nothing',
    ).toBe('coarse');

    const separator = page.getByRole('separator', { name: 'Grid width' });
    await expect(separator).toHaveCSS('touch-action', 'none');

    // Events are counted on the separator itself, where the drag's handlers live.
    await separator.evaluate((el) => {
      const seen = { move: 0, cancel: 0 };
      (window as unknown as { __divider: typeof seen }).__divider = seen;
      el.addEventListener('pointermove', () => (seen.move += 1));
      el.addEventListener('pointercancel', () => (seen.cancel += 1));
    });

    const box = await separator.boundingBox();
    if (box === null) throw new Error('no box for the Grid width divider');
    const start = Number(await separator.getAttribute('aria-valuenow'));
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const cdp: CDPSession = await page.context().newCDPSession(page);
    const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', x?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: x === undefined ? [] : [{ x, y: from.y }],
      });

    // 24 moves of 4 px: far past the three the browser allowed before it took the gesture over.
    await send('touchStart', from.x);
    for (let step = 1; step <= 24; step += 1) {
      await send('touchMove', from.x + step * 4);
      await page.waitForTimeout(16);
    }
    await send('touchEnd');

    const seen = await page.evaluate(
      () => (window as unknown as { __divider: { move: number; cancel: number } }).__divider,
    );
    expect(seen.cancel, 'the browser took the gesture over').toBe(0);
    expect(seen.move).toBeGreaterThanOrEqual(20);
    // The width kept following the finger: 96 px travelled, minus the chart guard's room, so assert
    // well past the 16 px a cancelled drag managed (m0-measurement: 584 to 598).
    await expect
      .poll(async () => Number(await separator.getAttribute('aria-valuenow')) - start)
      .toBeGreaterThanOrEqual(80);
    await chartMeetsGrid(page, 'after a finger drag of the Grid width divider');
  } finally {
    await page.close();
  }
});
