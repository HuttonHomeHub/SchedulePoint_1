import { type CDPSession, expect, type Page, test } from '@playwright/test';

import { ganttRow, showGantt } from '../e2e-gantt/support';
import {
  createHierarchy,
  diagramList,
  ensurePen,
  linkActivities,
  newPlan,
  placeViaApi,
  placements,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Selection bar fit, M0: measure the problem and the candidates** (`docs/specs/selection-bar-fit/
 * m0-measurement.md`). It reads the shipped bar and the dock outlet in every cell and state, and
 * re-reads the same page with each candidate applied as a temporary injected style (never a code
 * patch), so the baseline and every candidate see identical layout inputs.
 *
 * - **C1** caps both outlet floors at the row: `min(18rem, 100%)`, `min(36rem, 100%)`.
 * - **C2** extends the `data-dock-wide` floor to fine pointers at 30, 36 and 40 rem (capped).
 * - **C3** renders the Activity-actions group before the Find group (CSS `order`; this stands in
 *   for `Toolbar`'s `groupOrder`, so it measures LINES and POSITIONS, not the roving order).
 *
 * A harness, not a gate (ADR-0081 §3). It bypasses nothing but the candidate styles.
 */

interface Cell {
  label: string;
  w: number;
  h: number;
  dpr?: number;
}

const CELLS: readonly Cell[] = [
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1646x1097', w: 1646, h: 1097 },
  { label: '1912x948', w: 1912, h: 948 },
];

const PASSWORD = 'correct-horse-battery';
const PHOTOS = '../../docs/specs/selection-bar-fit/photos';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[selection-bar-fit m0 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

type Reading = Record<string, unknown>;

/**
 * The in-page reader. Self-contained (Playwright serialises it). `variants` is the list of
 * candidate styles to apply one after another; each is removed before the next.
 */
function readBar(variants: readonly string[]): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const isVisible = (el: Element): boolean => {
    const b = el.getBoundingClientRect();
    if (b.width <= 1.5 || b.height <= 1.5) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  };
  const cluster = (values: number[], tol = 4): number[] => {
    const sorted = [...values].sort((a, b) => a - b);
    const lines: number[] = [];
    for (const v of sorted) {
      const last = lines[lines.length - 1];
      if (last === undefined || v - last > tol) lines.push(v);
    }
    return lines;
  };
  const bar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label^="Actions for"]');
  if (!bar) return { bar: null };
  const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
  const canvas = document.querySelector('canvas');
  const ruler = document.querySelector('[data-testid="tsld-ruler"]');
  const grid = document.querySelector('[role="treegrid"]');
  bar.scrollIntoView({ block: 'center' });
  const coarse = matchMedia('(pointer: coarse)').matches;

  // The outlet is the foot row's wrapping flex-1 child that holds the bar.
  let outlet: HTMLElement | null = bar;
  while (outlet && !(outlet.className.includes('flex-1') && outlet.className.includes('flex-wrap')))
    outlet = outlet.parentElement;
  if (outlet) outlet.setAttribute('data-sbf-outlet', '');

  const CSS: Record<string, string> = {
    base: '',
    c1: `[data-sbf-outlet]{min-width:min(18rem,100%)!important}
@media (min-width:40rem) and (pointer:coarse){[data-sbf-outlet]:has([data-dock-wide]){min-width:min(36rem,100%)!important}}`,
    c2_30: `@media (min-width:40rem){[data-sbf-outlet]:has([data-dock-wide]){min-width:min(30rem,100%)!important}}`,
    c2_36: `@media (min-width:40rem){[data-sbf-outlet]:has([data-dock-wide]){min-width:min(36rem,100%)!important}}`,
    c2_40: `@media (min-width:40rem){[data-sbf-outlet]:has([data-dock-wide]){min-width:min(40rem,100%)!important}}`,
  };

  const groupsOf = (): HTMLElement[] =>
    [...bar.children].filter((e): e is HTMLElement => e instanceof HTMLElement);
  const reorder = (on: boolean): void => {
    for (const g of groupsOf()) {
      const objectGroup = g.querySelector('[data-toolbar-item="open-logic"]') !== null;
      g.style.order = on ? (objectGroup ? '0' : '1') : '';
    }
  };

  const snapshot = (): Reading => {
    const items = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter(isVisible);
    const tops = cluster(items.map((e) => e.getBoundingClientRect().top));
    const bb = bar.getBoundingClientRect();
    const canvasH = canvas ? canvas.getBoundingClientRect().height : 0;
    const rulerH = ruler ? ruler.getBoundingClientRect().height : 0;
    const wrapper = bar.closest<HTMLElement>('[data-dock-wide]');
    const caption = wrapper?.querySelector<HTMLElement>('[data-conflict-reason]') ?? null;
    const remedy = bar.querySelector<HTMLElement>('[data-toolbar-item="conflict-remedy"]');
    const firstTop = tops[0] ?? 0;
    const outsideViewport: string[] = [];
    const obscured: string[] = [];
    for (const e of items) {
      const b = e.getBoundingClientRect();
      const id = e.getAttribute('data-toolbar-item') ?? '?';
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) {
        outsideViewport.push(id);
        continue;
      }
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !e.contains(hit)) obscured.push(id);
    }
    // The first item, in document order, that is clipped either way.
    const clippedIds = items
      .map((e) => e.getAttribute('data-toolbar-item') ?? '?')
      .filter((id) => outsideViewport.includes(id) || obscured.includes(id));
    const stops = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')]
      .filter((e) => e.tabIndex === 0)
      .map((e) => e.getAttribute('data-toolbar-item'));
    const outletCs = outlet ? getComputedStyle(outlet) : null;
    return {
      lines: tops.length,
      itemCount: items.length,
      order: items.map((e) => e.getAttribute('data-toolbar-item')),
      barH: r(bb.height),
      barW: r(bb.width),
      captionH: caption ? r(caption.getBoundingClientRect().height) : null,
      captionBottom: caption ? r(caption.getBoundingClientRect().bottom) : null,
      remedyTop: remedy ? r(remedy.getBoundingClientRect().top) : null,
      firstLineTop: r(firstTop),
      remedyOnFirstLine: remedy
        ? Math.abs(remedy.getBoundingClientRect().top - firstTop) < 4
        : null,
      remedyLineIndex: remedy
        ? tops.findIndex((t) => Math.abs(t - remedy.getBoundingClientRect().top) < 4)
        : null,
      firstTabStop: stops[0] ?? null,
      outletW: r(outlet?.getBoundingClientRect().width ?? 0),
      outletMinWidth: outletCs?.minWidth ?? null,
      footH: foot ? r(foot.getBoundingClientRect().height) : null,
      footW: foot ? r(foot.getBoundingClientRect().width) : null,
      footScrollW: foot ? foot.scrollWidth : null,
      canvasH: r(canvasH),
      gridH: grid ? r(grid.getBoundingClientRect().height) : null,
      rowsVisible: Math.floor(Math.max(0, canvasH - rulerH) / 60),
      triangles: bar.parentElement?.querySelectorAll('svg.lucide-triangle-alert').length ?? 0,
      outsideViewport,
      obscured,
      clippedCount: clippedIds.length,
      firstClipped: clippedIds[0] ?? null,
      docScrollW: document.documentElement.scrollWidth,
    };
  };

  const rootPx = getComputedStyle(document.documentElement).fontSize;
  const out: Reading = {
    coarse,
    rootFontSize: rootPx,
    smMatches: matchMedia('(min-width: 40rem)').matches,
    variants: {},
  };
  for (const v of variants) {
    const tag = document.createElement('style');
    tag.id = 'sbf-candidate';
    const base = v.startsWith('c3') ? v.slice(3) || 'base' : v;
    tag.textContent = CSS[base] ?? '';
    document.head.append(tag);
    reorder(v.startsWith('c3'));
    (out['variants'] as Record<string, Reading>)[v] = snapshot();
    reorder(false);
    tag.remove();
  }
  return out;
}

