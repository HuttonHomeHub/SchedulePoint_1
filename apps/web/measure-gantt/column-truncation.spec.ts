import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

import {
  createClient,
  createPlan,
  createProject,
  ganttGrid,
  onboard,
  openPlanId,
  startEditing,
  syncClient,
} from '../e2e-gantt/support';
import { writeMeasurement } from '../measure-toolbar/output';

/**
 * **Resizable Gantt columns, M1-T0 — measure the problem before building the remedy**
 * (`docs/specs/gantt-column-resize/`, ADR-0113 / ADR-0142).
 *
 * Four independent limbs, each taken in a **fresh browser context** (cookies copied from the setup
 * session, localStorage empty) so that none inherits another's dragged `Grid width` — the grid's
 * stored width stands once placed (`GanttPanel.tsx`, ADR-0099 D6), which would quietly make a second
 * reading describe the first one's drag.
 *
 *  (a) how many Code / Predecessors / other cells truncate at the DEFAULT widths;
 *  (b) whether `barRegionWidth` — derived from the column sum, not the pane — still describes the
 *      chart after a `Grid width` drag, and whether a zoom preset frames differently for it;
 *  (c) what the Gantt does at 390 px, where the fixed columns exceed the scroller;
 *  (d) whether the shipped `Grid width` separator can be dragged by touch.
 *
 * (b) reads **measurable effects only**: the product exposes no `barRegionWidth`, and a console hook
 * would be product code. Its two sides are therefore reconstructed — the width it assumed from the
 * pre-drag pane (which is the column sum, `GRID_WIDTH`), the width actually left of the pane after
 * the drag — and the chart header's own width is the effect of the px-per-day that assumption fed.
 *
 * Every limb is wrapped so a failure is recorded as that limb's `error` and the others still land.
 * A harness, not a gate: it writes JSON and a short summary to `measure-output/` and fails nothing
 * a reader would act on.
 */

const WIDTHS = [1646, 1024, 390] as const;
const HEIGHT = (width: number): number => (width <= 480 ? 844 : 1097);

/** Fifteen characters, the shape a structured WBS code takes on a real programme. */
const codeFor = (i: number): string =>
  `WBS-A.${String(i).padStart(2, '0')}.B.${String(i).padStart(4, '0')}`;

const ACTIVITY_COUNT = 10;

interface Sample {
  text: string;
  visibleTextWidth: number;
  cellClientWidth: number;
}

interface LimbError {
  error: string;
}
type Limb<T> = T | LimbError;

async function limb<T>(fn: () => Promise<T>): Promise<Limb<T>> {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Seed ten activities with 15-character codes and **multi-predecessor** rows through the REST API.
 * `docs/TEST_PLAYBOOK.md` names `plan:scale-500` for size but its codes are short and its links
 * single-predecessor; the problem under test needs long codes and wide Predecessors text, so this is
 * hand-made, the way `link-density.spec.ts` seeds.
 */
async function seedStructuredPlan(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  const failures = await page.evaluate(
    async ({ org, id, n, codes }: { org: string; id: string; n: number; codes: string[] }) => {
      const bad: string[] = [];
      const base = `/api/v1/organizations/${org}/plans/${id}`;
      const ids: string[] = [];
      for (let i = 0; i < n; i += 1) {
        const res = await fetch(`${base}/activities`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: `Install level ${i} mechanical first fix and testing`,
            code: codes[i],
            durationDays: 5,
          }),
        });
        if (!res.ok) {
          bad.push(`activity ${i}: ${res.status} ${(await res.text()).slice(0, 120)}`);
          continue;
        }
        ids.push(((await res.json()) as { data: { id: string } }).data.id);
      }
      // Activity k follows up to three earlier ones, so the Predecessors cell has real width to fill.
      for (let k = 1; k < ids.length; k += 1) {
        for (let back = 1; back <= Math.min(3, k); back += 1) {
          const res = await fetch(`${base}/dependencies`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              predecessorId: ids[k - back],
              successorId: ids[k],
              type: 'FS',
              lagDays: 0,
            }),
          });
          if (!res.ok) bad.push(`link ${k}<-${k - back}: ${res.status}`);
        }
      }
      await fetch(`${base}/schedule/recalculate`, { method: 'POST', credentials: 'include' });
      return bad;
    },
    {
      org: orgSlug,
      id: planId,
      n: ACTIVITY_COUNT,
      codes: Array.from({ length: ACTIVITY_COUNT }, (_, i) => codeFor(i)),
    },
  );
  if (failures.length > 0) throw new Error(`seeding failed: ${failures.slice(0, 3).join('; ')}`);
  await syncClient(page);
}

