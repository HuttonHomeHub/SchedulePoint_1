import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { type BrowserContext, type Locator, type Page } from '@playwright/test';

import {
  canvas,
  createHierarchy,
  diagramList,
  newPlan,
  onboard,
  releasePen,
  seedActivities,
  selectedActivityId,
} from '../e2e-copy-paste/support';
import { expect, test } from '../e2e-support/test';
import { ensurePen } from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';
import { LANE_HEIGHT } from '../src/features/tsld/render/geometry';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Diagram keys and selection, M5** (`docs/specs/diagram-keys-and-selection/m5-measurement.md`):
 * what do the two selection bars cost a short window, and why does the clicked bar move?
 *
 * **Read-only, and it asserts nothing about a pixel.** Nothing under `apps/web/src` changes. Every
 * figure goes to `measure-output/diagram-keys-m5.json` and a screenshot per state and size; the
 * record reads them. A harness, not a gate (ADR-0081 section 3): no CI step, no new config.
 *
 * Four sizes (1024 x 600, 1280 x 720, 1366 x 768, 1440 x 900) by four states: (a) one bar selected
 * with the pen, (b) without it, (c) as a Contributor, (d) three bars with the pen. Text size is the
 * browser's default and the pointer is fine; the 200 % and coarse-pointer sweeps in spec 4.8 are not
 * taken here (stated in the record).
 *
 * **How the jump is read.** The scene is pixels, so the only oracle for "where is this bar" is the
 * hit test: a click that lands on it selects it. The bar's place BEFORE selection is the first
 * bar's hit range plus a whole number of lanes (`LANE_HEIGHT`), validated by clicking there; its
 * place AFTER is found by sweeping a column down the shrunken canvas. The same reading carries the
 * canvas box and `<main>`'s scroll position on both sides, which is what separates the three
 * hypotheses (H1 canvas shrinks under a fixed point, H2 a reveal pans the bar, H3 `<main>` scrolls).
 */

const SIZES = [
  { w: 1024, h: 600 },
  { w: 1280, h: 720 },
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
] as const;

const OUT_DIR = join(process.cwd(), 'measure-output', 'diagram-keys-m5');

type Reading = Record<string, unknown>;
const readings: Record<string, Reading> = {};

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[diagram-keys m5 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

const round = (n: number): number => Math.round(n * 10) / 10;

/** Everything the dock, the canvas and the page say about the vertical budget, in one read. */
async function geometry(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const r = (n: number): number => Math.round(n * 10) / 10;
    const box = (el: Element | null): Record<string, number> | null => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: r(b.top), left: r(b.left), width: r(b.width), height: r(b.height) };
    };
    const section = document.querySelector('section[aria-label="Time-scaled logic diagram"]');
    const scene = section?.querySelector('canvas[data-layer="scene"]') ?? null;
    const foot = document.querySelector('[data-activities-bar]');
    const main = document.querySelector('main');
    const dockRows = [...document.querySelectorAll('[data-dock-row]')].map((el) => ({
      text: (el.textContent ?? '').trim().slice(0, 140),
      ...box(el),
    }));
    const bars = [...document.querySelectorAll('[role="toolbar"]')]
      .filter((el) => /^Actions for /.test(el.getAttribute('aria-label') ?? ''))
      .map((el) => ({ name: el.getAttribute('aria-label'), ...box(el) }));
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      panel: box(section),
      scene: box(scene),
      foot: box(foot),
      dockRows,
      singleBar: bars,
      mainScrollTop: main?.scrollTop ?? null,
      mainScrollable: main ? main.scrollHeight - main.clientHeight : null,
      windowScrollY: window.scrollY,
      docScrollable: {
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      },
    };
  });
}

/**
 * What is on the bar the reader meets after a selection: each control's label, whether it is shaded,
 * its row (distinct tops, 3 px tolerance) and whether any part of it lies outside the window or the
 * foot row. Works for both bars: the single bar's controls carry `data-toolbar-item`, the plural
 * bar's are the buttons inside its `[data-dock-row]`.
 */
