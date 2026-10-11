import AxeBuilder from '@axe-core/playwright';
import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  expect,
  type Page,
  test,
} from '@playwright/test';

import { showActivities } from '../e2e/workspace';
import { onboard, openPlanId, recalculate, seedActivities } from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Accessibility and touch sweep, M0: the readings** (`docs/specs/a11y-touch-sweep/m0-measurement.md`).
 *
 * Predictions are in `m0-falsification.md`, written before this ran. A harness, not a gate
 * (ADR-0081 §3): it drives the real product in a real Chromium and writes JSON; nothing here asserts a
 * pass/fail on the product, only that the instrument itself worked (a coarse pointer is coarse, the
 * root font size moved).
 *
 * Four questions, one fixture:
 *
 * - **#470** activities table row heights and the select label's box, per pointer and cell, plus the
 *   row heights if the label were 44 px (a style injected for the reading, not a product change).
 * - **#476** for each divider: the current strip, and which neighbouring controls a 44 px strip would
 *   cover (geometry), and what `elementFromPoint` returns across the strip today.
 * - **#473** axe `region` on the overview, a list page and a plan, Explorer docked.
 * - **#483** header geometry with a long project and plan name at 100 %, the browser's own text size
 *   (CDP `Page.setFontSizes`, the repo's method) and the inline-root `200%` the register row used.
 */

const OUT = 'a11y-touch-sweep-m0';
const LONG_PROJECT = 'Riverside Quarter — Phase 2 Substructure';
const LONG_PLAN = 'Level 2 slab and core walls — Package B';

interface Fixture {
  orgSlug: string;
  planUrl: string;
  overviewUrl: string;
  listUrl: string;
  storage: Awaited<ReturnType<BrowserContext['storageState']>>;
}

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[a11y-sweep m0 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

const results: Record<string, unknown> = {};
let fixture: Fixture;

async function ack(context: BrowserContext): Promise<void> {
  await context.addInitScript((key: string) => {
    window.localStorage.setItem(key, '1');
  }, VIEWPORT_NOTICE_ACK_KEY);
}

async function build(browser: Browser): Promise<Fixture> {
  const context = await browser.newContext({ viewport: { width: 1646, height: 1097 } });
  await ack(context);
  const page = await context.newPage();
  const stamp = Date.now() + 11;
  const orgSlug = await onboard(page, stamp);

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(LONG_PROJECT);
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: LONG_PROJECT }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(LONG_PLAN);
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: LONG_PLAN, exact: true }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}/);

  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  const planId = openPlanId(page);
  await page.evaluate(
    async ({ org, id }) => {
      const url = `/api/v1/organizations/${org}/plans/${id}/activities`;
      const post = async (body: Record<string, unknown>): Promise<string> => {
        const r = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) throw new Error(`${String(body.name)}: ${r.status}`);
        return ((await r.json()) as { data: { id: string } }).data.id;
      };
      const parentId = await post({
        name: 'Substructure package',
        type: 'WBS_SUMMARY',
        laneIndex: 2,
      });
      await post({ name: 'Pour pile caps', type: 'TASK', durationDays: 6, laneIndex: 3, parentId });
    },
    { org: orgSlug, id: planId },
  );
  await recalculate(page, orgSlug);
  const planUrl = page.url();
  const storage = await context.storageState();
  await context.close();
  return {
    orgSlug,
    planUrl,
    overviewUrl: `${new URL(planUrl).origin}/orgs/${orgSlug}`,
    listUrl: `${new URL(planUrl).origin}/orgs/${orgSlug}/clients`,
    storage,
  };
}

async function open(
  browser: Browser,
  opts: { w: number; h: number; coarse: boolean },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    storageState: fixture.storage,
    viewport: { width: opts.w, height: opts.h },
    hasTouch: opts.coarse,
  });
  await ack(context);
  const page = await context.newPage();
  await page.goto(fixture.planUrl);
  await expect(page.getByRole('button', { name: /Stop editing|Start editing/ })).toBeVisible({
    timeout: 30_000,
  });
  const pointer = await page.evaluate(() =>
    matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
  );
  expect(pointer, 'the instrument: the pointer is the one asked for').toBe(
    opts.coarse ? 'coarse' : 'fine',
  );
  return { context, page };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  clearMeasurement(OUT);
  fixture = await build(browser);
  log(`fixture built: ${fixture.planUrl}`);
});

test.afterAll(() => {
  const path = writeMeasurement(OUT, results);
  log(`wrote ${path}`);
});