interface Setup {
  origin: string;
  planPath: string;
  storageState: Awaited<ReturnType<BrowserContext['storageState']>>;
}

async function openFresh(
  browser: Browser,
  setup: Setup,
  width: number,
  query: string,
  extra: { touch?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: setup.storageState,
    viewport: { width, height: HEIGHT(width) },
    ...(extra.touch ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await context.newPage();
  await page.goto(`${setup.origin}${setup.planPath}?view=gantt${query}`);
  await expect(ganttGrid(page)).toBeVisible();
  await expect(ganttGrid(page).locator('[role="row"][aria-rowindex="2"]')).toBeVisible();
  return { context, page };
}

/** Per-column truncation over the mounted rows: a cell, or anything inside it, wider than its box. */
async function truncation(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const grid = document.querySelector('[role="treegrid"]');
    if (grid === null) throw new Error('no treegrid');
    const headers = [...grid.querySelectorAll('[role="columnheader"]')]
      .map((el) => ({
        colindex: Number(el.getAttribute('aria-colindex')),
        label: (el.textContent ?? '').trim(),
        width: Math.round(el.getBoundingClientRect().width),
        srOnly: el.classList.contains('sr-only'),
      }))
      // The Timeline header's text includes its ruler labels ("TimelineFeb 2026…"): match by prefix.
      .filter((h) => !h.srOnly && !h.label.startsWith('Timeline') && h.label !== 'vs baseline');
    const rows = [...grid.querySelectorAll('[role="row"]')].filter(
      (r) => Number(r.getAttribute('aria-rowindex')) >= 2,
    );
    // The app hides text with Tailwind's `sr-only` class and `aria-hidden`. A cell carrying such
    // text ("Start editing to change this activity.") reports a scrollWidth that is not the width of
    // anything a sighted reader sees, so only visible text is measured.
    const hidden = (el: Element): boolean => el.closest('.sr-only, [aria-hidden="true"]') !== null;
    const visibleText = (cell: Element): { text: string; width: number } => {
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let text = '';
      let left = Infinity;
      let right = -Infinity;
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        const parent = n.parentElement;
        if (parent === null || hidden(parent) || (n.textContent ?? '').trim() === '') continue;
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        text += n.textContent ?? '';
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
      }
      return { text: text.trim(), width: right > left ? Math.round(right - left) : 0 };
    };
    const columns = headers.map((h) => {
      let truncated = 0;
      const examples: {
        text: string;
        visibleTextWidth: number;
        cellClientWidth: number;
        overflowScrollWidth: number | null;
        overflowClientWidth: number | null;
      }[] = [];
      const samples: { text: string; visibleTextWidth: number; cellClientWidth: number }[] = [];
      for (const row of rows) {
        const cell = row.querySelector(`[role="gridcell"][aria-colindex="${h.colindex}"]`);
        if (cell === null) continue;
        const visible = visibleText(cell);
        const style = getComputedStyle(cell);
        const content =
          cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const overflowing = [cell, ...cell.querySelectorAll('*')].find(
          (el) => !hidden(el) && el.scrollWidth > el.clientWidth,
        );
        // Either a visible box says it clips, or the visible glyphs are wider than the cell shows.
        const isTruncated = overflowing !== undefined || visible.width > content + 1;
        if (samples.length < 3) {
          samples.push({
            text: visible.text.slice(0, 60),
            visibleTextWidth: visible.width,
            cellClientWidth: cell.clientWidth,
          });
        }
        if (!isTruncated) continue;
        truncated += 1;
        if (examples.length < 3) {
          examples.push({
            text: visible.text.slice(0, 60),
            visibleTextWidth: visible.width,
            cellClientWidth: cell.clientWidth,
            overflowScrollWidth: overflowing?.scrollWidth ?? null,
            overflowClientWidth: overflowing?.clientWidth ?? null,
          });
        }
      }
      return {
        label: h.label,
        headerWidth: h.width,
        cells: rows.length,
        truncated,
        examples,
        samples,
      };
    });
    return { mountedRows: rows.length, columns };
  });
}

