import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { chromium, type Page } from '@playwright/test';

import { holdThePen } from '../e2e-support/pen';
import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  canvas,
  createHierarchy,
  diagramList,
  linkActivities,
  newPlan,
  onboard,
  openPlanId,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import {
  DESIGNED_BAND_HEIGHT_PX,
  DESIGNED_ROOT_HEIGHT_PX,
  DESIGNED_WORKSPACE_HEIGHT_PX,
  DESIGNED_WORKSPACE_WIDTH_PX,
  WORKSPACE_SCALE_FLOOR,
} from '../src/components/layout/workspace/workspace-scale';
import { WORKSPACE_ACTUAL_SIZE_KEY } from '../src/components/layout/workspace/workspace-scale-pref';
import { WORKSPACE_SCALE_TIP } from '../src/components/layout/workspace/workspace-scale-switch';

/**
 * **The plan workspace scales to fit below 1280 x 800** (ADR-0222, `docs/specs/scaled-workspace/`, M1 and
 * M2): SC-1 to SC-4, SC-6, SC-7 and SC-8.
 *
 * What a scaled workspace can get wrong is not visible to a unit test, which has no layout: that the
 * wrapper fills its box, that the canvas is sized from layout px and not screen px (the defect
 * `m0-measurement.md` §2.2 found, a canvas 747 px wide inside a 996 px box), that a click lands on the bar
 * under the pointer, and that a drag moves a bar by the distance the pointer moved **on screen**. Every
 * pointer here is `page.mouse` at screen coordinates; nothing uses a locator's `position`, which a browser
 * would compensate for a transform itself.
 *
 * **One fixture, built once.** Three tasks in three lanes with a link; the window is resized between
 * readings and the plan reopened so the workspace measures itself again at each size.
 */
const CELLS = [
  { width: 1024, height: 600 },
  { width: 1152, height: 720 },
  { width: 1366, height: 636 },
] as const;
const DESIGNED = { width: 1280, height: 800 };

interface Boxes {
  scale: number;
  frame: { x: number; y: number; width: number; height: number };
  inner: { x: number; y: number; width: number; height: number };
  innerLayout: { width: number; height: number };
  band: { x: number; y: number; width: number; height: number };
  bandLayout: { width: number; height: number };
  canvas: { width: number; height: number; layoutWidth: number; layoutHeight: number };
  lines: number;
  items: number;
  scrolls: boolean;
  switchText: string | null;
}

async function read(page: Page): Promise<Boxes> {
  return page.evaluate(() => {
    const rect = (el: Element): { x: number; y: number; width: number; height: number } => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const main = document.querySelector('main#main');
    const frame = main?.firstElementChild;
    const inner = frame?.firstElementChild as HTMLElement | null | undefined;
    const band = document.querySelector('section[aria-label="Plan command band"]');
    const bandInner = band?.parentElement;
    const bandOuter = bandInner?.parentElement;
    const scene = document.querySelector<HTMLCanvasElement>(
      'section[aria-label="Time-scaled logic diagram"] canvas',
    );
    const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
    if (!main || !frame || !inner || !band || !bandInner || !bandOuter || !scene || !deck) {
      throw new Error('the workspace was not found');
    }
    const tops = [...deck.querySelectorAll('[data-toolbar-item]')]
      .map((el) => el.getBoundingClientRect().top)
      .sort((a, b) => a - b);
    let lines = 0;
    let last = Number.NEGATIVE_INFINITY;
    for (const top of tops) {
      if (top - last > 4) lines += 1;
      last = top;
    }
    const switchEl = document.querySelector('[data-workspace-scale-switch]');
    return {
      scale: Number(inner.getAttribute('data-workspace-scale') ?? '1'),
      frame: rect(frame),
      inner: rect(inner),
      innerLayout: { width: inner.offsetWidth, height: inner.offsetHeight },
      band: rect(bandOuter),
      bandLayout: { width: bandInner.offsetWidth, height: bandInner.offsetHeight },
      canvas: {
        ...(({ width, height }) => ({ width, height }))(rect(scene)),
        layoutWidth: scene.offsetWidth,
        layoutHeight: scene.offsetHeight,
      },
      lines,
      items: deck.querySelectorAll('[data-toolbar-item]').length,
      scrolls: main.scrollHeight > main.clientHeight + 1 || main.scrollWidth > main.clientWidth + 1,
      switchText: switchEl?.textContent?.trim() ?? null,
    };
  });
}

