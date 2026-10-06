import { execFileSync } from 'node:child_process';

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';

import {
  createClient,
  createProject,
  ensurePen,
  ganttGrid,
  ganttRow,
  onboard,
  openPlanId,
} from '../e2e-gantt/support';
import { writeMeasurement } from '../measure-toolbar/output';

/**
 * **The Gantt under a finger and a stylus, M0-T1 — measure the problem before building the remedy**
 * (`docs/specs/gantt-coarse-pointer/`, ADR-0113 / ADR-0142). The predictions this reads against were
 * committed first, in `m0-falsification.md`; the verdicts are written into `m0-measurement.md`.
 *
 * ## What this is, and is not
 *
 * A harness, **not a gate** — not a CI step, and nothing fails a build on its numbers. The only
 * assertions are the **pinned positives** (the instrument found what it was meant to measure: a
 * chevron, a movable bar, both edges, and `pointer: coarse` actually matching in the coarse context),
 * because a measurement that silently measured nothing reads as a clean pass (ADR-0110 D5).
 *
 * **It is emulation, not a Surface.** Gestures are CDP `Input.dispatchTouchEvent` in container
 * Chromium — the method `column-truncation.spec.ts` used for the divider. Whatever a real finger or
 * stylus does differently (palm rejection, the OS's own long-press, the Surface's `pointer: fine`
 * with the cover attached) is `INDETERMINATE` until the device answers (ADR-0128 D4); the
 * checklist for that is `docs/specs/gantt-coarse-pointer/device-checklist.md`.
 *
 * ## The fixture
 *
 * `plan:capability-types-and-wbs` (`docs/TEST_PLAYBOOK.md`), seeded through the public REST API by
 * the seeder CLI, as the playbook says to. It has the WBS summary `W1` (the disclosure chevron), two
 * movable tasks under it, milestones, and LOE.
 *
 * ## The two contexts, and the hybrid
 *
 * `fine` is an ordinary desktop context (`pointer: fine`); `coarse` is `hasTouch: true`, with
 * `matchMedia('(pointer: coarse)')` asserted before anything is read (ADR-0118 D3). Gestures run in
 * **both**, so the fine context's touch drag is the nearest emulation of ADR-0118 D7's hybrid — touch
 * input under `pointer: fine`. If the harness cannot deliver touch there, that gesture records
 * `INDETERMINATE — device only` rather than a guess.
 *
 * Each run is a fresh browser context per (viewport, pointer) and the whole thing is repeated
 * `MEASURE_RUNS` times (default 3); `spread` lists every reading that did not repeat.
 */

const VIEWPORTS = [
  { width: 1646, height: 1097 },
  { width: 1368, height: 912 },
] as const;
const POINTERS = ['fine', 'coarse'] as const;
type Pointer = (typeof POINTERS)[number];
const RUNS = Number(process.env.MEASURE_RUNS ?? 3);

const PLAN_NAME = /Types: milestones, LOE and WBS summaries/;
/** The movable task every drag uses, and the one it is "unselected" against. */
const TARGET = 'Task-dependent install';
const OTHER = 'Excavate';
/** A task whose bar starts well right of the chart's left edge, so the row menu is not over its start handle. */
const EDGE_TARGET = 'Pour';
/** A finish milestone, for the same reason: the start milestone sits under the row menu at the left edge. */
const MILESTONE = 'Foundations complete';

interface LimbError {
  error: string;
}
type Limb<T> = T | LimbError;

async function limb<T>(fn: () => Promise<T>): Promise<Limb<T>> {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message.split('\n')[0]! : String(e) };
  }
}

const round = (n: number): number => Math.round(n * 10) / 10;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function boxOf(locator: Locator): Promise<Box | null> {
  const box = await locator.boundingBox();
  return box === null
    ? null
    : { x: round(box.x), y: round(box.y), width: round(box.width), height: round(box.height) };
}

/**
 * Geometry of one element: its box, the element at its centre (and how that element relates to it),
 * its computed `touch-action`, and WCAG 2.2 §2.5.8's circle test — recorded, not judged.
 *
 * The circle test: a 24 px circle centred on the target's bounding-box centre must not intersect
 * another target's box. Neighbours are every control in the Gantt grid plus the toolbar's, so a
 * 12 px chevron beside a 12 px chevron is found; an under-24 target that passes is the spacing
 * exception, one that fails is a real §2.5.8 finding.
 */