async function actions(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const foot = document.querySelector('[data-activities-bar]');
    const footBox = foot?.getBoundingClientRect() ?? null;
    const single = [...document.querySelectorAll('[role="toolbar"]')].find((el) =>
      /^Actions for /.test(el.getAttribute('aria-label') ?? ''),
    );
    const plural = document.querySelector('[data-dock-row]');
    const root = single ?? plural;
    if (!root) return { present: false };
    const controls = [...root.querySelectorAll<HTMLElement>('button, [role="button"], a')];
    const tops: number[] = [];
    const rows = controls
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0)
      .map((b) => b.top)
      .sort((a, b) => a - b);
    for (const t of rows) {
      const last = tops[tops.length - 1];
      if (last === undefined || t - last > 3) tops.push(t);
    }
    const labelOf = (el: HTMLElement): string =>
      el.getAttribute('aria-label') ??
      (el.textContent ?? '').trim() ??
      el.getAttribute('data-toolbar-item') ??
      '';
    return {
      present: true,
      kind: single ? 'single' : 'plural',
      rootHeight: Math.round(root.getBoundingClientRect().height * 10) / 10,
      lines: tops.length,
      controls: controls.map((el) => ({
        id: el.getAttribute('data-toolbar-item'),
        label: labelOf(el).slice(0, 40),
        shaded: el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled,
        visible: el.getBoundingClientRect().width > 0,
        outsideWindow: (() => {
          const b = el.getBoundingClientRect();
          return (
            b.bottom > window.innerHeight + 0.5 || b.right > window.innerWidth + 0.5 || b.top < -0.5
          );
        })(),
        outsideFoot: (() => {
          const b = el.getBoundingClientRect();
          return footBox ? b.bottom > footBox.bottom + 0.5 || b.top < footBox.top - 0.5 : null;
        })(),
      })),
    };
  });
}

/** The scene canvas's box and `<main>`'s scroll, which is all the jump reading needs from the DOM. */
async function frame(page: Page): Promise<{
  top: number;
  visible: number;
  height: number;
  width: number;
  scroll: number;
}> {
  return page.evaluate(() => {
    const scene = document.querySelector(
      'section[aria-label="Time-scaled logic diagram"] canvas[data-layer="scene"]',
    );
    const b = scene?.getBoundingClientRect();
    // The canvas root has a minimum height, so a tall dock can sit over its bottom edge instead of
    // shrinking it (the reveal effect's `clipShift`): what the reader can SEE ends at the foot row.
    const footTop = document.querySelector('[data-activities-bar]')?.getBoundingClientRect().top;
    const visibleBottom = Math.min(b?.bottom ?? 0, footTop ?? Infinity, window.innerHeight);
    return {
      top: b?.top ?? 0,
      visible: Math.max(0, visibleBottom - (b?.top ?? 0)),
      height: b?.height ?? 0,
      width: b?.width ?? 0,
      scroll: document.querySelector('main')?.scrollTop ?? 0,
    };
  });
}

/** Wait for the dock to stop changing: the bar is up and the canvas height has held for 300 ms. */
async function settle(page: Page, bar: Locator | null): Promise<void> {
  if (bar) await expect(bar.first()).toBeVisible({ timeout: 10_000 });
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 40 && stable < 3; i += 1) {
    await page.waitForTimeout(100);
    const h = (await frame(page)).height;
    stable = h === last ? stable + 1 : 0;
    last = h;
  }
}

/** The hit range of `id` in one column: the y values at which a click selects it. */
async function sweepColumn(
  page: Page,
  x: number,
  id: string,
  from: number,
  to: number,
): Promise<number[]> {
  const hits: number[] = [];
  for (let y = from; y <= to; y += 4) {
    await canvas(page).click({ position: { x, y } });
    if ((await selectedActivityId(page)) === id) hits.push(y);
  }
  return hits;
}

/** Find a column and the hit range of `id` there, anywhere on the canvas. */
async function findBarBox(page: Page, id: string): Promise<{ x: number; ys: number[] } | null> {
  const f = await frame(page);
  const columns = [60, 90, 40, 120, 160, 200, 260, 320, 400];
  for (const x of columns) {
    if (x > f.width - 40) continue;
    const ys = await sweepColumn(page, x, id, 20, Math.min(f.visible - 8, 240));
    if (ys.length > 0) return { x, ys };
  }
  return null;
}

async function escapeSelection(page: Page): Promise<void> {
  await diagramList(page).focus();
  await page.keyboard.press('Escape');
  await expect(diagramList(page).locator('[role="option"][aria-selected="true"]')).toHaveCount(0);
}

async function holdPen(page: Page, want: boolean): Promise<void> {
  if (want) await ensurePen(page);
  else await releasePen(page);
}

async function openPlan(
  context: BrowserContext,
  url: string,
  size: { w: number; h: number },
): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.goto(url);
  await expect(canvas(page)).toBeVisible({ timeout: 30_000 });
  return page;
}

test.setTimeout(900_000);