interface Row {
  id: string;
  name: string;
  version: number;
  visualStart: string | null;
  visualEffectiveStart: string;
  visualEffectiveFinish: string;
}

async function rows(page: Page, orgSlug: string): Promise<Row[]> {
  const planId = openPlanId(page);
  return page.evaluate(
    async ({ org, id }: { org: string; id: string }) => {
      const response = await fetch(
        `/api/v1/organizations/${org}/plans/${id}/activities?limit=100`,
        {
          credentials: 'include',
        },
      );
      const body = (await response.json()) as { data: Row[] };
      return body.data;
    },
    { org: orgSlug, id: planId },
  );
}

const days = (from: string, to: string): number =>
  Math.round(
    (Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  );

/** The screen point of a click that selects `id`, found by clicking a grid over the canvas. */
async function hitBar(page: Page, id: string): Promise<{ x: number; y: number }> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('the canvas has no box');
  for (let y = box.y + 14; y < box.y + box.height - 4; y += 6) {
    for (let x = box.x + 18; x < box.x + box.width - 8; x += 28) {
      await page.mouse.click(x, y);
      if ((await selectedActivityId(page)) === id) return { x, y };
    }
  }
  throw new Error(`no click on the canvas selected ${id}`);
}

/** A bar's screen extent, found by walking the row from a hit until the selection changes. */
async function barExtentOnScreen(
  page: Page,
  id: string,
  from: { x: number; y: number },
): Promise<{ left: number; right: number }> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('the canvas has no box');
  const edge = async (direction: 1 | -1): Promise<number> => {
    let x = from.x;
    while (x > box.x + 2 && x < box.x + box.width - 2) {
      await page.mouse.click(x + direction * 3, from.y);
      if ((await selectedActivityId(page)) !== id) return x;
      x += direction * 3;
    }
    return x;
  };
  const right = await edge(1);
  const left = await edge(-1);
  return { left, right };
}

/**
 * Every pointer target in the scaled workspace that renders under 24 x 24 (WCAG 2.2 §2.5.8, ADR-0222 D3).
 *
 * axe's `target-size` rule is not enough alone: it passes an undersized target whose neighbours are far
 * enough away, which a dense toolbar row is not but a lone control is. So this reads the rendered boxes
 * themselves, with the same pointer-target list `command-surface.spec.ts` sweeps. A control that is not
 * laid out (`display: none`), is scrolled out of its list, or lies outside the window is not a target
 * anybody can press, and is left out.
 */
async function undersizedTargets(page: Page): Promise<{ name: string; w: number; h: number }[]> {
  return page.evaluate(() => {
    const out: { name: string; w: number; h: number }[] = [];
    const selector =
      'button,a,[role="button"],select,textarea,summary,[role="treeitem"],[role="option"],' +
      '[role="menuitem"],[role="tab"],[role="switch"],[data-row-select],input';
    const roots = document.querySelectorAll('main, section[aria-label="Plan command band"]');
    for (const root of roots) {
      for (const el of root.querySelectorAll(selector)) {
        if (el.getClientRects().length === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
        // `sr-only` is a 1 px clipped box that exists for the name, never for a pointer.
        if (r.width <= 1 && r.height <= 1) continue;
        // Scrolled out of a scroller that has more to show: reachable by scrolling, not under 24 px.
        let outside = false;
        for (let a = el.parentElement; a && !outside; a = a.parentElement) {
          const style = getComputedStyle(a);
          if (!/auto|scroll|hidden|clip/.test(`${style.overflowX} ${style.overflowY}`)) continue;
          const box = a.getBoundingClientRect();
          if (
            r.top + r.height / 2 < box.top ||
            r.top + r.height / 2 > box.bottom ||
            r.left + r.width / 2 < box.left ||
            r.left + r.width / 2 > box.right
          )
            outside = true;
        }
        if (outside) continue;
        if (r.width < 23.5 || r.height < 23.5) {
          out.push({
            name:
              el.getAttribute('aria-label') ??
              el.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ??
              (el.textContent ?? '').trim().slice(0, 30),
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
          });
        }
      }
    }
    return out;
  });
}

async function reopen(page: Page, url: string, size: { width: number; height: number }) {
  await page.setViewportSize(size);
  await page.goto(url);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
    timeout: 30_000,
  });
  await holdThePen(page);
  const minimap = page.locator('[data-toolbar-item="minimap"]').first();
  if ((await minimap.getAttribute('aria-pressed')) === 'true') await minimap.click();
  await expect(canvas(page)).toBeVisible();
  await page.waitForTimeout(500);
}

