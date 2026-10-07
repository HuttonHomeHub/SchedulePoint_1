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

async function touchPlan(page: Page, pointer: 'coarse' | 'fine' = 'coarse'): Promise<string> {
  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedActivities(page, orgSlug, 3);
  await recalculate(page);
  await showGantt(page);
  const matches = await page.evaluate(
    (kind) => window.matchMedia(`(pointer: ${kind})`).matches,
    pointer,
  );
  expect(matches, `the context must report a ${pointer} pointer`).toBe(true);
  // The arithmetic below assumes a Monday start, five working days, so a drop two columns right is
  // two working days and two columns left of the Friday finish is a Wednesday. Read, not assumed.
  const first = await seeded(page, orgSlug, 'Seeded 0');
  expect(new Date(`${first.earlyStart}T00:00:00Z`).getUTCDay(), 'the plan starts on a Monday').toBe(
    1,
  );
  expect(first.durationDays).toBe(5);
  return orgSlug;
}

const plusDays = (iso: string, days: number): string =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

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

  // Two columns and a quarter: the browser rounds a touch point to a whole pixel, and the drop day
  // is the column the point lands in, so landing exactly on a boundary is landing a day short half
  // the time. The quarter keeps the drop inside the intended column.
  await touchDrag(page, cdp, grab, pxPerDay * 2.25);

  // At the API: the bar moving proves the ghost, not the write. EXACTLY two days, from a Monday, so
  // a drag that lands a column either side (or on the weekend roll) cannot pass as "moved".
  await expect
    .poll(async () => (await seeded(page, orgSlug, 'Seeded 0')).visualEffectiveStart, {
      timeout: 20_000,
    })
    .toBe(plusDays(before.visualEffectiveStart!, 2));
});

test('a finger resizes the selected bar from its finish edge', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const before = await seeded(page, orgSlug, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);
  const pxPerDay = await pxPerDayOf(page, before);

  const grab = await grabPoint(barOf(page, before.id));
  await page.touchscreen.tap(grab.x, grab.y);
  await expect(page.locator(`[data-activity-id="${before.id}"]`)).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // The handle is `touch-none` only now that the bar is selected. A Friday finish pulled two
  // columns left is a Wednesday: three working days, counted as the diagram counts them.
  const handle = await edgeOf(page, before.id, 'finish').boundingBox();
  if (handle === null) throw new Error('the finish handle has no box');
  await touchDrag(page, cdp, centreOf(handle), pxPerDay * -2);

  await expect
    .poll(async () => (await seeded(page, orgSlug, 'Seeded 0')).durationDays, { timeout: 20_000 })
    .toBe(before.durationDays - 2);
});

test('a finger on an unselected bar scrolls and writes nothing', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const before = await seeded(page, orgSlug, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);

  // The browser claiming the gesture as a pan shows up as `pointercancel` on the handle. The Gantt's
  // zoom buttons are disabled and the chart is framed to the window, so this fixture has nothing to
  // overflow (M0 found the same, and a narrower window or a wider grid pane did not change it); the
  // cancel is what a scroll looks like from the page, and a handle that took the drag would end in
  // `pointerup` instead.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __ptr: string[] }).__ptr = seen;
    for (const type of ['pointerup', 'pointercancel']) {
      window.addEventListener(type, () => seen.push(type), true);
    }
  });
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
  const ended = await page.evaluate(() => (window as unknown as { __ptr: string[] }).__ptr);
  expect(ended, 'the browser took the gesture as a pan').toEqual(['pointercancel']);
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

/** Put a CDP touch down at `at` and, if asked, drag it `moveBy` px. The finger stays down. */
async function holdTouch(
  page: Page,
  cdp: CDPSession,
  at: { x: number; y: number },
  moveBy: number,
): Promise<{ x: number; y: number }> {
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
  return { x: at.x + moveBy, y: at.y };
}