// ---------------------------------------------------------------------------------------------
// #470: activities table rows
// ---------------------------------------------------------------------------------------------

function readRows(): unknown {
  const table = document.querySelector('table');
  if (!table) return { table: null };
  const r = (n: number): number => Math.round(n * 10) / 10;
  const rows = [...table.querySelectorAll('tbody tr')]
    .filter((tr) => tr.getAttribute('aria-hidden') !== 'true')
    .map((tr) => {
      const label = tr.querySelector<HTMLElement>('label');
      const box = label?.getBoundingClientRect();
      return {
        name:
          tr.querySelector('input[type="checkbox"]')?.getAttribute('aria-label') ?? '(no checkbox)',
        height: r(tr.getBoundingClientRect().height),
        hasMenu: tr.querySelector('[aria-haspopup="menu"]') !== null,
        hasCheckbox: tr.querySelector('input[type="checkbox"]') !== null,
        label: box ? { w: r(box.width), h: r(box.height) } : null,
      };
    });
  const head = table.querySelector<HTMLElement>('thead label')?.getBoundingClientRect();
  return {
    rows,
    headerLabel: head ? { w: r(head.width), h: r(head.height) } : null,
    headerRowHeight: r(table.querySelector('thead tr')?.getBoundingClientRect().height ?? 0),
  };
}

test('#470 activities rows and the select label, per pointer and cell', async ({ browser }) => {
  test.setTimeout(240_000);
  const cells = [
    { label: 'fine 1912x948', w: 1912, h: 948, coarse: false },
    { label: 'fine 1024x600', w: 1024, h: 600, coarse: false },
    { label: 'coarse 1912x1114', w: 1912, h: 1114, coarse: true },
    { label: 'coarse 1646x1097', w: 1646, h: 1097, coarse: true },
    { label: 'coarse 1024x600', w: 1024, h: 600, coarse: true },
  ];
  const out: Record<string, unknown> = {};
  for (const cell of cells) {
    const { context, page } = await open(browser, cell);
    await showActivities(page);
    await expect(page.locator('table tbody tr:has(input[type="checkbox"])').first()).toBeVisible();
    const before = await page.evaluate(readRows);
    // The cost, read: a 44 px label, injected for this reading only.
    await page.addStyleTag({
      content:
        'label:has(> input[type="checkbox"]) { width: 44px !important; height: 44px !important; }',
    });
    await page.waitForTimeout(300);
    const after = await page.evaluate(readRows);
    out[cell.label] = { before, withLabel44: after };
    log(`470 ${cell.label} done`);
    await context.close();
  }
  results.row470 = out;
});

// ---------------------------------------------------------------------------------------------
// #476: dividers
// ---------------------------------------------------------------------------------------------

interface DividerReading {
  name: string;
  orientation: string;
  sep: { x: number; y: number; w: number; h: number };
  hit: { x: number; y: number; w: number; h: number } | null;
  neighbours: {
    label: string;
    box: { x: number; y: number; w: number; h: number };
    overlapCurrentPx: number;
    overlapSym44Px: number;
    overlapOutwardLowPx: number;
    overlapOutwardHighPx: number;
    centreHitToday: string;
  }[];
  sweep: { at: string; offsets: string }[];
}