/** The boxes (b) and (c) compare: scroller, pinned block, and the chart header. */
async function boxes(page: Page): Promise<{
  scrollerClient: number;
  scrollerScroll: number;
  pinnedWidth: number;
  chartHeaderWidth: number;
  chartHeaderLeft: number;
  scrollerLeft: number;
  scrollerRight: number;
  scrollLeft: number;
}> {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="gantt-scroll"]');
    const grid = document.querySelector('[role="treegrid"]');
    if (scroller === null || grid === null) throw new Error('no scroller / treegrid');
    const headerCells = [...grid.querySelectorAll('[role="columnheader"]')];
    // The Timeline header's text includes its ruler labels ("TimelineFeb 2026…"), so match by prefix.
    const timeline = headerCells.find((h) => (h.textContent ?? '').trim().startsWith('Timeline'));
    const firstHeader = headerCells[0];
    if (timeline === undefined || firstHeader === undefined || firstHeader.parentElement === null) {
      throw new Error(
        `no header row: ${headerCells.length} columnheaders, texts ${JSON.stringify(
          headerCells.map((h) => (h.textContent ?? '').trim().slice(0, 30)),
        )}, first parent class ${firstHeader?.parentElement?.className ?? 'none'}`,
      );
    }
    const s = scroller.getBoundingClientRect();
    return {
      scrollerClient: scroller.clientWidth,
      scrollerScroll: scroller.scrollWidth,
      // The header row's pinned wrapper is the first column header's parent — it is given the pane
      // width, so it is what `gridWidth` actually rendered as.
      pinnedWidth: Math.round(firstHeader.parentElement.getBoundingClientRect().width),
      chartHeaderWidth: Math.round(timeline.getBoundingClientRect().width),
      chartHeaderLeft: Math.round(timeline.getBoundingClientRect().left),
      scrollerLeft: Math.round(s.left),
      scrollerRight: Math.round(s.right),
      scrollLeft: scroller.scrollLeft,
    };
  });
}

async function chooseZoom(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('radio', { name }).check();
  await page.keyboard.press('Escape');
}

async function dragSeparatorBy(
  page: Page,
  dx: number,
): Promise<{ moved: boolean; before: number; after: number }> {
  const sep = page.getByRole('separator', { name: 'Grid width' });
  const before = Number(await sep.getAttribute('aria-valuenow'));
  const box = await sep.boundingBox();
  if (box === null) throw new Error('Grid width separator has no box');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 12 });
  await page.mouse.up();
  const after = Number(await sep.getAttribute('aria-valuenow'));
  return { moved: after !== before, before, after };
}