async function selectByName(page: Page, id: string): Promise<void> {
  await page.keyboard.press('Escape');
  await diagramList(page).focus();
  await page.waitForTimeout(150);
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
  const seen: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    seen.push(String(await selectedActivityId(page)).slice(-4));
    if ((await selectedActivityId(page)) !== id) await page.keyboard.press('ArrowDown');
    if ((await selectedActivityId(page)) === id) {
      await page.waitForTimeout(300);
      return;
    }
  }
  const options = await diagramList(page).evaluate((el) =>
    [...el.querySelectorAll('[role="option"]')].map((o) => o.id.slice(-4)),
  );
  throw new Error(
    `could not reach ${id.slice(-4)}; options ${options.join(',')}; seen ${seen.join(',')}`,
  );
}

async function patchActivity(
  page: Page,
  org: string,
  name: string,
  body: Record<string, unknown>,
): Promise<void> {
  const row = (await placements(page, org)).find((p) => p.name === name);
  if (!row) throw new Error(`no activity ${name}`);
  const failure = await page.evaluate(
    async ({
      o,
      id,
      version,
      patch,
    }: {
      o: string;
      id: string;
      version: number;
      patch: object;
    }) => {
      const res = await fetch(`/api/v1/organizations/${o}/activities/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...patch, version }),
      });
      return res.ok ? null : `${String(res.status)} ${await res.text()}`;
    },
    { o: org, id: row.id, version: row.version, patch: body },
  );
  if (failure !== null) throw new Error(`patch ${name}: ${failure}`);
}

const TARGETS = [
  { name: 'Plain', kind: 'unflagged, no placement' },
  { name: 'Sitework', kind: 'unflagged, with placement' },
  { name: 'Steel beam', kind: 'constraintViolated (route), no placement' },
  { name: 'Pour slab', kind: 'visualEarlierThanLogic (barAction), with placement' },
  { name: 'Roof', kind: 'visualLaterThanBound (route), with placement' },
  { name: 'Frame', kind: 'two flags (route first), with placement' },
] as const;

const ALL_VARIANTS = ['base', 'c1', 'c2_30', 'c2_36', 'c2_40', 'c3', 'c3:c1'] as const;

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`selection-bar-fit M0 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M0 readings, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(3_600_000);
      const name = `selection-bar-fit-m0.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = {
        pointer,
        diagram: [] as Reading[],
        text200: [] as Reading[],
        gantt: [] as Reading[],
      };
      const diagram = record['diagram'] as Reading[];
      const text200 = record['text200'] as Reading[];
      const gantt = record['gantt'] as Reading[];

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);

      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto('/sign-up');
      await page.getByLabel('Full name').fill('Fit Tester');
      await page.getByLabel('Email').fill(`fit-${stamp}@example.com`);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /create an account/i }).click();
      await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel('Organisation name').fill(`Fit Co ${stamp}`);
      await page.getByRole('button', { name: /create organisation/i }).click();
      const orgSlug = `fit-co-${stamp}`;
      await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
      await createHierarchy(page);
      await newPlan(page, 'Fit M0');
      await ensurePen(page);

      const seeded = await seedActivities(page, orgSlug, [
        { name: 'Excavate', laneIndex: 0 },
        { name: 'Pour slab', laneIndex: 1 },
        { name: 'Steel beam', laneIndex: 2 },
        { name: 'Frame', laneIndex: 3 },
        { name: 'Roof', laneIndex: 4 },
        { name: 'Sitework', laneIndex: 5 },
        { name: 'Plain', laneIndex: 6 },
      ]);
      const byName = new Map(seeded.map((s) => [s.name, s.id]));
      const id = (n: string): string => {
        const v = byName.get(n);
        if (!v) throw new Error(`no seeded ${n}`);
        return v;
      };
      await linkActivities(page, orgSlug, id('Excavate'), id('Pour slab'));
      await recalculate(page, orgSlug);
      await ensurePen(page);
      await placeViaApi(page, orgSlug, 'Pour slab', '2026-01-05');
      await patchActivity(page, orgSlug, 'Steel beam', {
        constraintType: 'MANDATORY_START',
        constraintDate: '2025-12-22',
      });
      await patchActivity(page, orgSlug, 'Frame', {
        constraintType: 'MANDATORY_START',
        constraintDate: '2025-12-22',
        visualStart: '2026-01-20',
      });
      await patchActivity(page, orgSlug, 'Roof', {
        constraintType: 'SNLT',
        constraintDate: '2026-01-06',
        visualStart: '2026-01-19',
      });
      await patchActivity(page, orgSlug, 'Sitework', { visualStart: '2026-02-02' });
      await recalculate(page, orgSlug);
      await ensurePen(page);
      const planUrl = page.url();

      // ── Part 1: every cell and state in the Diagram, base and every candidate ──────────────
      for (const cell of CELLS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(500);
        for (const t of TARGETS) {
          await selectByName(page, id(t.name));
          const reading = await page.evaluate(readBar, ALL_VARIANTS);
          if (
            ['1024x600', '1912x948'].includes(cell.label) &&
            ['Plain', 'Frame'].includes(t.name)
          ) {
            await page.screenshot({
              path: `${PHOTOS}/m0-diagram-${pointer}-${cell.label}-${t.name.replace(/ /g, '-')}.png`,
            });
          }
          diagram.push({ cell: cell.label, target: t.name, kind: t.kind, ...reading });
          log(`${pointer} diagram ${cell.label} ${t.name}`);
        }
        await page.keyboard.press('Escape');
        writeMeasurement(name, record);
      }

      // ── Part 2: 200 % text at 1024 x 600, by both routes ───────────────────────────────────
      const readRoot = (): Promise<string> =>
        page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      const routes = ['cdp-default-font', 'root-font-size'] as const;
      for (const route of routes) {
        await page.setViewportSize({ width: 1024, height: 600 });
        let cdp: CDPSession | null = null;
        if (route === 'cdp-default-font') {
          cdp = await page.context().newCDPSession(page);
          const apply = (): Promise<unknown> =>
            cdp!.send('Page.setFontSizes', {
              fontSizes: { standard: 32, fixed: 26, serif: 32, sansSerif: 32 },
            } as never);
          await apply();
          await page.goto(planUrl);
          if ((await readRoot()) !== '32px') {
            await apply();
            await page.reload();
          }
        } else {
          await page.goto(planUrl);
        }
        await page.waitForTimeout(800);
        await ensurePen(page);
        let root = await readRoot();
        log(`${pointer} text200 ${route} root=${root}`);
        for (const t of TARGETS.filter((x) => ['Plain', 'Pour slab', 'Frame'].includes(x.name))) {
          if (route === 'root-font-size') {
            // The listbox cannot take focus once the root is 200 % (the shell's band fills the window), so
            // the selection is made at 100 % and the root enlarged afterwards; the selection persists.
            await page.evaluate(() => {
              document.documentElement.style.fontSize = '';
            });
            await page.waitForTimeout(300);
            await selectByName(page, id(t.name));
            await page.evaluate(() => {
              document.documentElement.style.fontSize = '200%';
            });
            await page.setViewportSize({ width: 1030, height: 600 });
            await page.setViewportSize({ width: 1024, height: 600 });
            await page.waitForTimeout(600);
            root = await readRoot();
          } else {
            await selectByName(page, id(t.name));
          }
          const reading = await page.evaluate(readBar, ['base', 'c1', 'c3', 'c3:c1']);
          if (t.name === 'Frame') {
            await page.screenshot({ path: `${PHOTOS}/m0-text200-${pointer}-${route}-Frame.png` });
          }
          text200.push({ route, rootRead: root, target: t.name, ...reading });
        }
        await page.keyboard.press('Escape');
        writeMeasurement(name, record);
        if (cdp)
          await cdp.send('Page.setFontSizes', {
            fontSizes: { standard: 16, fixed: 13, serif: 16, sansSerif: 16 },
          } as never);
        if (cdp) await cdp.detach();
        await page.goto(planUrl);
      }

      // ── Part 3: the Gantt dock ─────────────────────────────────────────────────────────────
      await page.setViewportSize({ width: 1912, height: 948 });
      await page.goto(planUrl);
      await ensurePen(page);
      await showGantt(page);
      for (const cell of [CELLS[0]!, CELLS[1]!, CELLS[4]!]) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(500);
        for (const t of TARGETS.filter((x) => ['Plain', 'Steel beam', 'Frame'].includes(x.name))) {
          await ganttRow(page, t.name).click();
          await page.waitForTimeout(400);
          const reading = await page.evaluate(readBar, ['base', 'c3']);
          await page.screenshot({
            path: `${PHOTOS}/m0-gantt-${pointer}-${cell.label}-${t.name.replace(/ /g, '-')}.png`,
          });
          gantt.push({ cell: cell.label, target: t.name, kind: t.kind, ...reading });
          log(`${pointer} gantt ${cell.label} ${t.name}`);
        }
        writeMeasurement(name, record);
      }
      // ── Part 4: the M2 stop rule's sweep, 1024 to 1912 in 16 px steps, back in the Diagram ──
      const sweep = (record['sweep'] = [] as Reading[]);
      await page.getByRole('button', { name: 'Diagram', exact: true }).click();
      await page.setViewportSize({ width: 1024, height: 800 });
      await page.waitForTimeout(500);
      for (const t of TARGETS.filter((x) =>
        ['Plain', 'Sitework', 'Steel beam', 'Frame'].includes(x.name),
      )) {
        await selectByName(page, id(t.name));
        for (let w = 1024; w <= 1912; w += 16) {
          await page.setViewportSize({ width: w, height: 800 });
          await page.waitForTimeout(120);
          const reading = (await page.evaluate(readBar, ['base', 'c1', 'c2_30', 'c2_36'])) as {
            variants: Record<string, Reading>;
          };
          const row: Reading = { w, target: t.name };
          for (const [k, v] of Object.entries(reading.variants)) {
            row[k] = { lines: v['lines'], footH: v['footH'], outletW: v['outletW'] };
          }
          sweep.push(row);
        }
        log(`${pointer} sweep ${t.name}`);
        await page.setViewportSize({ width: 1024, height: 800 });
      }
      writeMeasurement(name, record);
      expect(diagram.length).toBeGreaterThan(0);
    });
  });
}