function readDivider(args: { name: string }): DividerReading | null {
  const sep = [...document.querySelectorAll<HTMLElement>('[role="separator"]')].find(
    (s) => s.getAttribute('aria-label') === args.name,
  );
  if (!sep) return null;
  const orientation = sep.getAttribute('aria-orientation') ?? '';
  const vertical = orientation === 'vertical';
  const rect = sep.getBoundingClientRect();
  const hitEl = sep.querySelector<HTMLElement>(':scope > span');
  const hitRect = hitEl?.getBoundingClientRect() ?? null;
  const box = (b: DOMRect): { x: number; y: number; w: number; h: number } => ({
    x: Math.round(b.left),
    y: Math.round(b.top),
    w: Math.round(b.width),
    h: Math.round(b.height),
  });
  // The divider's axis position (x for vertical, y for horizontal) and its extent along the line.
  const axis = vertical ? rect.left : rect.top;
  const lineFrom = vertical ? rect.top : rect.left;
  const lineTo = vertical ? rect.bottom : rect.right;
  const overlap = (b: DOMRect, from: number, to: number): number => {
    const lo = vertical ? b.left : b.top;
    const hi = vertical ? b.right : b.bottom;
    return Math.max(0, Math.min(hi, to) - Math.max(lo, from));
  };
  const describe = (el: Element | null): string => {
    if (!el) return '(nothing)';
    if (sep.contains(el)) return 'SEP';
    const interactive = el.closest(
      'button,a,input,select,textarea,[role="button"],[role="treeitem"],[role="columnheader"],[role="gridcell"],[role="row"]',
    );
    const t = interactive ?? el;
    const name = t.getAttribute('aria-label') ?? (t.textContent ?? '').trim().slice(0, 24);
    return `${t.tagName.toLowerCase()}${t.getAttribute('role') ? `[${t.getAttribute('role')}]` : ''} "${name}"`;
  };
  const neighbours: DividerReading['neighbours'] = [];
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(
      'button,a,input,select,textarea,[role="button"],[role="columnheader"],[role="tab"]',
    ),
  ];
  for (const el of candidates) {
    if (sep.contains(el) || el.getClientRects().length === 0) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    // Only those along the divider's line, and within 30 px of it across.
    const along = vertical ? [b.top, b.bottom] : [b.left, b.right];
    if (along[1]! < lineFrom || along[0]! > lineTo) continue;
    const near = overlap(b, axis - 30, axis + 30);
    if (near <= 0) continue;
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    neighbours.push({
      label: describe(el),
      box: box(b),
      overlapCurrentPx: Math.round(overlap(b, axis - 12.5, axis + 12.5) * 10) / 10,
      overlapSym44Px: Math.round(overlap(b, axis - 22, axis + 22) * 10) / 10,
      overlapOutwardLowPx: Math.round(overlap(b, axis - 44, axis) * 10) / 10,
      overlapOutwardHighPx: Math.round(overlap(b, axis, axis + 44) * 10) / 10,
      centreHitToday: hit === el || el.contains(hit) ? 'itself' : describe(hit),
    });
  }
  // What elementFromPoint returns across ±26 px at five positions along the line.
  const sweep: DividerReading['sweep'] = [];
  for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
    const along = lineFrom + (lineTo - lineFrom) * f;
    const runs: string[] = [];
    let last = '';
    let from = -26;
    for (let off = -26; off <= 26; off += 1) {
      const x = vertical ? axis + off : along;
      const y = vertical ? along : axis + off;
      const d = describe(document.elementFromPoint(x, y));
      if (d !== last) {
        if (last !== '') runs.push(`${from}..${off - 1}: ${last}`);
        last = d;
        from = off;
      }
    }
    runs.push(`${from}..26: ${last}`);
    sweep.push({ at: `${Math.round(f * 100)}% along`, offsets: runs.join(' | ') });
  }
  return {
    name: args.name,
    orientation,
    sep: box(rect),
    hit: hitRect ? box(hitRect) : null,
    neighbours,
    sweep,
  };
}

test('#476 the dividers: strip today, and what a 44 px strip would cover', async ({ browser }) => {
  test.setTimeout(240_000);
  const out: Record<string, unknown> = {};
  for (const cell of [
    { label: 'coarse 1646x1097', w: 1646, h: 1097 },
    { label: 'coarse 1024x600', w: 1024, h: 600 },
  ]) {
    const { context, page } = await open(browser, { ...cell, coarse: true });
    const readings: Record<string, unknown> = {};
    const read = async (name: string): Promise<void> => {
      readings[name] = await page.evaluate(readDivider, { name });
    };

    await read('Resize Project Explorer');
    await showActivities(page);
    await read('Resize activities panel');
    // The notes dock: Comments opens it.
    await page.locator('[data-toolbar-item="comments"]').first().click();
    await page.waitForTimeout(400);
    await read('Resize notes panel');
    await page.getByRole('button', { name: 'Close plan notes' }).click();
    // The Gantt grid divider.
    await page.getByRole('button', { name: 'Gantt', exact: true }).click();
    await expect(page.getByRole('treegrid', { name: 'Schedule as a bar chart' })).toBeVisible();
    await read('Grid width');
    out[cell.label] = readings;
    log(`476 ${cell.label} done`);
    await context.close();
  }
  results.dividers476 = out;
});

// ---------------------------------------------------------------------------------------------
// #473: axe region
// ---------------------------------------------------------------------------------------------

test('#473 axe region with the Explorer docked', async ({ browser }) => {
  test.setTimeout(240_000);
  const { context, page } = await open(browser, { w: 1646, h: 1097, coarse: false });
  const out: Record<string, unknown> = {};
  for (const [label, url] of [
    ['overview', fixture.overviewUrl],
    ['clients list', fixture.listUrl],
    ['plan', fixture.planUrl],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole('navigation', { name: 'Project Explorer' })).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(800);
    const axe = await new AxeBuilder({ page }).withRules(['region']).analyze();
    out[label] = axe.violations.flatMap((v) =>
      v.nodes.map((n) => ({ rule: v.id, target: n.target.join(' '), html: n.html.slice(0, 160) })),
    );
  }
  results.region473 = out;
  await context.close();
});