test('M1-T0 — Gantt column truncation, width model and touch, at 1646 / 1024 / 390', async ({
  page,
  browser,
}) => {
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1646, height: 1097 });

  const orgSlug = await onboard(page, Date.now());
  await createClient(page, 'Northgate');
  await createProject(page, 'Riverside');
  await createPlan(page, 'Programme');
  await startEditing(page);
  await seedStructuredPlan(page, orgSlug);

  const setup: Setup = {
    origin: new URL(page.url()).origin,
    planPath: new URL(page.url()).pathname,
    storageState: await page.context().storageState(),
  };

  const results: Record<string, unknown> = {};

  for (const width of WIDTHS) {
    const at = `${width}`;

    // (a) Default widths, once with Predecessors hidden (the shipped default) and once shown.
    results[`a@${at}`] = await limb(async () => {
      const out: Record<string, unknown> = {};
      for (const [variant, query] of [
        ['default (Predecessors hidden)', ''],
        ['Predecessors shown', '&ghide=none'],
      ] as const) {
        const { context, page: p } = await openFresh(browser, setup, width, query);
        try {
          out[variant] = await truncation(p);
        } finally {
          await context.close();
        }
      }
      return out;
    });

    // (b) The assumed bar region versus the real one, before and after a Grid width drag.
    results[`b@${at}`] = await limb(async () => {
      const { context, page: p } = await openFresh(browser, setup, width, '');
      try {
        const before = await boxes(p);
        // `barRegionWidth = scroller.clientWidth - GRID_WIDTH`, and GRID_WIDTH is the column sum,
        // which is exactly the pane's pre-drag (derived default) width.
        const assumedBarRegion = before.scrollerClient - before.pinnedWidth;

        const zoom: Record<string, unknown> = {};
        zoom['quarterBeforeDrag'] = await limb(async () => {
          await chooseZoom(p, /^Quarter/);
          return (await boxes(p)).chartHeaderWidth;
        });
        await limb(() => chooseZoom(p, /^Month/));

        const drag = await dragSeparatorBy(p, 120);
        const after = await boxes(p);
        const actualBarRegion = after.scrollerClient - after.pinnedWidth;

        zoom['monthAfterDrag'] = after.chartHeaderWidth;
        await limb(() => chooseZoom(p, /^Quarter/));
        zoom['quarterAfterDrag'] = await limb(async () => (await boxes(p)).chartHeaderWidth);

        return {
          drag,
          before,
          after,
          assumedBarRegion,
          actualBarRegionAfterDrag: actualBarRegion,
          assumedMinusActualPx: assumedBarRegion - actualBarRegion,
          chartHeaderWidthChangedByDrag: after.chartHeaderWidth !== before.chartHeaderWidth,
          zoom,
        };
      } finally {
        await context.close();
      }
    });

    // (c) What the Gantt does when the fixed columns exceed the scroller.
    results[`c@${at}`] = await limb(async () => {
      const { context, page: p } = await openFresh(browser, setup, width, '');
      try {
        const atStart = await boxes(p);
        const horizontalOverflow = await p.evaluate(() => ({
          documentScrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        await p.evaluate(() => {
          const s = document.querySelector('[data-testid="gantt-scroll"]');
          if (s !== null) s.scrollLeft = s.scrollWidth;
        });
        const atEnd = await boxes(p);
        // The chart's visible px: what is left of the scroller to the right of the sticky pinned block.
        const visibleChart = (b: typeof atStart): number =>
          Math.max(
            0,
            b.scrollerRight - Math.max(b.chartHeaderLeft, b.scrollerLeft + b.pinnedWidth),
          );
        return {
          atStart,
          atEnd,
          horizontalOverflow,
          pinnedExceedsScroller: atStart.pinnedWidth >= atStart.scrollerClient,
          visibleChartPxAtStart: visibleChart(atStart),
          visibleChartPxAtMaxScroll: visibleChart(atEnd),
        };
      } finally {
        await context.close();
      }
    });

    // (d) Touch: Chromium touch emulation through CDP, in a touch-enabled mobile context.
    results[`d@${at}`] = await limb(async () => {
      const { context, page: p } = await openFresh(browser, setup, width, '', { touch: true });
      try {
        const sep = p.getByRole('separator', { name: 'Grid width' });
        const box = await sep.boundingBox();
        if (box === null) throw new Error('Grid width separator has no box');
        const touchAction = await sep.evaluate((el) => getComputedStyle(el).touchAction);
        const inViewport = box.x >= 0 && box.x + box.width <= width;
        const before = Number(await sep.getAttribute('aria-valuenow'));
        await sep.evaluate((el) => {
          const w = window as unknown as { __pe: string[] };
          w.__pe = [];
          for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
            el.addEventListener(type, () => w.__pe.push(type));
          }
        });
        if (!inViewport) {
          return {
            moved: false,
            reason: 'separator is outside the viewport at this width, so there is nothing to touch',
            box,
            touchAction,
            before,
          };
        }
        const cdp = await context.newCDPSession(p);
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let step = 1; step <= 12; step += 1) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x + step * 6, y }],
          });
          await p.waitForTimeout(16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await p.waitForTimeout(100);
        const after = Number(await sep.getAttribute('aria-valuenow'));
        const events = await p.evaluate(() => (window as unknown as { __pe: string[] }).__pe);
        const tally: Record<string, number> = {};
        for (const e of events) tally[e] = (tally[e] ?? 0) + 1;
        return {
          moved: after !== before,
          before,
          after,
          touchAction,
          pointerEvents: tally,
        };
      } finally {
        await context.close();
      }
    });
  }

  const path = writeMeasurement('gantt-column-truncation', {
    fixture: {
      seededVia:
        'REST API in this spec (10 activities, 15-character codes, up to 3 predecessors each)',
      activities: ACTIVITY_COUNT,
      codeExample: codeFor(3),
    },
    widths: WIDTHS,
    results,
  });
  test.info().annotations.push({ type: 'measurement', description: path });

  mkdirSync('measure-output', { recursive: true });
  writeFileSync('measure-output/gantt-column-truncation.md', summarise(results));
  // The harness is read at the terminal by whoever ran it; the JSON is the record.
  // eslint-disable-next-line no-console
  console.log(summarise(results));
});