async function geometry(locator: Locator): Promise<unknown> {
  const handle = await locator.elementHandle();
  if (handle === null) return null;
  return handle.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    const describe = (n: Element | null): string =>
      n === null
        ? 'null'
        : `${n.tagName.toLowerCase()}${n.getAttribute('role') ? `[role=${n.getAttribute('role')}]` : ''}${
            n.getAttribute('data-bar-edge') ? `[edge=${n.getAttribute('data-bar-edge')}]` : ''
          }`;
    const hitBy =
      hit === null
        ? 'none'
        : hit === el
          ? 'self'
          : el.contains(hit)
            ? `descendant ${describe(hit)}`
            : hit.contains(el)
              ? `ancestor ${describe(hit)}`
              : `OTHER ${describe(hit)}`;
    const targets = [
      ...document.querySelectorAll(
        '[role="treegrid"] button, [data-bar-edge], [role="separator"], [role="toolbar"] button, [role="treegrid"] span[style*="cursor"]',
      ),
    ].filter((n) => n !== el && !el.contains(n) && !n.contains(el));
    const intersects: string[] = [];
    for (const n of targets) {
      const b = n.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const nx = Math.max(b.left, Math.min(cx, b.right));
      const ny = Math.max(b.top, Math.min(cy, b.bottom));
      if (Math.hypot(cx - nx, cy - ny) < 12) intersects.push(describe(n));
    }
    return {
      box: {
        x: Math.round(r.x * 10) / 10,
        y: Math.round(r.y * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        height: Math.round(r.height * 10) / 10,
      },
      hitBy,
      touchAction: getComputedStyle(el).touchAction,
      pointerEvents: getComputedStyle(el).pointerEvents,
      circle24Clear: intersects.length === 0,
      circle24Intersects: [...new Set(intersects)].slice(0, 4),
    };
  });
}

interface ActivityRow {
  id: string;
  name: string;
  version: number;
  visualStart: string | null;
  durationDays: number;
}

