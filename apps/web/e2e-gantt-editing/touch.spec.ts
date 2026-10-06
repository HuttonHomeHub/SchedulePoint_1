import AxeBuilder from '@axe-core/playwright';
import { type CDPSession, type Locator, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttRow,
  onboard,
  openPlanId,
  seedActivities,
  showGantt,
  startEditing,
} from '../e2e-gantt/support';
import { expect, test } from '../e2e-support/test';
import { recalculate } from '../e2e-support/toolbar';

/**
 * **The Gantt under a finger** (`docs/specs/gantt-coarse-pointer/`, M1; ADR-0177).
 *
 * Driven with CDP `Input.dispatchTouchEvent`, the method the M0 harness used, in a `hasTouch`
 * context whose `pointer: coarse` match is asserted before anything else — a journey that quietly
 * ran with a mouse would prove the existing path and call it the new one (ADR-0118 D3).
 *
 * **This is emulation, not a Surface.** CDP does not synthesise the OS long-press or palm
 * rejection, so the device confirmation (M1-T3) remains the arbiter for anything that turns on
 * them.
 *
 * `touch-action` is read by the browser at `pointerdown`, so every case taps, waits for
 * `aria-selected`, and only then drags.
 */

test.use({ hasTouch: true });
test.describe.configure({ mode: 'serial' });

interface ActivityRow {
  id: string;
  name: string;
  version: number;
  durationDays: number;
  earlyStart: string | null;
  earlyFinish: string | null;
  visualStart: string | null;
  visualEffectiveStart: string | null;
}

async function readActivities(page: Page, orgSlug: string): Promise<ActivityRow[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error(`read: ${response.status} ${await response.text()}`);
      return ((await response.json()) as { data: ActivityRow[] }).data;
    },
    { org: orgSlug, id: planId },
  );
}

async function seeded(page: Page, orgSlug: string, name: string): Promise<ActivityRow> {
  const row = (await readActivities(page, orgSlug)).find((r) => r.name === name);
  if (row === undefined) throw new Error(`no activity named ${name}`);
  return row;
}

async function touchPlan(page: Page): Promise<string> {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await recalculate(page);
  await showGantt(page);
  const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
  expect(coarse, 'the context must report a coarse pointer').toBe(true);
  return orgSlug;
}

const barOf = (page: Page, activityId: string) =>
  page.locator(`[data-activity-id="${activityId}"] span[style*="cursor: grab"]`);
const edgeOf = (page: Page, activityId: string, edge: 'start' | 'finish') =>
  page.locator(`[data-activity-id="${activityId}"] [data-bar-edge="${edge}"]`);

async function touchDrag(
  page: Page,
  cdp: CDPSession,
  from: { x: number; y: number },
  dx: number,
): Promise<void> {
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: { x: number; y: number }[],
  ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await send('touchStart', [from]);
  for (let step = 1; step <= 12; step += 1) {
    await send('touchMove', [{ x: from.x + (dx * step) / 12, y: from.y }]);
    await page.waitForTimeout(16);
  }
  await send('touchEnd', []);
  await page.waitForTimeout(150);
}

const centreOf = (b: { x: number; y: number; width: number; height: number }) => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

/**
 * A point on the bar itself that nothing else covers. The row menu's `⋯` overflows into the first
 * 28 px of the chart, so a bar that starts at the chart's left edge — every bar in these plans —
 * has its geometric centre under it when the bar is short (M0, "Collisions"; not this milestone's
 * to fix). Scans outward from the bar's centre for the first pixel whose hit target is the bar itself, so a
 * grab never lands on an edge handle either.
 */
async function grabPoint(bar: Locator): Promise<{ x: number; y: number }> {
  const point = await bar.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const y = box.top + box.height / 2;
    const centre = box.left + box.width / 2;
    for (let offset = 0; offset < box.width / 2; offset += 1) {
      for (const x of [centre - offset, centre + offset]) {
        // Three pixels clear on each side: a boundary pixel can hit the neighbour once a touch
        // point is rounded.
        if ([-3, 0, 3].every((d) => document.elementFromPoint(x + d, y) === element)) {
          return { x, y };
        }
      }
    }
    return null;
  });
  if (point === null) throw new Error('no part of the bar is reachable');
  return point;
}

/** Pixels per day column, read off the bar the plan drew rather than assumed. */
async function pxPerDayOf(page: Page, row: ActivityRow): Promise<number> {
  const bar = await barOf(page, row.id).boundingBox();
  if (bar === null || row.earlyStart === null || row.earlyFinish === null) {
    throw new Error('the bar or its dates are missing');
  }
  const columns = (Date.parse(row.earlyFinish) - Date.parse(row.earlyStart)) / 86_400_000 + 1;
  return bar.width / columns;
}