/** Send the `contextmenu` the OS would send for a hold, at the finger's position. */
async function fireContextMenu(page: Page, point: { x: number; y: number }): Promise<void> {
  await page.evaluate(({ x, y }) => {
    document.elementFromPoint(x, y)?.dispatchEvent(
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
  // Recorded at the window, after React's own listener has run: a handler that was never reached
  // would leave the menu hidden too, so "no menu" alone cannot tell the two apart.
  await page.evaluate(() => {
    const seen: { shift: boolean; prevented: boolean }[] = [];
    (window as unknown as { __cm: typeof seen }).__cm = seen;
    window.addEventListener('contextmenu', (event) =>
      seen.push({ shift: event.shiftKey, prevented: event.defaultPrevented }),
    );
  });
  await ganttRow(page, 'Seeded 0').click({
    button: 'right',
    modifiers: ['Shift'],
    position: { x: 120, y: 10 },
  });
  await expect(menuOf(page, 'Seeded 0')).toBeHidden();
  const seen = await page.evaluate(
    () => (window as unknown as { __cm: { shift: boolean; prevented: boolean }[] }).__cm,
  );
  expect(seen, 'the event arrived, with Shift held, and nothing took it from the browser').toEqual([
    { shift: true, prevented: false },
  ]);
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

  const point = await holdTouch(page, cdp, grab, 0);
  // The drag the press began is LIVE before the event arrives (its ghost, opacity 0.75). Without
  // this the assertion after it would pass whether or not anything was ever cancelled.
  await expect(barOf(page, before.id)).toHaveCSS('opacity', '0.75');
  await fireContextMenu(page, point);

  await expect(menuOf(page, 'Seeded 0')).toBeVisible();
  await expect(barOf(page, before.id)).not.toHaveCSS('opacity', '0.75');
  await release(page, cdp);
  await page.waitForTimeout(1_500);
  expect((await seeded(page, orgSlug, 'Seeded 0')).version).toBe(before.version);
});

test('a hold on an unselected row opens the menu and does not select it', async ({ page }) => {
  test.setTimeout(180_000);
  const orgSlug = await touchPlan(page);
  const other = await seeded(page, orgSlug, 'Seeded 1');
  const cdp = await page.context().newCDPSession(page);
  const grab = await grabPoint(barOf(page, other.id));
  const row = page.locator(`[data-activity-id="${other.id}"]`);
  await expect(row).not.toHaveAttribute('aria-selected', 'true');

  const point = await holdTouch(page, cdp, grab, 0);
  await fireContextMenu(page, point);
  await expect(menuOf(page, 'Seeded 1')).toBeVisible();
  await release(page, cdp);

  // The lift ends in a `click`, which would select the row it landed on. The row swallows that one.
  await expect(row).not.toHaveAttribute('aria-selected', 'true');
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

  const point = await holdTouch(page, cdp, grab, pxPerDay * 2);
  await fireContextMenu(page, point);

  await expect(menuOf(page, 'Seeded 0')).toBeHidden();
  await release(page, cdp);
  // And the drag was not abandoned: it still lands.
  await expect
    .poll(async () => (await seeded(page, orgSlug, 'Seeded 0')).visualEffectiveStart, {
      timeout: 20_000,
    })
    .not.toBe(before.visualEffectiveStart);
});

/**
 * **A hold on the table half reaches the row menu** (M2-T5, `docs/TECH_DEBT.md` #464).
 *
 * The chart half delivers `contextmenu` on a hold; the table half has text under the finger, and a
 * hold on selectable text is a selection gesture. The remedy is one attribute at the grid root
 * (`data-last-input`, written in `pointerdown` capture) and a `select-none` variant on the row's whole table half.
 *
 * **What this proves, and what it does not.** That the CSS is applied while a touch is down, and that
 * the menu opens on a synthesised event. It cannot prove Windows suppresses its selection, or that
 * #464 is fixed: CDP does not synthesise the OS long-press. Device item 12 is the arbiter.
 *
 * Pen is covered by the unit suite only: CDP cannot emit a stylus pointer type.
 */
// Inside the name cell: the chart half labels its bar with the same words.
const nameText = (page: Page, name: string) =>
  ganttRow(page, name)
    .getByRole('gridcell', { name: new RegExp(`^${name}\\b`) })
    .getByText(name, { exact: true });

async function centreOfLocator(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('the cell text has no box');
  return centreOf(box);
}

test('a touch held on the table text makes it unselectable (red against the parent)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await touchPlan(page);
  const text = nameText(page, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);
  const at = await centreOfLocator(text);

  // Held, so a tap cannot open the editor and the press is still the live gesture.
  await holdTouch(page, cdp, at, 0);
  try {
    await expect.poll(() => text.evaluate((el) => getComputedStyle(el).userSelect)).toBe('none');
    // The red-at-parent assertion for the blank-space hold (device check 12b): the gridcell div
    // itself, not a span inside it. The class sat on the spans only, so the div stayed `auto`.
    const cell = ganttRow(page, 'Seeded 0').getByRole('gridcell', { name: /^Seeded 0\b/ });
    await expect.poll(() => cell.evaluate((el) => getComputedStyle(el).userSelect)).toBe('none');
    await expect(page.getByTestId('gantt-scroll')).toHaveAttribute('data-last-input', 'touch');
  } finally {
    await release(page, cdp);
  }
});

test('characterisation: a contextmenu on a table-half span opens the menu and is cancelled', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await touchPlan(page);
  const text = nameText(page, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);
  const at = await centreOfLocator(text);

  // This passes at the parent too: it pins the handler path the chart half already takes, so a
  // later change to either half cannot silently separate them. It is not the #464 assertion.
  await holdTouch(page, cdp, at, 0);
  const cancelled = await page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    if (target === null) throw new Error('nothing at the finger');
    return !target.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 2,
      }),
    );
  }, at);
  expect(cancelled, 'SchedulePoint cancelled the browser menu').toBe(true);
  await expect(menuOf(page, 'Seeded 0')).toBeVisible();
  await release(page, cdp);
});