async function readActivities(page: Page): Promise<ActivityRow[]> {
  const org = /\/orgs\/([^/]+)/.exec(page.url())?.[1];
  if (org === undefined) throw new Error(`no org in ${page.url()}`);
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ slug, id }: { slug: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${slug}/plans/${id}/activities?limit=100`,
        { credentials: 'include' },
      );
      if (!response.ok) throw new Error(`read: ${response.status}`);
      return ((await response.json()) as { data: ActivityRow[] }).data;
    },
    { slug: org, id: planId },
  );
}

/** A write is an activity whose version moved: the plan's own optimistic-lock counter. */
async function versions(page: Page): Promise<Record<string, number>> {
  return Object.fromEntries((await readActivities(page)).map((a) => [a.name, a.version]));
}

function changed(before: Record<string, number>, after: Record<string, number>): string[] {
  return Object.keys(after).filter((k) => before[k] !== after[k]);
}

async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  points: { x: number; y: number }[],
) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

async function touchDrag(
  page: Page,
  cdp: CDPSession,
  from: { x: number; y: number },
  dx: number,
  dy = 0,
): Promise<void> {
  await touch(cdp, 'touchStart', [from]);
  for (let step = 1; step <= 12; step += 1) {
    await touch(cdp, 'touchMove', [{ x: from.x + (dx * step) / 12, y: from.y + (dy * step) / 12 }]);
    await page.waitForTimeout(16);
  }
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(150);
}

const centre = (b: Box): { x: number; y: number } => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

/** The nearest scrollable ancestor of the grid's rows: what a finger pans when nothing claims it. */
async function scrollOffsets(page: Page): Promise<{ left: number; top: number }> {
  return page.evaluate(() => {
    const row = document.querySelector('[role="treegrid"] [data-activity-id]');
    for (let n: Element | null = row; n !== null; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (
        /(auto|scroll)/.test(s.overflowX + s.overflowY) &&
        (n.scrollWidth > n.clientWidth || n.scrollHeight > n.clientHeight)
      ) {
        return { left: Math.round(n.scrollLeft), top: Math.round(n.scrollTop) };
      }
    }
    return { left: -1, top: -1 };
  });
}

/** Record every pointer/touch event on the page until read, in order, with times from the first. */
async function recordEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __ev: { t: number; type: string; pt?: string }[];
      __t0: number;
      __evInstalled?: boolean;
    };
    w.__ev = [];
    w.__t0 = performance.now();
    // Installed once per page: re-adding the listeners per gesture multiplied every later tally.
    if (w.__evInstalled === true) return;
    w.__evInstalled = true;
    for (const type of [
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'contextmenu',
      'touchstart',
      'touchend',
      'touchcancel',
      'click',
      'dblclick',
      'selectstart',
    ]) {
      document.addEventListener(
        type,
        (e) =>
          w.__ev.push({
            t: Math.round(performance.now() - w.__t0),
            type,
            ...('pointerType' in e ? { pt: String((e as PointerEvent).pointerType) } : {}),
          }),
        { capture: true },
      );
    }
  });
}

async function readEvents(page: Page): Promise<{ tally: Record<string, number>; first: string[] }> {
  const ev = await page.evaluate(
    () => (window as unknown as { __ev: { t: number; type: string; pt?: string }[] }).__ev,
  );
  const tally: Record<string, number> = {};
  for (const e of ev) tally[e.type] = (tally[e.type] ?? 0) + 1;
  // moves are noise in a sequence; keep the order of everything else
  const first = ev
    .filter((e) => e.type !== 'pointermove')
    .slice(0, 14)
    .map((e) => `${e.type}${e.pt ? `(${e.pt})` : ''}@${e.t}`);
  return { tally, first };
}

interface Setup {
  origin: string;
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>;
}

async function openFresh(
  browser: Browser,
  setup: Setup,
  planPath: string,
  viewport: { width: number; height: number },
  pointer: Pointer,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: setup.storageState,
    viewport,
    ...(pointer === 'coarse' ? { hasTouch: true } : {}),
  });
  const page = await context.newPage();
  await page.goto(`${setup.origin}${planPath}?view=gantt`);
  await expect(ganttGrid(page)).toBeVisible();
  await expect(ganttRow(page, TARGET)).toBeVisible();
  await ensurePen(page);
  return { context, page };
}

async function matchMedias(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() => ({
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    pointerFine: matchMedia('(pointer: fine)').matches,
    anyPointerCoarse: matchMedia('(any-pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
  }));
}

/**
 * A clean page for one gesture: reload, take the pen, wait for the grid. Gestures write, a write
 * triggers a recalculation that re-renders the rows, and a gesture that begins while the previous
 * one's re-render is landing is cancelled for reasons that are the harness's, not the product's —
 * the first runs of this spec flipped a touch-none handle between "resizes" and "pointercancel"
 * on exactly that. A reload makes each reading independent of the one before it.
 */
async function fresh(page: Page): Promise<void> {
  await page.reload();
  await expect(ganttGrid(page)).toBeVisible();
  await expect(ganttRow(page, TARGET)).toBeVisible();
  await ensurePen(page);
  await page.waitForTimeout(600);
}

/** Select another row by mouse so `TARGET` is genuinely unselected, whatever ran before. */
async function deselect(page: Page): Promise<void> {
  await ganttRow(page, OTHER).getByRole('gridcell').first().click();
  await page.waitForTimeout(100);
}

/** Select `TARGET` by a touch tap on its name cell. */
async function selectTarget(page: Page, cdp: CDPSession, name = TARGET): Promise<void> {
  const cell = ganttRow(page, name).getByRole('gridcell').first();
  const b = await boxOf(cell);
  if (b === null) throw new Error('no name cell box');
  await touch(cdp, 'touchStart', [centre(b)]);
  await touch(cdp, 'touchEnd', []);
  await page.waitForTimeout(150);
  await expect(ganttRow(page, name)).toHaveAttribute('aria-selected', 'true');
}

interface GestureReading {
  wrote: string[];
  scrolled: { left: number; top: number };
  events: { tally: Record<string, number>; first: string[] };
  touchAction: string;
}

/** One touch drag, read four ways: did it write, did it scroll, what events arrived, touch-action. */
async function gesture(
  page: Page,
  cdp: CDPSession,
  target: Locator,
  dx: number,
  dy = 0,
): Promise<GestureReading> {
  const b = await boxOf(target);
  if (b === null) throw new Error('gesture target has no box');
  const touchAction = await target.evaluate((el) => getComputedStyle(el).touchAction);
  // Let the compositor's touch-action regions catch up with the last re-render: a touch that begins
  // within a frame or two of a layout change is hit-tested against the old regions, and the first
  // sets of this spec read that as a touch-none handle cancelling.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(700);
  const before = await versions(page);
  const scrollBefore = await scrollOffsets(page);
  await recordEvents(page);
  await touchDrag(page, cdp, centre(b), dx, dy);
  // A write is async (a PATCH after pointerup); give it time to land before reading.
  await page.waitForTimeout(1500);
  const events = await readEvents(page);
  const scrollAfter = await scrollOffsets(page);
  const after = await versions(page);
  return {
    wrote: changed(before, after),
    scrolled: {
      left: scrollAfter.left - scrollBefore.left,
      top: scrollAfter.top - scrollBefore.top,
    },
    events,
    touchAction,
  };
}

/** A drag that scrolls needs somewhere to scroll to: report that, or `scrolled: 0` reads as "claimed". */
async function scrollRoom(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const row = document.querySelector('[role="treegrid"] [data-activity-id]');
    for (let n: Element | null = row; n !== null; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (
        /(auto|scroll)/.test(s.overflowX + s.overflowY) &&
        (n.scrollWidth > n.clientWidth || n.scrollHeight > n.clientHeight)
      ) {
        return {
          scrollWidth: n.scrollWidth,
          clientWidth: n.clientWidth,
          scrollHeight: n.scrollHeight,
          clientHeight: n.clientHeight,
        };
      }
    }
    return null;
  });
}

async function geometryLimbs(page: Page, pointer: Pointer): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const target = ganttRow(page, TARGET);
  const edgeRow = ganttRow(page, EDGE_TARGET);
  const summary = ganttRow(page, 'Foundations');
  const milestone = ganttRow(page, MILESTONE);

  out.P1_bodyMovable = await limb(async () => {
    const bar = target.locator('span[style*="cursor: grab"]');
    return { ...((await geometry(bar)) as object), count: await bar.count() };
  });
  out.P2_P2b_edges = await limb(async () => ({
    // Shown for the UNSELECTED state (nothing has been tapped yet): the handles are rendered by
    // `barEdgeGate`, not by selection, which is the whole point of P2b.
    start: await geometry(edgeRow.locator('[data-bar-edge="start"]')),
    finish: await geometry(edgeRow.locator('[data-bar-edge="finish"]')),
    startCount: await edgeRow.locator('[data-bar-edge="start"]').count(),
    finishCount: await edgeRow.locator('[data-bar-edge="finish"]').count(),
    allEdges: await page.locator('[role="treegrid"] [data-bar-edge]').count(),
  }));
  out.P3_rowMenuTrigger = await limb(async () =>
    geometry(target.getByRole('button', { name: /^Actions for/ })),
  );
  // A bar that starts at the chart's left edge sits under the row menu trigger, which straddles the
  // pinned columns' right edge: what a pointer lands on at the centre of its start handle, and of a
  // start milestone, is the menu button. Found by the first exploratory run (a start edge and a
  // diamond both "hit by button"), then given its own limb so the figure is kept.
  out.P3b_overlapAtChartStart = await limb(async () => ({
    startEdge: await geometry(ganttRow(page, OTHER).locator('[data-bar-edge="start"]')),
    diamond: await geometry(ganttRow(page, 'Notice to proceed').locator('span.rotate-45')),
    trigger: await geometry(ganttRow(page, OTHER).getByRole('button', { name: /^Actions for/ })),
  }));
  out.P4_chevron = await limb(async () => {
    const chevron = summary.locator('button[aria-hidden="true"]').first();
    return { ...((await geometry(chevron)) as object), count: await chevron.count() };
  });
  out.P5_sortHeaders = await limb(async () => {
    const buttons = ganttGrid(page).getByRole('columnheader').getByRole('button');
    const n = await buttons.count();
    const all: unknown[] = [];
    for (let i = 0; i < n; i += 1) {
      const b = buttons.nth(i);
      all.push({
        label: ((await b.textContent()) ?? '').trim(),
        ...((await geometry(b)) as object),
      });
    }
    return { count: n, all };
  });
  out.P6_columnEdges = await limb(async () => {
    const edges = page.locator('[data-gantt-column-edge]');
    const count = await edges.count();
    const first = edges.first();
    return {
      count,
      displayed: count > 0 ? await first.evaluate((el) => getComputedStyle(el).display) : null,
      first: count > 0 ? await geometry(first) : null,
    };
  });
  out.P7_divider = await limb(async () =>
    geometry(page.getByRole('separator', { name: 'Grid width' })),
  );
  out.P14_milestoneDiamond = await limb(async () => {
    const diamond = milestone.locator('span.rotate-45');
    return { ...((await geometry(diamond)) as object), count: await diamond.count() };
  });
  out.P15_refusal = await limb(async () => {
    const bar = summary.locator('[role="gridcell"] span[style*="not-allowed"]');
    const n = await bar.count();
    if (n === 0) return { refusingBarFound: false };
    return {
      refusingBarFound: true,
      title: await bar.first().getAttribute('title'),
      ariaHidden: await bar.first().getAttribute('aria-hidden'),
      reasonVisibleAsText: false,
    };
  });

  // P10 — an open cell input, by the keyboard (a touch has only the double tap, which is P9).
  out.P10_cellInput = await limb(async () => {
    await ganttRow(page, TARGET).getByRole('gridcell').first().click();
    await page.keyboard.press('F2');
    const input = ganttRow(page, TARGET).locator('input').first();
    await input.waitFor({ state: 'visible', timeout: 3000 });
    const g = await geometry(input);
    await page.keyboard.press('Escape');
    return g;
  });

  // P11 / P13 — the row menu's items, and the object bar a selection raises.
  out.P11_rowMenuItems = await limb(async () => {
    await target.getByRole('button', { name: /^Actions for/ }).click();
    const items = page.getByRole('menuitem');
    await items.first().waitFor({ state: 'visible', timeout: 3000 });
    const n = await items.count();
    const heights: { label: string; width: number; height: number }[] = [];
    for (let i = 0; i < n; i += 1) {
      const b = await boxOf(items.nth(i));
      heights.push({
        label: ((await items.nth(i).textContent()) ?? '').trim().slice(0, 30),
        width: b?.width ?? 0,
        height: b?.height ?? 0,
      });
    }
    await page.keyboard.press('Escape');
    return { count: n, minHeight: Math.min(...heights.map((h) => h.height)), heights };
  });
  out.P13_objectBar = await limb(async () => {
    await ganttRow(page, TARGET).getByRole('gridcell').first().click();
    await page.waitForTimeout(200);
    return page.evaluate(() => {
      const bars = [...document.querySelectorAll('[role="toolbar"]')].map((tb) => {
        const buttons = [...tb.querySelectorAll('button')].filter(
          (b) => b.getBoundingClientRect().width > 0,
        );
        const sizes = buttons.map((b) => {
          const r = b.getBoundingClientRect();
          return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
        });
        return {
          label: tb.getAttribute('aria-label'),
          buttons: buttons.length,
          minHeight: sizes.length ? Math.min(...sizes.map((s) => s.h)) : null,
          minWidth: sizes.length ? Math.min(...sizes.map((s) => s.w)) : null,
        };
      });
      return bars;
    });
  });

  // P12 — `View`'s Columns group.
  out.P12_viewColumns = await limb(async () => {
    await page.getByRole('button', { name: /^View/ }).first().click();
    await page.waitForTimeout(300);
    const read = await page.evaluate(() => {
      const fields = [
        ...document.querySelectorAll('input[type="number"], input[inputmode="numeric"]'),
      ]
        .filter((i) => i.getBoundingClientRect().width > 0)
        .map((i) => {
          const r = i.getBoundingClientRect();
          return {
            label: i.getAttribute('aria-label') ?? '',
            width: Math.round(r.width * 10) / 10,
            height: Math.round(r.height * 10) / 10,
          };
        });
      const boxes = [...document.querySelectorAll('input[type="checkbox"]')]
        .filter((i) => i.getBoundingClientRect().width > 0)
        .map((i) => {
          const label = i.closest('label');
          const r = (label ?? i).getBoundingClientRect();
          const ir = i.getBoundingClientRect();
          return {
            label: (label?.textContent ?? i.getAttribute('aria-label') ?? '').trim().slice(0, 30),
            labelHeight: Math.round(r.height * 10) / 10,
            inputSize: `${Math.round(ir.width)}x${Math.round(ir.height)}`,
          };
        });
      return { fields, boxes };
    });
    await page.keyboard.press('Escape');
    return read;
  });

  out.pointer = pointer;
  return out;
}

async function gestureLimbs(
  page: Page,
  context: BrowserContext,
  pointer: Pointer,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const cdp = await context.newCDPSession(page);
  const target = ganttRow(page, TARGET);
  const bar = (): Locator => target.locator('span[style*="cursor: grab"]');
  const edge = (which: 'start' | 'finish'): Locator =>
    ganttRow(page, EDGE_TARGET).locator(`[data-bar-edge="${which}"]`);
  out.scrollRoom = await limb(() => scrollRoom(page));

  out.G1_bodyUnselected = await limb(async () => {
    await fresh(page);
    await deselect(page);
    return gesture(page, cdp, bar(), 60);
  });
  out.G1b_bodySelected = await limb(async () => {
    await fresh(page);
    await selectTarget(page, cdp);
    return gesture(page, cdp, bar(), 60);
  });
  out.G2_finishEdgeUnselected = await limb(async () => {
    await fresh(page);
    await deselect(page);
    return gesture(page, cdp, edge('finish'), 40);
  });
  out.G2_startEdgeUnselected = await limb(async () => {
    await fresh(page);
    await deselect(page);
    return gesture(page, cdp, edge('start'), 20);
  });
  out.G2_startEdgeUnselectedLeft = await limb(async () => {
    await fresh(page);
    await deselect(page);
    return gesture(page, cdp, edge('start'), -20);
  });
  // The same start-edge drag by MOUSE, as the control: a cancel that a mouse shares is not touch's.
  out.G2_startEdgeMouseControl = await limb(async () => {
    await fresh(page);
    await deselect(page);
    const handle = edge('start');
    const b = await boxOf(handle);
    if (b === null) throw new Error('no start handle box');
    const before = await versions(page);
    await recordEvents(page);
    await page.mouse.move(centre(b).x, centre(b).y);
    await page.mouse.down();
    await page.mouse.move(centre(b).x + 20, centre(b).y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    return { wrote: changed(before, await versions(page)), events: await readEvents(page) };
  });
  out.G2b_finishEdgeSelected = await limb(async () => {
    await fresh(page);
    await selectTarget(page, cdp, EDGE_TARGET);
    return gesture(page, cdp, edge('finish'), 40);
  });
  out.G2b_startEdgeSelected = await limb(async () => {
    await fresh(page);
    await selectTarget(page, cdp, EDGE_TARGET);
    return gesture(page, cdp, edge('start'), 20);
  });
  out.G7_dividerDrag = await limb(async () => {
    await fresh(page);
    const sep = page.getByRole('separator', { name: 'Grid width' });
    const before = Number(await sep.getAttribute('aria-valuenow'));
    const g = await gesture(page, cdp, sep, 40);
    const after = Number(await sep.getAttribute('aria-valuenow'));
    return { ...g, valueBefore: before, valueAfter: after, moved: before !== after };
  });
  out.G14_milestoneDrag = await limb(async () => {
    await fresh(page);
    const diamond = ganttRow(page, MILESTONE).locator('span.rotate-45');
    return gesture(page, cdp, diamond, 60);
  });
  out.G15_summaryBarDrag = await limb(async () => {
    await fresh(page);
    const summaryBar = ganttRow(page, 'Foundations')
      .locator('[role="gridcell"] span.absolute.h-3\\.5')
      .first();
    const live = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-live]')]
        .map((n) => (n.textContent ?? '').trim())
        .join('|'),
    );
    const g = await gesture(page, cdp, summaryBar, 60);
    const liveAfter = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-live]')]
        .map((n) => (n.textContent ?? '').trim())
        .join('|'),
    );
    return { ...g, liveBefore: live, liveAfter, announced: live !== liveAfter };
  });

  // P9 — a double tap on a writable cell.
  out.P9_doubleTap = await limb(async () => {
    await fresh(page);
    await deselect(page);
    const headers = ganttGrid(page).getByRole('columnheader');
    const n = await headers.count();
    let colindex: string | null = null;
    for (let i = 0; i < n; i += 1) {
      if (((await headers.nth(i).textContent()) ?? '').trim().startsWith('Duration')) {
        colindex = await headers.nth(i).getAttribute('aria-colindex');
      }
    }
    if (colindex === null) throw new Error('no Duration header');
    const cell = target.locator(`[role="gridcell"][aria-colindex="${colindex}"]`);
    const b = await boxOf(cell);
    if (b === null) throw new Error('no Duration cell box');
    await recordEvents(page);
    const c = centre(b);
    await touch(cdp, 'touchStart', [c]);
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(80);
    await touch(cdp, 'touchStart', [c]);
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(400);
    const opened = (await cell.locator('input').count()) > 0;
    const events = await readEvents(page);
    if (opened) await page.keyboard.press('Escape');
    return { inputOpened: opened, events };
  });

  // P8 — a hold. Releasing after 800 ms; a `contextmenu` that arrives at 600-ish is "on hold", one
  // that arrives at the release is "on release".
  out.P8_holdOnRow = await limb(async () => {
    await fresh(page);
    await deselect(page);
    const cell = target.getByRole('gridcell').nth(1);
    const b = await boxOf(cell);
    if (b === null) throw new Error('no cell box');
    await recordEvents(page);
    await touch(cdp, 'touchStart', [centre(b)]);
    await page.waitForTimeout(800);
    const menuWhileHeld = await page.getByRole('menu').count();
    const selectionWhileHeld = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(300);
    const events = await readEvents(page);
    const menuAfter = await page.getByRole('menu').count();
    const selectionAfter = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    if (menuAfter > 0) await page.keyboard.press('Escape');
    return {
      events,
      appMenuWhileHeld: menuWhileHeld,
      appMenuAfterRelease: menuAfter,
      selectedTextWhileHeld: selectionWhileHeld.slice(0, 40),
      selectedTextAfter: selectionAfter.slice(0, 40),
    };
  });

  out.pointer = pointer;
  return out;
}

/** P16: the diagram. A pixel scan finds a bar; the canvas is `touch-none`, so it should own the lot. */
async function canvasLimbs(page: Page, context: BrowserContext): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(1500);
  const cdp = await context.newCDPSession(page);
  const scene = await (async () => {
    const all = await page.locator('canvas').all();
    let best: Locator = all[0]!;
    let area = 0;
    for (const c of all) {
      const b = await boxOf(c);
      // The scene is the canvas that takes pointer events; the sibling overlay layers do not.
      const takesPointer = await c.evaluate((el) => getComputedStyle(el).pointerEvents !== 'none');
      if (takesPointer && b !== null && b.width * b.height >= area) {
        area = b.width * b.height;
        best = c;
      }
    }
    return best;
  })();
  out.canvases = await limb(() =>
    page.evaluate(() =>
      [...document.querySelectorAll('canvas')].map((c) => {
        const r = c.getBoundingClientRect();
        return {
          cls: c.className.slice(0, 60),
          testid: c.getAttribute('data-testid'),
          w: Math.round(r.width),
          h: Math.round(r.height),
          touchAction: getComputedStyle(c).touchAction,
        };
      }),
    ),
  );
  out.touchAction = await limb(() => scene.evaluate((el) => getComputedStyle(el).touchAction));
  const bar = await limb(async () =>
    scene.evaluate((el) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext('2d');
      if (ctx === null) return null;
      const r = c.getBoundingClientRect();
      const sx = c.width / r.width;
      const sy = c.height / r.height;
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const px = (x: number, y: number): string => {
        const i = (y * c.width + x) * 4;
        return `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`;
      };
      // A bar is a run of one opaque colour at least 8 CSS px tall and 30 wide, narrower than the
      // canvas (a full-width run is a band, not a bar). Several columns are tried because a plan's
      // bars do not all cross the middle.
      let best: { y: number; h: number; x: number; w: number } | null = null;
      for (const fraction of [0.5, 0.3, 0.7, 0.2, 0.4, 0.6, 0.8, 0.1, 0.9]) {
        const x0 = Math.floor(c.width * fraction);
        for (let y = 0; y < c.height; y += 1) {
          const colour = px(x0, y);
          if (colour.endsWith(',0') || colour.endsWith(',255') === false) continue;
          let h = 0;
          while (y + h < c.height && px(x0, y + h) === colour) h += 1;
          if (h / sy >= 8 && h / sy <= 30) {
            let l = x0;
            let rgt = x0;
            while (l > 0 && px(l - 1, y + Math.floor(h / 2)) === colour) l -= 1;
            while (rgt < c.width - 1 && px(rgt + 1, y + Math.floor(h / 2)) === colour) rgt += 1;
            const w = (rgt - l) / sx;
            if (w >= 30 && w < r.width * 0.9 && (best === null || rgt - l > best.w)) {
              best = { y: y + h / 2, h, x: (l + rgt) / 2, w: rgt - l };
            }
          }
          y += Math.max(h - 1, 0);
        }
      }
      return best === null
        ? null
        : { x: r.left + best.x / sx, y: r.top + best.y / sy, widthPx: best.w / sx };
    }),
  );
  out.barFound = bar;
  if (bar === null || 'error' in (bar as object)) {
    out.note = 'INDETERMINATE: no bar located by the pixel scan';
    return out;
  }
  const at = bar as { x: number; y: number };
  const canvasGesture = async (fn: () => Promise<void>): Promise<unknown> => {
    const before = await versions(page);
    await recordEvents(page);
    await fn();
    await page.waitForTimeout(900);
    return {
      wrote: changed(before, await versions(page)),
      events: await readEvents(page),
      menuOpen: await page.getByRole('menu').count(),
    };
  };
  out.C1_dragUnselected = await limb(() => canvasGesture(() => touchDrag(page, cdp, at, 60)));
  out.C1b_tapThenDrag = await limb(() =>
    canvasGesture(async () => {
      await touch(cdp, 'touchStart', [at]);
      await touch(cdp, 'touchEnd', []);
      await page.waitForTimeout(200);
      await touchDrag(page, cdp, at, 60);
    }),
  );
  out.C2_hold = await limb(() =>
    canvasGesture(async () => {
      await touch(cdp, 'touchStart', [at]);
      await page.waitForTimeout(800);
      await touch(cdp, 'touchEnd', []);
    }),
  );
  // The control: the same drag by mouse. A touch drag that wrote nothing is only a finding if a
  // mouse drag at the same point DOES write — otherwise the scan found something that is not a bar.
  out.C0_mouseControl = await limb(async () => {
    const before = await versions(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x + 60, at.y, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
    return { wrote: changed(before, await versions(page)) };
  });
  return out;
}

/**
 * Per gesture, across the runs of one (viewport, pointer): how many wrote, how many ended in
 * `pointercancel` (the browser claimed the gesture), how many ended in `pointerup`, and how many
 * scrolled. This is the figure the verdicts are read from; `spread` says only that something moved.
 */
interface Tally {
  runs: number;
  wrote: number;
  pointercancel: number;
  pointerup: number;
  scrolled: number;
  inputOpened: number;
  moved: number;
  errors: number;
}

function talliesOf(runs: unknown[]): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const run of runs) {
    for (const section of ['gestures', 'canvas'] as const) {
      const group = (run as Record<string, Record<string, unknown>>)[section] ?? {};
      for (const [name, reading] of Object.entries(group)) {
        const r = reading as {
          wrote?: string[];
          events?: { tally?: Record<string, number> };
          scrolled?: { left: number; top: number };
          inputOpened?: boolean;
          moved?: boolean;
          error?: string;
        } | null;
        if (
          r === null ||
          typeof r !== 'object' ||
          (r.wrote === undefined && r.inputOpened === undefined && r.events === undefined)
        )
          continue;
        const t: Tally = (out[`${section}.${name}`] ??= {
          runs: 0,
          wrote: 0,
          pointercancel: 0,
          pointerup: 0,
          scrolled: 0,
          inputOpened: 0,
          moved: 0,
          errors: 0,
        });
        t.runs += 1;
        if (r.error !== undefined) t.errors += 1;
        if ((r.wrote?.length ?? 0) > 0) t.wrote += 1;
        if ((r.events?.tally?.pointercancel ?? 0) > 0) t.pointercancel += 1;
        if ((r.events?.tally?.pointerup ?? 0) > 0) t.pointerup += 1;
        if (r.scrolled !== undefined && (r.scrolled.left !== 0 || r.scrolled.top !== 0))
          t.scrolled += 1;
        if (r.inputOpened === true) t.inputOpened += 1;
        if (r.moved === true) t.moved += 1;
      }
    }
  }
  return out;
}

/** Spread: every dotted path whose value differed between runs. */
function spreadOf(runs: unknown[]): string[] {
  const flat = (v: unknown, prefix: string, into: Map<string, string>): void => {
    if (v !== null && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        // Timings inside event sequences are noise by construction; compare the shape, not the ms.
        if (k === 'first') continue;
        flat(val, prefix === '' ? k : `${prefix}.${k}`, into);
      }
    } else into.set(prefix, JSON.stringify(v));
  };
  const maps = runs.map((r) => {
    const m = new Map<string, string>();
    flat(r, '', m);
    return m;
  });
  const keys = new Set(maps.flatMap((m) => [...m.keys()]));
  return [...keys].filter((k) => new Set(maps.map((m) => m.get(k))).size > 1);
}

/**
 * Seed `plan:capability-types-and-wbs` into the project the page has open, through the public REST API
 * (ADR-0066: the seeder gets no privileged path), open it, take the pen, recalculate, and release the
 * pen so the measuring context can take it cleanly. Returns the plan's path.
 */
async function provision(page: Page, stamp: number, orgSlug: string): Promise<string> {
  const projectId = /projects\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (projectId === undefined) throw new Error(`no project id in ${page.url()}`);
  // **The seeder's exit code is not read.** Its closing recalculation is refused 423 for want of the
  // pen (a FINDING it reports and exits non-zero on, correctly: it is a client like any other), after
  // every activity and link has landed. The harness recalculates itself, holding the pen, below.
  try {
    execFileSync(
      'pnpm',
      [
        '--filter',
        '@repo/seed-cli',
        'seed',
        '--url',
        'http://localhost:3000',
        '--org',
        orgSlug,
        '--project',
        projectId,
        '--email',
        `gantt-${String(stamp)}@example.com`,
        '--password',
        'correct-horse-battery',
        '--tier',
        'capability',
        '--family',
        'types',
      ],
      { stdio: 'ignore', cwd: '../..' },
    );
  } catch {
    // see above
  }
  await page.reload();
  await page.getByRole('link', { name: PLAN_NAME }).first().click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);
  await ensurePen(page);
  const recalc = await page.evaluate(
    async ({ slug, id }: { slug: string; id: string }) =>
      (
        await fetch(`/api/v1/organizations/${slug}/plans/${id}/schedule/recalculate`, {
          method: 'POST',
          credentials: 'include',
        })
      ).status,
    { slug: orgSlug, id: openPlanId(page) },
  );
  expect(recalc, 'recalculating the seeded plan').toBeLessThan(300);
  const stop = page.getByRole('button', { name: 'Stop editing' });
  if (await stop.isVisible().catch(() => false)) await stop.click();
  return new URL(page.url()).pathname;
}

test('M0-T1 — Gantt target sizes and touch behaviour, fine and coarse', async ({
  browser,
  page,
}) => {
  test.setTimeout(60 * 60 * 1000);
  await page.setViewportSize({ width: 1646, height: 1097 });

  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createClient(page, 'Northgate');

  // **A fresh plan for every run.** The gestures write: an edge drag moves a bar, and a second run
  // on the same plan found the bar pushed out of the viewport, so its handle was off screen and the
  // "reading" was of nothing. The first three-run set had exactly that, and read as a flaky browser.
  const planPaths: string[] = [];
  const total = VIEWPORTS.length * POINTERS.length * RUNS;
  for (let n = 0; n < total; n += 1) {
    if (n > 0) {
      await page.getByRole('link', { name: 'Clients', exact: true }).click();
      await page.getByRole('link', { name: 'Northgate' }).click();
    }
    await createProject(page, `Riverside ${String(n)}`);
    planPaths.push(await provision(page, stamp, orgSlug));
  }

  const setup: Setup = {
    origin: new URL(page.url()).origin,
    storageState: await page.context().storageState(),
  };
  await page.close();

  let planIndex = 0;
  const results: Record<string, unknown[]> = {};
  for (const viewport of VIEWPORTS) {
    for (const pointer of POINTERS) {
      const key = `${String(viewport.width)}-${pointer}`;
      results[key] = [];
      for (let run = 0; run < RUNS; run += 1) {
        const { context, page: p } = await openFresh(
          browser,
          setup,
          planPaths[planIndex++]!,
          viewport,
          pointer,
        );
        try {
          const media = await matchMedias(p);
          if (pointer === 'coarse') {
            // ADR-0118 D3: an instrument measuring the wrong pointer measures nothing.
            expect(media.pointerCoarse, 'the coarse context must match (pointer: coarse)').toBe(
              true,
            );
          } else {
            expect(media.pointerFine, 'the fine context must match (pointer: fine)').toBe(true);
          }
          const geom = await geometryLimbs(p, pointer);
          // The geometry limbs open menus and select; start the gestures from a clean page.
          await p.reload();
          await expect(ganttRow(p, TARGET)).toBeVisible();
          await ensurePen(p);
          const gestures = await gestureLimbs(p, context, pointer);
          let canvas: Record<string, unknown> = {};
          if (viewport.width === 1646) {
            await p.reload();
            await expect(ganttRow(p, TARGET)).toBeVisible();
            await ensurePen(p);
            canvas = (await limb(() => canvasLimbs(p, context))) as Record<string, unknown>;
          }
          results[key].push({ media, geometry: geom, gestures, canvas });
        } finally {
          await context.close();
        }
      }
    }
  }

  // Pinned positives: the instrument found the things it exists to measure.
  const first = results['1646-coarse']?.[0] as {
    geometry: Record<string, { count?: number; startCount?: number; finishCount?: number }>;
  };
  expect(first.geometry.P4_chevron?.count ?? 0, 'at least one disclosure chevron').toBeGreaterThan(
    0,
  );
  expect(first.geometry.P1_bodyMovable?.count ?? 0, 'at least one movable bar').toBeGreaterThan(0);
  expect(first.geometry.P2_P2b_edges?.startCount ?? 0, 'a start edge handle').toBeGreaterThan(0);
  expect(first.geometry.P2_P2b_edges?.finishCount ?? 0, 'a finish edge handle').toBeGreaterThan(0);

  const spread: Record<string, string[]> = {};
  const tallies: Record<string, unknown> = {};
  for (const [key, runs] of Object.entries(results)) {
    spread[key] = spreadOf(runs);
    tallies[key] = talliesOf(runs);
  }

  const path = writeMeasurement('gantt-coarse-targets', {
    runs: RUNS,
    fixture: 'plan:capability-types-and-wbs',
    note: 'CDP touch in container Chromium: emulation, not a Surface. See m0-falsification.md.',
    tallies,
    spread,
    results,
  });
  // The harness is read at the terminal by whoever ran it; the JSON is the record.
  // eslint-disable-next-line no-console
  console.log(`wrote ${path}`);
});