test.describe('The plan workspace scales to fit below 1280 x 800', () => {
  test('fills its box, hits what is under the pointer, moves a bar by the pointer, keeps targets at 24 px', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await acknowledgeViewportNotice(page.context());
    await page.setViewportSize({ width: 1646, height: 1097 });
    const orgSlug = await onboard(page, Date.now() + 2222);
    await createHierarchy(page);
    await newPlan(page, 'Scaled workspace');
    await holdThePen(page);
    const seeded = await seedActivities(page, orgSlug, [
      { name: 'Site setup', laneIndex: 0, durationDays: 10 },
      { name: 'Excavate', laneIndex: 1, durationDays: 10 },
      // One bar to drag per window size, so no cell starts from where the last one left a bar.
      { name: 'Pour slab A', laneIndex: 2, durationDays: 10 },
      { name: 'Pour slab B', laneIndex: 3, durationDays: 10 },
      { name: 'Pour slab C', laneIndex: 4, durationDays: 10 },
    ]);
    await linkActivities(page, orgSlug, seeded[0]!.id, seeded[1]!.id);
    await recalculate(page, orgSlug);
    const planUrl = page.url();

    // ---- SC-8: the designed window is untouched --------------------------------------------------
    await reopen(page, planUrl, DESIGNED);
    const designed = await read(page);
    expect(designed.scale, 'no scale at the designed window').toBe(1);
    expect(designed.switchText, 'no switch at the designed window').toBeNull();
    // The designed numbers are the ones the constants pin (M0 §1): the root's box and the band's.
    expect(Math.round(designed.frame.width)).toBe(DESIGNED_WORKSPACE_WIDTH_PX);
    expect(Math.round(designed.frame.height)).toBe(DESIGNED_ROOT_HEIGHT_PX);
    expect(Math.round(designed.band.height)).toBe(DESIGNED_BAND_HEIGHT_PX);
    expect(Math.round(designed.frame.height + designed.band.height)).toBe(
      DESIGNED_WORKSPACE_HEIGHT_PX,
    );
    expect(designed.scrolls, 'nothing scrolls at the designed window').toBe(false);

    for (const [index, cell] of CELLS.entries()) {
      const label = `${String(cell.width)} x ${String(cell.height)}`;
      await reopen(page, planUrl, cell);
      const r = await read(page);

      // ---- SC-1: the scale is the box's and the wrapper fills it -------------------------------------
      const wanted = Math.max(
        WORKSPACE_SCALE_FLOOR,
        Math.min(
          1,
          r.frame.width / DESIGNED_WORKSPACE_WIDTH_PX,
          (r.frame.height + r.band.height) / DESIGNED_WORKSPACE_HEIGHT_PX,
        ),
      );
      expect(r.scale, `${label}: the scale`).toBeLessThan(1);
      expect(r.scale, `${label}: the scale follows the box`).toBeCloseTo(wanted, 2);
      expect(r.inner.width, `${label}: the wrapper fills the width`).toBeCloseTo(r.frame.width, 0);
      expect(r.inner.height, `${label}: the wrapper fills the height`).toBeCloseTo(
        r.frame.height,
        0,
      );
      expect(r.innerLayout.width * r.scale, `${label}: laid out at box / scale`).toBeCloseTo(
        r.frame.width,
        0,
      );
      expect(r.band.width, `${label}: the band spans the window`).toBeCloseTo(cell.width, 0);
      expect(
        r.bandLayout.width * r.scale,
        `${label}: the band is laid out at width / scale`,
      ).toBeCloseTo(cell.width, 0);
      // The canvas was sized from layout px: it is the size the layout gave it, drawn at the scale.
      expect(r.canvas.width, `${label}: the canvas is drawn at layout x scale`).toBeCloseTo(
        r.canvas.layoutWidth * r.scale,
        0,
      );
      expect(r.canvas.layoutWidth, `${label}: the canvas fills its wrapper`).toBeGreaterThan(
        r.innerLayout.width * 0.9,
      );
      expect(r.switchText, `${label}: the switch says what the scale is`).toBe(
        `Scaled to ${String(Math.round(r.scale * 100))} %`,
      );
      // The designed layout, drawn smaller: every control of 1280 x 800 on no more lines. A window that is
      // wide for its height (1366 x 636, scaled to 0.78, laid out 1750 wide) may promote MORE commands
      // onto the deck, as a 1750 px window would (spec §2, "Very wide, short window").
      expect(r.items, `${label}: at least the controls of 1280 x 800`).toBeGreaterThanOrEqual(
        designed.items,
      );
      expect(r.lines, `${label}: no more deck lines than 1280 x 800`).toBeLessThanOrEqual(
        designed.lines,
      );
      if (cell.width === 1024) {
        expect(r.items, `${label}: exactly the controls of 1280 x 800`).toBe(designed.items);
        expect(r.lines, `${label}: exactly the deck lines of 1280 x 800`).toBe(designed.lines);
      }
      expect(r.scrolls, `${label}: nothing scrolls that does not at 1280 x 800`).toBe(false);

      // ---- SC-2: a click selects the bar under the pointer; a drag is the pointer's distance ------------
      const pour = seeded[2 + index]!;
      await diagramList(page).focus();
      await page.keyboard.press('Escape');
      const at = await hitBar(page, pour.id);
      const before = (await rows(page, orgSlug)).find((row) => row.id === pour.id)!;
      const extent = await barExtentOnScreen(page, pour.id, at);
      const width = extent.right - extent.left;
      // Grab the middle: the first hit sits on the start edge's handle, which resizes instead of moving.
      const grab = { x: (extent.left + extent.right) / 2, y: at.y };
      const span = days(before.visualEffectiveStart, before.visualEffectiveFinish) + 1;
      const pitch = width / span;
      const travel = 240;
      // The edge walk ended outside the bar, which cleared the selection: a click selects it again.
      await page.mouse.click(grab.x, grab.y);
      expect(await selectedActivityId(page), `${label}: a click on the bar selects it`).toBe(
        pour.id,
      );
      await page.mouse.move(grab.x, grab.y);
      await page.mouse.down();
      await page.mouse.move(grab.x + travel / 2, grab.y, { steps: 6 });
      await page.mouse.move(grab.x + travel, grab.y, { steps: 6 });
      await page.mouse.up();
      await expect
        .poll(async () => (await rows(page, orgSlug)).find((row) => row.id === pour.id)!.version, {
          timeout: 15_000,
        })
        .toBeGreaterThan(before.version);
      const after = (await rows(page, orgSlug)).find((row) => row.id === pour.id)!;
      // The start the drag wrote (`visualStart`); the effective one waits for a recalculation.
      const moved = days(
        before.visualEffectiveStart,
        after.visualStart ?? before.visualEffectiveStart,
      );
      // A day's pitch is what a bar can be off by (it snaps to whole days); the probe adds a few px.
      expect(
        Math.abs(moved * pitch - travel),
        `${label}: the bar moved ${String(moved)} days of ${pitch.toFixed(1)} px for ${String(travel)} px of pointer`,
      ).toBeLessThanOrEqual(pitch * 0.75 + 8);

      // ---- SC-3: nothing pressable renders under 24 px, in the diagram and in the Gantt ---------------
      // The bar the drag left selected has its actions docked in the foot row: that is a state of its own.
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
      await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
      expect(await undersizedTargets(page), `${label}: selected-bar targets under 24 px`).toEqual(
        [],
      );
      await diagramList(page).focus();
      await page.keyboard.press('Escape');
      expect(await undersizedTargets(page), `${label}: diagram targets under 24 px`).toEqual([]);
      await page.getByRole('button', { name: 'Expand activities panel' }).click();
      await expect(page.getByRole('button', { name: 'Collapse activities panel' })).toBeVisible();
      await page.mouse.move(1, 1);
      await page.waitForTimeout(400);
      expect(
        await undersizedTargets(page),
        `${label}: activities table targets under 24 px`,
      ).toEqual([]);
      await page.getByRole('button', { name: 'Collapse activities panel' }).click();
      await expect(page.getByRole('button', { name: 'Expand activities panel' })).toBeVisible();
      await page.locator('[data-toolbar-item="view-gantt"]').first().click();
      await expect(page.getByRole('treegrid', { name: 'Schedule as a bar chart' })).toBeVisible();
      await page.mouse.move(1, 1);
      await page.waitForTimeout(500);
      expect(await undersizedTargets(page), `${label}: Gantt targets under 24 px`).toEqual([]);
      await page.locator('[data-toolbar-item="view-tsld"]').first().click();
      await expect(canvas(page)).toBeVisible();

      const scan = await new AxeBuilder({ page })
        .include('main')
        .include('section[aria-label="Plan command band"]')
        .withRules(['target-size'])
        .analyze();
      expect(
        scan.violations.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => node.target.join(' ')),
        })),
        `${label}: target-size`,
      ).toEqual([]);
    }
  });

  test("does not undo the reader's text size, and the switch turns scaling off and is remembered", async ({
    page,
    context,
  }) => {
    test.setTimeout(300_000);
    await acknowledgeViewportNotice(context);
    await page.setViewportSize({ width: 1646, height: 1097 });
    const orgSlug = await onboard(page, Date.now() + 3333);
    await createHierarchy(page);
    await newPlan(page, 'Scale guards');
    await holdThePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Task one', laneIndex: 0 }]);
    await recalculate(page, orgSlug);
    const planUrl = page.url();

    // ---- the switch: toggles, names itself, persists ------------------------------------------------
    await reopen(page, planUrl, CELLS[2]);
    const scaled = await read(page);
    expect(scaled.scale).toBeLessThan(1);
    const toggle = page.getByRole('button', { name: /^Workspace scale/ });
    await expect(toggle).toHaveText(`Scaled to ${String(Math.round(scaled.scale * 100))} %`);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.focus();
    await toggle.hover();
    await expect(page.getByRole('tooltip')).toHaveText(WORKSPACE_SCALE_TIP);
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveText('Actual size');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await read(page)).scale).toBe(1);
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), WORKSPACE_ACTUAL_SIZE_KEY),
    ).toBe('1');

    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: /^Workspace scale/ })).toHaveText('Actual size');
    expect((await read(page)).scale).toBe(1);

    // Another tab of the same device sees it too.
    const other = await context.newPage();
    await other.setViewportSize(CELLS[2]);
    await other.goto(planUrl);
    await expect(other.getByRole('button', { name: /^Workspace scale/ })).toHaveText(
      'Actual size',
      {
        timeout: 30_000,
      },
    );
    await other.close();

    await page.getByRole('button', { name: /^Workspace scale/ }).click();
    await expect(page.getByRole('button', { name: /^Workspace scale/ })).toHaveText(
      /^Scaled to \d+ %$/,
    );
    await expect.poll(async () => (await read(page)).scale).toBeLessThan(1);
    expect(
      await page.evaluate((key) => window.localStorage.getItem(key), WORKSPACE_ACTUAL_SIZE_KEY),
    ).toBeNull();

    // ---- SC-4: enlarged text is never scaled back (CDP text size, then a user style sheet) ---------------
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32 } });
    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
      timeout: 30_000,
    });
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
      '32px',
    );
    for (const cell of CELLS) {
      await page.setViewportSize(cell);
      await page.waitForTimeout(400);
      expect(
        (await read(page)).scale,
        `text size 200 % at ${String(cell.width)} x ${String(cell.height)}`,
      ).toBe(1);
    }
    await expect(page.locator('[data-workspace-scale-switch]')).toHaveCount(0);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 16 } });

    await page.reload();
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(canvas(page)).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await read(page)).scale).toBeLessThan(1);
    await page.addStyleTag({ content: 'html { font-size: 200% }' });
    for (const cell of CELLS) {
      await page.setViewportSize(cell);
      await page.waitForTimeout(400);
      expect(
        (await read(page)).scale,
        `style sheet 200 % at ${String(cell.width)} x ${String(cell.height)}`,
      ).toBe(1);
    }
  });

  /**
   * **Real browser zoom, not a stand-in** (`m0-measurement.md` §3). A text-size setting and a style sheet
   * move the root font size and nothing else, and `Emulation.setDeviceMetricsOverride` gives the CSS size
   * of a zoomed window with no zoom signal in it, which is the very catch ADR-0222 is about. A browser
   * profile whose `Preferences` carry a zoom level is the one route that makes Chromium report
   * `outerWidth / innerWidth` as a zoomed window does, so the journey launches its own persistent
   * context with one written (no new Playwright config: the suite's own launch is not used for it).
   */
  test('is 1 under real browser zoom, where the same window unzoomed scales', async () => {
    test.setTimeout(300_000);
    const launch = async (zoomLevel: number, size: { width: number; height: number }) => {
      const dir = mkdtempSync(join(tmpdir(), 'sp-zoom-'));
      mkdirSync(join(dir, 'Default'), { recursive: true });
      writeFileSync(
        join(dir, 'Default', 'Preferences'),
        JSON.stringify({
          partition: {
            default_zoom_level: { x: zoomLevel },
            per_host_zoom_levels: { x: { localhost: { zoom_level: zoomLevel } } },
          },
        }),
      );
      // The suite's device profile carries a scale factor, which a null viewport refuses: it is overridden
      // with `undefined`, which `exactOptionalPropertyTypes` only lets through a double assertion.
      // Real page zoom from a seeded profile needs the full Chromium build. Without an explicit binary,
      // Playwright launches its "headless shell", which ignores the profile's zoom levels (CI on #1388 read
      // outerWidth / innerWidth = 1), so the channel asks for full Chromium in new headless mode instead.
      const options = {
        ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : { channel: 'chromium' }),
        baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
        viewport: null,
        deviceScaleFactor: undefined,
        args: [`--window-size=${String(size.width)},${String(size.height)}`],
      } as unknown as Parameters<typeof chromium.launchPersistentContext>[1];
      const context = await chromium.launchPersistentContext(dir, options);
      await acknowledgeViewportNotice(context);
      return { context, dir };
    };

    // Zoom level 1 is a factor of 1.2: a 1280 x 800 window is then 1067 x 667 CSS px.
    const zoomed = await launch(1, DESIGNED);
    try {
      const page = zoomed.context.pages()[0] ?? (await zoomed.context.newPage());
      const orgSlug = await onboard(page, Date.now() + 4444);
      await createHierarchy(page);
      await newPlan(page, 'Real zoom');
      await holdThePen(page);
      await seedActivities(page, orgSlug, [{ name: 'Task one', laneIndex: 0 }]);
      await recalculate(page, orgSlug);
      await page.reload();
      await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
        timeout: 30_000,
      });
      const signal = await page.evaluate(() => ({
        inner: window.innerWidth,
        outer: window.outerWidth,
      }));
      expect(signal.outer / signal.inner, 'the browser reports the zoom').toBeGreaterThan(1.15);
      await page.waitForTimeout(500);
      expect((await read(page)).scale, 'zoomed to 120 %: not scaled back').toBe(1);
      await expect(page.locator('[data-workspace-scale-switch]')).toHaveCount(0);
    } finally {
      await zoomed.context.close();
      rmSync(zoomed.dir, { recursive: true, force: true });
    }

    // The control: the same CSS size with no zoom behind it is a window that scales.
    const plain = await launch(0, { width: 1067, height: 667 });
    try {
      const page = plain.context.pages()[0] ?? (await plain.context.newPage());
      const orgSlug = await onboard(page, Date.now() + 5555);
      await createHierarchy(page);
      await newPlan(page, 'No zoom');
      await holdThePen(page);
      await seedActivities(page, orgSlug, [{ name: 'Task one', laneIndex: 0 }]);
      await recalculate(page, orgSlug);
      await page.reload();
      await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
        timeout: 30_000,
      });
      const signal = await page.evaluate(() => window.outerWidth / window.innerWidth);
      expect(signal, 'no zoom is reported').toBeLessThan(1.05);
      await expect.poll(async () => (await read(page)).scale).toBeLessThan(1);
    } finally {
      await plain.context.close();
      rmSync(plain.dir, { recursive: true, force: true });
    }
  });
});