// ---------------------------------------------------------------------------------------------
// #483: the header at enlarged text
// ---------------------------------------------------------------------------------------------

function readHeader(): unknown {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const header = [...document.querySelectorAll('header')].find(
    (h) => h.getClientRects().length > 0,
  );
  if (!header) return { header: null };
  const nav = header.querySelector('nav[aria-label="Breadcrumb"]');
  const crumbs = nav
    ? [...nav.querySelectorAll('li')]
        .filter((li) => li.getAttribute('aria-hidden') !== 'true')
        .map((li) => {
          const inner = li.firstElementChild as HTMLElement | null;
          const lb = li.getBoundingClientRect();
          const ib = inner?.getBoundingClientRect();
          return {
            text: (li.textContent ?? '').trim().slice(0, 48),
            liW: r(lb.width),
            innerW: ib ? r(ib.width) : null,
            innerH: ib ? r(ib.height) : null,
            clipped: inner ? inner.scrollWidth > inner.clientWidth + 1 : null,
            fullTextW: inner ? r(inner.scrollWidth) : null,
          };
        })
    : [];
  const tops = [
    ...header.querySelectorAll('nav[aria-label="Breadcrumb"], [role="toolbar"], select, button, a'),
  ]
    .filter((e) => e.getClientRects().length > 0)
    .map((e) => e.getBoundingClientRect().top)
    .sort((a, b) => a - b);
  const lines: number[] = [];
  for (const t of tops) {
    const last = lines[lines.length - 1];
    if (last === undefined || t - last > 8) lines.push(t);
  }
  const bandRow = header.parentElement?.getBoundingClientRect();
  return {
    innerWidth,
    rootPx: getComputedStyle(document.documentElement).fontSize,
    lgOn: matchMedia('(min-width: 64rem)').matches,
    headerH: r(header.getBoundingClientRect().height),
    bandRowH: bandRow ? r(bandRow.height) : null,
    lines: lines.length,
    crumbs,
    pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1,
    breadcrumbH: nav ? r(nav.getBoundingClientRect().height) : null,
  };
}

async function setFontSizes(cdp: CDPSession, scale: 1 | 2): Promise<void> {
  await cdp.send('Page.setFontSizes', {
    fontSizes: {
      standard: 16 * scale,
      fixed: 13 * scale,
      serif: 16 * scale,
      sansSerif: 16 * scale,
    },
  } as never);
}

test('#483 header geometry: 100 %, the browser text size, and the inline-root 200 %', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const cells = [
    { label: '1024x600', w: 1024, h: 600 },
    { label: '1280x800', w: 1280, h: 800 },
    { label: '1440x900', w: 1440, h: 900 },
    { label: '1912x948', w: 1912, h: 948 },
  ];
  const out: Record<string, unknown> = {};
  for (const cell of cells) {
    for (const method of ['100pct', 'setFontSizes', 'inlineRoot'] as const) {
      const context = await browser.newContext({
        storageState: fixture.storage,
        viewport: { width: cell.w, height: cell.h },
      });
      await ack(context);
      const page = await context.newPage();
      let cdp: CDPSession | null = null;
      if (method === 'setFontSizes') {
        cdp = await context.newCDPSession(page);
        await setFontSizes(cdp, 2);
      }
      await page.goto(fixture.planUrl);
      await expect(page.locator('header nav[aria-label="Breadcrumb"]').first()).toBeVisible({
        timeout: 30_000,
      });
      if (method === 'setFontSizes' && cdp) {
        const root = (): Promise<string> =>
          page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
        if ((await root()) !== '32px') {
          await setFontSizes(cdp, 2);
          await page.reload();
          await expect(page.locator('header nav[aria-label="Breadcrumb"]').first()).toBeVisible();
        }
        expect(await root(), 'the instrument: setFontSizes moved the root to 32 px').toBe('32px');
      }
      if (method === 'inlineRoot') {
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '200%';
        });
      }
      await page.waitForTimeout(600);
      out[`${cell.label} ${method}`] = await page.evaluate(readHeader);
      log(`483 ${cell.label} ${method} done`);
      await context.close();
    }
  }
  results.header483 = out;
});