test('diagram keys M5: the two selection bars on a short window, and the jump', async ({
  page,
  browser,
}) => {
  clearMeasurement('diagram-keys-m5');
  mkdirSync(OUT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  const stamp = Date.now();
  const org = await onboard(page, stamp);
  const mateEmail = `m5-mate-${stamp}@example.com`;

  // A Contributor: can report progress, cannot edit the schedule.
  await page
    .getByRole('navigation', { name: 'Organisation' })
    .getByRole('link', { name: 'Members', exact: true })
    .click();
  await page.getByRole('button', { name: 'Invite member' }).click();
  const invite = page.getByRole('dialog');
  await invite.getByLabel('Email').fill(mateEmail);
  await invite.getByLabel('Role', { exact: true }).selectOption('CONTRIBUTOR');
  await invite.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await page.getByLabel('Invitation link').inputValue();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await createHierarchy(page);
  await newPlan(page, 'Bars');
  await ensurePen(page);
  const names = Array.from({ length: 12 }, (_, i) => `Task ${String(i + 1).padStart(2, '0')}`);
  const seeded = await seedActivities(
    page,
    org,
    names.map((name) => ({ name, durationDays: 4 })),
  );
  const planUrl = page.url();
  const idOf = (name: string): string => seeded.find((a) => a.name === name)?.id ?? '';
  const laneId = (lane: number): string => idOf(names[lane] ?? '');

  const mateContext = await browser.newContext();
  const mate = await mateContext.newPage();
  await mate.goto('/sign-up');
  await mate.getByLabel('Full name').fill('M5 Mate');
  await mate.getByLabel('Email').fill(mateEmail);
  await mate.getByLabel('Password').fill('correct-horse-battery');
  await mate.getByRole('button', { name: /create an account/i }).click();
  await expect(mate.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await mate.goto(acceptUrl);
  await mate.getByRole('button', { name: /accept and join/i }).click();
  await expect(mate).toHaveURL(new RegExp(`/orgs/${org}`));
  const adminState = await page.context().storageState();
  const mateState = await mateContext.storageState();
  await mateContext.close();

  const ack = async (ctx: BrowserContext): Promise<void> => {
    await ctx.addInitScript((key) => {
      try {
        window.localStorage.setItem(key, '1');
      } catch {
        // storage blocked: not this harness's concern
      }
    }, VIEWPORT_NOTICE_ACK_KEY);
  };

  for (const size of SIZES) {
    const tag = `${String(size.w)}x${String(size.h)}`;
    const admin = await browser.newContext({
      storageState: adminState,
      viewport: { width: size.w, height: size.h },
      deviceScaleFactor: 2,
    });
    await ack(admin);
    const contributor = await browser.newContext({
      storageState: mateState,
      viewport: { width: size.w, height: size.h },
      deviceScaleFactor: 2,
    });
    await ack(contributor);

    const states = [
      { key: 'b-no-pen-one', ctx: admin, pen: false, plural: false },
      { key: 'a-pen-one', ctx: admin, pen: true, plural: false },
      { key: 'c-contributor-one', ctx: contributor, pen: false, plural: false },
      { key: 'd-pen-three', ctx: admin, pen: true, plural: true },
    ] as const;

    for (const state of states) {
      const key = `${tag} ${state.key}`;
      const p = await openPlan(state.ctx, planUrl, size);
      if (state.ctx === admin) await holdPen(p, state.pen);
      await expect(canvas(p)).toBeVisible();
      await p.waitForTimeout(600);

      // The bar's hit range with the whole diagram unselected is not directly readable (finding it
      // selects it), so lane 0 is found first and the others derived by whole lanes, then validated.
      const found = await findBarBox(p, laneId(0));
      const reading: Reading = { size: tag, state: state.key };
      if (!found) {
        reading.error = 'lane 0 bar not found';
        readings[key] = reading;
        await p.close();
        continue;
      }
      const lane0Mid = found.ys[Math.floor(found.ys.length / 2)] ?? 0;
      // A reload, not an Escape: finding the bar selected it, and a reveal may have panned the view,
      // which would make the lane arithmetic below describe a view the reader never started from.
      await p.reload();
      await expect(canvas(p)).toBeVisible({ timeout: 30_000 });
      if (state.ctx === admin) await holdPen(p, state.pen);
      await p.waitForTimeout(600);
      await settle(p, null);
      const unselected = await geometry(p);
      const unselectedFrame = await frame(p);

      // The deepest lane whose bar still sits wholly inside the UNSELECTED canvas.
      let lane = 0;
      while (
        lane + 1 < names.length &&
        lane0Mid + (lane + 1) * LANE_HEIGHT < unselectedFrame.visible - 14
      ) {
        lane += 1;
      }
      const yBefore = lane0Mid + lane * LANE_HEIGHT;
      const target = laneId(lane);

      if (state.plural) {
        const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
        await canvas(p).click({ position: { x: found.x, y: lane0Mid } });
        await canvas(p).click({
          position: { x: found.x, y: lane0Mid + LANE_HEIGHT },
          modifiers: [modifier],
        });
        await canvas(p).click({
          position: { x: found.x, y: lane0Mid + 2 * LANE_HEIGHT },
          modifiers: [modifier],
        });
        await settle(p, null);
        reading.selectedCount = await diagramList(p)
          .locator('[role="option"][aria-selected="true"]')
          .count();
      } else {
        await canvas(p).click({ position: { x: found.x, y: yBefore } });
        await settle(p, p.getByRole('toolbar', { name: /^Actions for / }));
        const hit = await selectedActivityId(p);
        reading.clickHitTarget = hit === target;
      }

      const after = await geometry(p);
      const afterFrame = await frame(p);
      reading.unselected = unselected;
      reading.selected = after;
      reading.lane = lane;
      reading.yBefore = round(yBefore);
      reading.canvasHeightBefore = unselectedFrame.height;
      reading.visibleHeightBefore = round(unselectedFrame.visible);
      reading.visibleHeightAfter = round(afterFrame.visible);
      reading.canvasHeightAfter = afterFrame.height;
      reading.canvasTopShift = round(afterFrame.top - unselectedFrame.top);
      reading.mainScrollBefore = unselectedFrame.scroll;
      reading.mainScrollAfter = afterFrame.scroll;
      reading.actions = await actions(p);

      // The screenshot is taken before any further click, so it shows what a click leaves.
      await p.screenshot({ path: join(OUT_DIR, `m5-${tag}-${state.key}.png`), type: 'png' });

      if (!state.plural) {
        // Where is the clicked bar now? A sweep reselects bars as it goes, and ends on the target.
        const ys = await sweepColumn(p, found.x, target, 12, Math.max(afterFrame.visible - 8, 20));
        reading.yAfter = ys.length > 0 ? round(ys[Math.floor(ys.length / 2)] ?? 0) : null;
        reading.barVisibleAfter = ys.length > 0;
        reading.barPannedBy = ys.length > 0 ? round((reading.yAfter as number) - yBefore) : null;
        reading.barBelowShrunkCanvas = yBefore > afterFrame.visible - 8;
        // Does Escape and a re-click at the same point reach the same bar, i.e. is the picture back?
        await escapeSelection(p);
        await settle(p, null);
        reading.canvasHeightAfterEscape = (await frame(p)).height;
      }
      if (!state.plural) {
        // The control reading: a bar near the top of the canvas, from a fresh view, to see whether a
        // selection moves a bar that was never near the edge the dock takes.
        await p.reload();
        await expect(canvas(p)).toBeVisible({ timeout: 30_000 });
        if (state.ctx === admin) await holdPen(p, state.pen);
        await p.waitForTimeout(600);
        await settle(p, null);
        await canvas(p).click({ position: { x: found.x, y: lane0Mid } });
        await settle(p, p.getByRole('toolbar', { name: /^Actions for / }));
        const topHit = await selectedActivityId(p);
        const topFrame = await frame(p);
        const topYs = await sweepColumn(
          p,
          found.x,
          laneId(0),
          12,
          Math.max(topFrame.visible - 8, 20),
        );
        reading.topLane = {
          hitTarget: topHit === laneId(0),
          yBefore: round(lane0Mid),
          yAfter: topYs.length > 0 ? round(topYs[Math.floor(topYs.length / 2)] ?? 0) : null,
          visibleHeightAfter: round(topFrame.visible),
        };
      }
      log(
        `${key}: ${JSON.stringify({ lane, yBefore: reading.yBefore, yAfter: reading.yAfter, hBefore: reading.canvasHeightBefore, hAfter: reading.canvasHeightAfter, lines: (reading.actions as Reading).lines })}`,
      );
      readings[key] = reading;
      await p.close();
    }
    await admin.close();
    await contributor.close();
  }

  const path = writeMeasurement('diagram-keys-m5', { readings });
  log(`wrote ${path}`);
  expect(Object.keys(readings).length).toBe(SIZES.length * 4);
});