test('the first mouse press after a touch can still select cell text (guards select-none)', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await touchPlan(page);
  const text = nameText(page, 'Seeded 0');
  const cdp = await page.context().newCDPSession(page);
  const at = await centreOfLocator(text);

  await holdTouch(page, cdp, at, 0);
  await release(page, cdp);
  await expect(page.getByTestId('gantt-scroll')).toHaveAttribute('data-last-input', 'touch');

  // The attribute flips in `pointerdown` capture, before the `mousedown` whose default action
  // starts a selection, so this very first press selects. Fails only against an unconditional
  // `select-none`; "no selection after a touch hold" is not asserted, because M0 P8 saw none at the
  // parent and it could not fail.
  const box = await text.boundingBox();
  if (box === null) throw new Error('the cell text has no box');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 1, y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('gantt-scroll')).toHaveAttribute('data-last-input', 'mouse');
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).not.toBe('');
});

test.describe('in a context that reports a fine pointer', () => {
  test.use({ hasTouch: false });

  test('a touch held on the table text still makes it unselectable', async ({ page }) => {
    test.setTimeout(180_000);
    // The cover-attached Surface reports `pointer: fine` and still sends a finger: the remedy is
    // keyed on the input event, so a `pointer-coarse:` variant would pass the coarse case above and
    // fail here.
    await touchPlan(page, 'fine');
    const text = nameText(page, 'Seeded 0');
    const cdp = await page.context().newCDPSession(page);
    const at = await centreOfLocator(text);

    await holdTouch(page, cdp, at, 0);
    try {
      await expect.poll(() => text.evaluate((el) => getComputedStyle(el).userSelect)).toBe('none');
    } finally {
      await release(page, cdp);
    }
  });
});