function isError(v: unknown): v is LimbError {
  return typeof v === 'object' && v !== null && 'error' in v;
}

/** A short, human-readable reading of the JSON — figures only, no verdicts. */
function summarise(results: Record<string, unknown>): string {
  const lines: string[] = ['# Gantt column truncation — M1-T0 readings', ''];
  for (const width of WIDTHS) {
    lines.push(`## ${width} px`, '');

    const a = results[`a@${width}`];
    lines.push('### (a) Truncated cells at default widths');
    if (isError(a)) lines.push(`- error: ${a.error}`);
    else {
      for (const [variant, data] of Object.entries(a as Record<string, unknown>)) {
        const d = data as {
          mountedRows: number;
          columns: {
            label: string;
            truncated: number;
            cells: number;
            examples: Sample[];
            samples: Sample[];
          }[];
        };
        lines.push(`- ${variant} (${d.mountedRows} rows)`);
        for (const c of d.columns) {
          const first = c.examples[0] ?? c.samples[0];
          const ex =
            first === undefined
              ? ''
              : ` e.g. "${first.text}" visible ${first.visibleTextWidth} px in a ${first.cellClientWidth} px cell`;
          lines.push(`  - ${c.label}: ${c.truncated}/${c.cells} truncated${ex}`);
        }
      }
    }

    const b = results[`b@${width}`] as Record<string, unknown> | LimbError | undefined;
    lines.push('', '### (b) barRegionWidth versus the real chart after a drag');
    if (b === undefined || isError(b))
      lines.push(`- error: ${b === undefined ? 'missing' : b.error}`);
    else {
      lines.push(
        `- drag: ${JSON.stringify(b['drag'])}`,
        `- assumed bar region ${String(b['assumedBarRegion'])} px, actual after drag ${String(b['actualBarRegionAfterDrag'])} px (difference ${String(b['assumedMinusActualPx'])})`,
        `- chart header width changed by the drag: ${String(b['chartHeaderWidthChangedByDrag'])}`,
        `- zoom (chart header px): ${JSON.stringify(b['zoom'])}`,
      );
    }

    const c = results[`c@${width}`] as Record<string, unknown> | LimbError | undefined;
    lines.push('', '### (c) Fixed columns against the scroller');
    if (c === undefined || isError(c))
      lines.push(`- error: ${c === undefined ? 'missing' : c.error}`);
    else {
      lines.push(
        `- pinned block exceeds the scroller: ${String(c['pinnedExceedsScroller'])}`,
        `- document overflow: ${JSON.stringify(c['horizontalOverflow'])}`,
        `- visible chart px at start ${String(c['visibleChartPxAtStart'])}, at max scroll ${String(c['visibleChartPxAtMaxScroll'])}`,
      );
    }

    const d = results[`d@${width}`] as Record<string, unknown> | LimbError | undefined;
    lines.push('', '### (d) Touch drag of the Grid width separator');
    if (d === undefined || isError(d))
      lines.push(`- error: ${d === undefined ? 'missing' : d.error}`);
    else lines.push(`- ${JSON.stringify(d)}`);
    lines.push('');
  }
  return lines.join('\n');
}