test('a finger moves a bar once it is selected', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const before = await seeded(page, orgSlug, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);

  const grab = await grabPoint(barOf(page, before.id));
  const pxPerDay = await pxPerDayOf(page, before);

  await page.touchscreen.tap(grab.x, grab.y);
  await expect(page.locator(`[data-activity-id="${before.id}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await touchDrag(page, cdp, grab, pxPerDay * 2);

  // At the API: the bar moving proves the ghost, not the write.
  await expect
    .poll(async () => (await seeded(page, orgSlug, 'Seeded 0')).visualEffectiveStart, {
      timeout: 20_000,
    })
    .not.toBe(before.visualEffectiveStart);
});

test('a finger on an unselected bar scrolls and writes nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const before = await seeded(page, orgSlug, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);
  const pxPerDay = await pxPerDayOf(page, before);

  // The END of an unselected bar: before this milestone its handle was `touch-none` whatever the
  // selection, so a finger resized the bar instead of scrolling (M0 P2b, 11 of 12 runs).
  const handle = await edgeOf(page, before.id, 'finish').boundingBox();
  if (handle === null) throw new Error('the finish handle has no box');
  await expect(page.locator(`[data-activity-id="${before.id}"]`)).not.toHaveAttribute(
    'aria-selected',
    'true',
  );
  // Leftwards: the plan starts on a Monday, so two columns right of the Friday finish is a weekend
  // and a working-day count would write nothing even from a handle that does take the drag.
  await touchDrag(page, cdp, centreOf(handle), pxPerDay * -2);

  // A write would have landed well inside this; the version is the plan's own optimistic lock.
  await page.waitForTimeout(2_000);
  const after = await seeded(page, orgSlug, 'Seeded 0');
  expect(after.version).toBe(before.version);
  expect(after.durationDays).toBe(before.durationDays);
});

test('a selected bar that cannot move says why, where a finger can read it', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const target = await seeded(page, orgSlug, 'Seeded 0');

  // Without the pen the bar is refused for a reason a planner can act on. It lived only in a
  // `title` on an `aria-hidden` span, which a finger can neither hover nor a screen reader reach.
  await page.getByRole('button', { name: 'Stop editing', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start editing', exact: true })).toBeVisible();

  const bar = page.locator(`[data-activity-id="${target.id}"] span[title]`).first();
  const reason = await bar.getAttribute('title');
  expect(reason, 'the refused bar carries its reason').toMatch(/Start editing/);

  const grab = await grabPoint(bar);
  await page.touchscreen.tap(grab.x, grab.y);
  await expect(page.locator(`[data-activity-id="${target.id}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('status').filter({ hasText: reason ?? '' })).toBeVisible();
});

/**
 * **A row's actions by hold or right-click** (M1-T2, ADR-0177 D3).
 *
 * **What emulation can and cannot say.** CDP does not synthesise the OS long-press, so a touch hold
 * here produces NO `contextmenu` (M0 P8). The right-click case drives the real mouse event; the
 * two hold cases hold a real CDP touch on the bar and then dispatch the `contextmenu` the OS would
 * send, at the finger's position. What they prove is this application's response to that event —
 * cancel the live drag, open the menu, change nothing — not that Windows sends it, which is the
 * device confirmation's question (M1-T3).
 */
const menuOf = (page: Page, name: string) =>
  page.getByRole('menu', { name: `Actions for ${name}` });

async function holdAndContextMenu(
  page: Page,
  cdp: CDPSession,
  at: { x: number; y: number },
  moveBy: number,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  await page.waitForTimeout(120);
  if (moveBy !== 0) {
    for (let step = 1; step <= 6; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: at.x + (moveBy * step) / 6, y: at.y }],
      });
      await page.waitForTimeout(16);
    }
  }
  const point = { x: at.x + moveBy, y: at.y };
  await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    target?.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 2,
      }),
    );
  }, point);
  await page.waitForTimeout(100);
}

async function release(page: Page, cdp: CDPSession): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
}

test('right-clicking a row opens its actions, and Escape hands focus back to the row', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const target = await seeded(page, orgSlug, 'Seeded 0');
  const row = page.locator(`[data-activity-id="${target.id}"]`);

  await ganttRow(page, 'Seeded 0').click({ button: 'right', position: { x: 120, y: 10 } });

  const menu = menuOf(page, 'Seeded 0');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Indent' })).toBeVisible();
  // The right-click is not a selection: the `⋯` does not select either, and the two are one path.
  await expect(row).not.toHaveAttribute('aria-selected', 'true');

  const results = await new AxeBuilder({ page })
    .options({
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
      },
      rules: { 'target-size': { enabled: true } },
    })
    .include('[role="menu"]')
    .analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(row).toBeFocused();
});

test('Shift+right-click keeps the browser menu', async ({ page }) => {
  test.setTimeout(180_000);
  await touchPlan(page);
  await ganttRow(page, 'Seeded 0').click({
    button: 'right',
    modifiers: ['Shift'],
    position: { x: 120, y: 10 },
  });
  await expect(menuOf(page, 'Seeded 0')).toBeHidden();
});

test('holding the selected bar still opens the menu and abandons the drag', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const before = await seeded(page, orgSlug, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);
  const grab = await grabPoint(barOf(page, before.id));

  await page.touchscreen.tap(grab.x, grab.y);
  const row = page.locator(`[data-activity-id="${before.id}"]`);
  await expect(row).toHaveAttribute('aria-selected', 'true');

  await holdAndContextMenu(page, cdp, grab, 0);

  await expect(menuOf(page, 'Seeded 0')).toBeVisible();
  // The drag the press began is gone, finger still down: a live one draws its ghost (opacity 0.75).
  await expect(barOf(page, before.id)).not.toHaveCSS('opacity', '0.75');
  await release(page, cdp);
  // The hold did not change the selection, and the release that followed wrote nothing.
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await page.waitForTimeout(1_500);
  expect((await seeded(page, orgSlug, 'Seeded 0')).version).toBe(before.version);
});

test('dragging the selected bar opens no menu', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const before = await seeded(page, orgSlug, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);
  const grab = await grabPoint(barOf(page, before.id));
  const pxPerDay = await pxPerDayOf(page, before);

  await page.touchscreen.tap(grab.x, grab.y);
  await expect(page.locator(`[data-activity-id="${before.id}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await holdAndContextMenu(page, cdp, grab, pxPerDay * 2);

  await expect(menuOf(page, 'Seeded 0')).toBeHidden();
  await release(page, cdp);
  // And the drag was not abandoned: it still lands.
  await expect
    .poll(async () => (await seeded(page, orgSlug, 'Seeded 0')).visualEffectiveStart, {
      timeout: 20_000,
    })
    .not.toBe(before.visualEffectiveStart);
});
