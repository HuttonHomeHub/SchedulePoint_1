import { expect, type Page, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  linkActivities,
  newPlan,
  openPlanId,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';
/**
 * **Toolbar redesign, M3: read the window below 1024 wide on the surface that now exists**
 * (`docs/specs/toolbar-redesign/implementation-plan.md` M3; the record is `m3-measurement.md`).
 *
 * #471's five cells (640 × 480, 640 × 360, 640 × 300, 320 × 720, 320 × 256), the two short-but-wide
 * windows CQ-3 keeps on two rows (1280 × 600, 1366 × 768), the 700 × 900 and 640 × 844 windows the
 * narrow-shell journey reads, and 1280 × 800 at text-only 200 % (the browser's default font size
 * through `Page.setFontSizes`, so rem media queries answer; a CSS `html { font-size }` would not).
 * Every cell on both pointers. For each: the header, the band, `<main>`'s top, the deck's scrolling
 * line (its overflow, its rows' tops, the edge fade's computed widths) and whether Expand is under
 * a pointer — at rest, and after scrolling it into view, because below the squat height the band
 * scrolls away and Expand is a scroll away by design.
 *
 * Then the selection bar at 1024 × 600 now that Float paths is icon-only (dddb5bb): its width, its
 * lines and the foot row's height.
 *
 * A harness, not a gate (ADR-0081 §3). Run: `PLAYWRIGHT_CHROMIUM_PATH=... pnpm --filter @repo/web
 * measure:toolbar -- toolbar-redesign-m3` against an already running API and web server
 * (`PLAYWRIGHT_SKIP_WEBSERVER=1`, `E2E_BASE_URL`).
 */

interface Cell {
  label: string;
  w: number;
  h: number;
  /** Browser default font size multiplier (`Page.setFontSizes`), 1 = 16 px. */
  text?: 2;
}

const CELLS: readonly Cell[] = [
  { label: '640x480', w: 640, h: 480 },
  { label: '640x360', w: 640, h: 360 },
  { label: '640x300', w: 640, h: 300 },
  { label: '320x720', w: 320, h: 720 },
  { label: '320x256', w: 320, h: 256 },
  { label: '700x900', w: 700, h: 900 },
  { label: '640x844', w: 640, h: 844 },
  { label: '1280x600', w: 1280, h: 600 },
  { label: '1366x768', w: 1366, h: 768 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1280x800 text-only 200%', w: 1280, h: 800, text: 2 },
];

const PASSWORD = 'correct-horse-battery';

type Reading = Record<string, unknown>;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[m3 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

/** The in-page reader. Self-contained (Playwright serialises it). */
function readShell(): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const q = <T extends Element = HTMLElement>(sel: string): T | null =>
    document.querySelector<T>(sel);
  const header = q('header');
  const band = q('[data-surface="chrome"]:not([data-activities-bar])');
  const main = q('main');
  const deck = q('[role="toolbar"][aria-label="Plan commands"]');
  const foot = q('[data-activities-bar]');
  const shell = main?.parentElement ?? null;
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const hit = (el: Element | null): boolean | null => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
    const top = document.elementFromPoint(cx, cy);
    return top !== null && (top === el || el.contains(top));
  };
  const expand = q('button[aria-label="Expand activities panel"]');
  const controls = deck
    ? [...deck.querySelectorAll<HTMLElement>('[data-toolbar-focusable]')].map((e) => ({
        id: e.getAttribute('data-toolbar-item'),
        rect: e.getBoundingClientRect(),
      }))
    : [];
  const tops = [...new Set(controls.map((c) => Math.round(c.rect.top / 4) * 4))];
  const deckCs = deck ? getComputedStyle(deck) : null;
  const cut = deck
    ? controls.filter((c) => {
        const d = deck.getBoundingClientRect();
        return c.rect.left < d.right && c.rect.right > d.right;
      }).length
    : null;
  return {
    viewport: { w: innerWidth, h: innerHeight },
    remW: r(innerWidth / rootPx),
    remH: r(innerHeight / rootPx),
    rootPx,
    squat: matchMedia('(width < 64rem) and (height <= 26rem)').matches,
    pointer: matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
    headerH: header ? r(header.getBoundingClientRect().height) : null,
    bandH: band ? r(band.getBoundingClientRect().height) : null,
    bandShare: band ? r((band.getBoundingClientRect().height / innerHeight) * 100) : null,
    mainTop: main ? r(main.getBoundingClientRect().top) : null,
    mainH: main ? r(main.getBoundingClientRect().height) : null,
    shellScroll: shell
      ? { scrollH: shell.scrollHeight, clientH: shell.clientHeight, scrollTop: shell.scrollTop }
      : null,
    shellW: shell
      ? { scrollW: shell.scrollWidth, clientW: shell.clientWidth, scrollLeft: shell.scrollLeft }
      : null,
    // Anything outside the deck laid out past the window's right edge: the unreachable-control
    // reading that found Edit plan details at x = 322 in a 320 px window.
    pastRightEdge: [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((e) => {
        const b = e.getBoundingClientRect();
        return b.left >= innerWidth - 1 && b.width > 0 && !e.closest('[role="status"]');
      })
      .slice(0, 6)
      .map((e) => {
        const b = e.getBoundingClientRect();
        const owner = e.closest('[aria-label]')?.getAttribute('aria-label') ?? '?';
        return `${e.tagName} in "${owner}" ${(e.textContent ?? '').trim().slice(0, 30)} x=${String(Math.round(b.left))}`;
      }),
    docScroll: { scrollH: document.documentElement.scrollHeight, h: innerHeight },
    deck: deck
      ? {
          h: r(deck.getBoundingClientRect().height),
          clientW: deck.clientWidth,
          scrollW: deck.scrollWidth,
          overflows: deck.scrollWidth > deck.clientWidth,
          lineTops: tops.length,
          controls: controls.length,
          halfClippedAtEnd: cut,
          overflowX: deckCs?.overflowX,
          maskImage: deckCs ? deckCs.maskImage.slice(0, 80) : null,
          fadeStart: deckCs?.getPropertyValue('--deck-fade-start') ?? null,
          fadeEnd: deckCs?.getPropertyValue('--deck-fade-end') ?? null,
        }
      : null,
    footH: foot ? r(foot.getBoundingClientRect().height) : null,
    expand: expand ? { top: r(expand.getBoundingClientRect().top), hittable: hit(expand) } : null,
  };
}

async function assertPointer(page: Page, expected: 'coarse' | 'fine'): Promise<void> {
  const actual = await page.evaluate(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
  );
  if (actual !== expected)
    throw new Error(`asked for a ${expected} pointer, page reports ${actual}`);
}

async function waitDeck(page: Page): Promise<void> {
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(700);
}

async function setFont(page: Page, scale: 1 | 2): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Page.setFontSizes', {
    fontSizes: {
      standard: 16 * scale,
      fixed: 13 * scale,
      serif: 16 * scale,
      sansSerif: 16 * scale,
    },
  } as never);
  await cdp.detach();
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`toolbar-redesign M3 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M3 readings, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(1_800_000);
      const name = `toolbar-redesign-m3.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = { pointer, cells: [] as Reading[] };
      const cells = record.cells as Reading[];
      const save = (): void => {
        writeMeasurement(name, record);
      };

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);

      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto('/sign-up');
      await page.getByLabel('Full name').fill('Chrome Tester');
      await page.getByLabel('Email').fill(`chrome-${stamp}@example.com`);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /create an account/i }).click();
      await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel('Organisation name').fill(`Chrome Co ${stamp}`);
      await page.getByRole('button', { name: /create organisation/i }).click();
      const orgSlug = `chrome-co-${stamp}`;
      await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
      await assertPointer(page, pointer);

      await createHierarchy(page);
      await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
      openPlanId(page);
      await ensurePen(page);
      const seeded = await seedActivities(page, orgSlug, [
        { name: 'Site setup', laneIndex: 0, durationDays: 12 },
        { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
        { name: 'Pour slab', laneIndex: 2, durationDays: 6 },
      ]);
      const [s0, s1] = seeded;
      if (!s0 || !s1) throw new Error('seed too short');
      await linkActivities(page, orgSlug, s0.id, s1.id);
      await recalculate(page, orgSlug);
      const planUrl = page.url();
      log('fixture ready');

      for (const scale of [1, 2] as const) {
        const list = CELLS.filter((c) => (c.text ?? 1) === scale);
        await setFont(page, scale);
        for (const c of list) {
          await page.setViewportSize({ width: c.w, height: c.h });
          await page.goto(planUrl);
          await waitDeck(page);
          const at = await page.evaluate(readShell);
          // Below the squat height Expand is a scroll away by design: scroll it into view and read
          // again, which is what a planner does.
          const expand = page.getByRole('button', { name: 'Expand activities panel' });
          await expand.scrollIntoViewIfNeeded().catch(() => undefined);
          await page.waitForTimeout(300);
          const scrolled = await page.evaluate(readShell);
          log(`${c.label}: band ${String((at as { bandH: number }).bandH)}`);
          cells.push({ cell: c.label, atRest: at, afterScrollingExpandIntoView: scrolled });
          save();
        }
      }
      await setFont(page, 1);

      // ---- the selection bar at the floor ----------------------------------------------------
      await page.setViewportSize({ width: 1024, height: 600 });
      await page.goto(planUrl);
      await waitDeck(page);
      await page.getByRole('listbox', { name: 'Activities in the diagram' }).focus();
      await expect(page.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
      await page.waitForTimeout(500);
      record.selectionBar1024x600 = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>(
          '[role="toolbar"][aria-label^="Actions for"]',
        );
        const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
        const canvas = document.querySelector('canvas');
        if (!bar) return { present: false };
        const items = [...bar.querySelectorAll<HTMLElement>('button, [role="button"]')].filter(
          (e) => e.getBoundingClientRect().width > 1,
        );
        const tops = [
          ...new Set(items.map((e) => Math.round(e.getBoundingClientRect().top / 4) * 4)),
        ];
        const fp = bar.querySelector<HTMLElement>(
          '[data-toolbar-item="float-paths"], [aria-label*="Float"]',
        );
        return {
          present: true,
          barW: bar.getBoundingClientRect().width,
          barH: bar.getBoundingClientRect().height,
          lines: tops.length,
          items: items.length,
          floatPathsW: fp ? fp.getBoundingClientRect().width : null,
          footH: foot ? foot.getBoundingClientRect().height : null,
          canvasH: canvas ? canvas.getBoundingClientRect().height : null,
          scrollW: bar.scrollWidth,
          clientW: bar.clientWidth,
        };
      });
      save();
      expect(cells.length).toBeGreaterThan(0);
    });
  });
}
