import { expect, type Browser, type Page, test } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  linkActivities,
  newPlan,
  openPlanId,
  placements,
  placeViaApi,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';
/**
 * **Toolbar redesign, M5: the promoted forms' real widths, and the deck's unused width per stage**
 * (`docs/specs/toolbar-redesign/implementation-plan.md` M5; the record is `m5-measurement.md`).
 *
 * Two readings, both of the **real** deck:
 *
 * - **Widths** at 3840 × 1440, past the widest stage, so every entry that has a stage is on the bar:
 *   each item's rect is what `promotion-widths.<pointer>.json` records and what SC-18 (a) holds true
 *   (`e2e-workspace-fit/promotion.spec.ts` repeats this reading as a gate). Run with the ladder
 *   locally set to `PROMOTE_80` for every rank to read the forms that are `'never'` at a given pointer.
 * - **Unused width** per deck row at the four stage cells, in the base state and in the worst stress
 *   state (a cycling conflict read-out on LOOK, a peer's pen on DO): the SC-17 "after" table.
 *
 * A harness, not a gate (ADR-0081 §3). Run: `PLAYWRIGHT_CHROMIUM_PATH=... DATABASE_URL=... pnpm
 * --filter @repo/web measure:toolbar -- toolbar-redesign-m5` (the api and the web dev server are
 * reused when already up).
 */

interface Cell {
  label: string;
  w: number;
  h: number;
}

const CELLS: readonly Cell[] = [
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1912x1080', w: 1912, h: 1080 },
  { label: '2560x1440', w: 2560, h: 1440 },
];

/** Past the widest stage (160 rem = 2560 px), where every entry with a stage is on the bar. */
const WIDE: Cell = { label: '3840x1440', w: 3840, h: 1440 };

const PASSWORD = 'correct-horse-battery';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[m5 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

/**
 * Everything the page reports. Typed loosely on purpose: the JSON is the record.
 */
type Reading = Record<string, unknown>;

/** The in-page reader. **Self-contained** (Playwright serialises it), so every helper is inside. */
function readPage(): Reading {
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
  const deck = document.querySelector<HTMLElement>(
    '[role="toolbar"][aria-label="Plan commands"]:not([data-m0-clone])',
  );
  if (!deck) throw new Error('the deck was not found');

  const rows: Reading[] = [];
  for (const id of ['look', 'do']) {
    const row = deck.querySelector<HTMLElement>(`[data-deck-row="${id}"]`);
    if (!row) throw new Error(`deck row ${id} missing`);
    const rr = row.getBoundingClientRect();
    const controls = [...row.querySelectorAll('button, input, [data-toolbar-item]')].filter(
      isVisible,
    );
    const tops = cluster(
      controls
        .filter((c) => c.getBoundingClientRect().height >= 24)
        .map((c) => c.getBoundingClientRect().top),
    );
    const usedPerLine = tops.map((t) => {
      const onLine = controls.filter((c) => Math.abs(c.getBoundingClientRect().top - t) <= 4);
      return r(Math.max(...onLine.map((c) => c.getBoundingClientRect().right)) - rr.left);
    });
    const lastUsed = usedPerLine[usedPerLine.length - 1] ?? 0;
    rows.push({
      row: id,
      width: r(rr.width),
      lines: tops.length,
      usedPerLine,
      unusedLastLine: r(rr.width - lastUsed),
      unusedPct: r(((rr.width - lastUsed) / rr.width) * 100),
    });
  }

  /** Natural (nowrap, max-content) width per row, on a disposable clone so React's nodes stay. */
  const natural: Record<string, { natural: number; available: number }> = {};
  const avail: Record<string, number> = {};
  for (const id of ['look', 'do']) {
    const row = deck.querySelector(`[data-deck-row="${id}"]`);
    avail[id] = row ? row.getBoundingClientRect().width : 0;
  }
  const tmp = deck.cloneNode(true) as HTMLElement;
  tmp.setAttribute('data-m0-natural', '');
  deck.style.display = 'none';
  deck.after(tmp);
  tmp.querySelectorAll<HTMLElement>('.flex-wrap').forEach((e) => (e.style.flexWrap = 'nowrap'));
  tmp.querySelectorAll<HTMLElement>('[role="group"]').forEach((e) => (e.style.flexShrink = '0'));
  for (const id of ['look', 'do']) {
    const row = tmp.querySelector<HTMLElement>(`[data-deck-row="${id}"]`);
    if (!row) continue;
    row.style.width = 'max-content';
    row.style.alignSelf = 'flex-start';
    natural[id] = { natural: r(row.getBoundingClientRect().width), available: r(avail[id] ?? 0) };
  }
  tmp.remove();
  deck.style.display = '';

  const items = [...deck.querySelectorAll('[data-toolbar-item]')].filter(isVisible).map((el) => {
    const b = el.getBoundingClientRect();
    return {
      id: el.getAttribute('data-toolbar-item'),
      row: el.closest('[data-deck-row]')?.getAttribute('data-deck-row') ?? null,
      group: el.closest('[role="group"]')?.getAttribute('aria-label') ?? null,
      w: r(b.width),
      h: r(b.height),
      name: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
    };
  });
  return {
    viewport: { w: innerWidth, h: innerHeight },
    remW: r(innerWidth / parseFloat(getComputedStyle(document.documentElement).fontSize)),
    rows,
    natural,
    items,
  };
}

/** Marker facts that prove a stress state is the state it is named for. */
function readMarkers(): Reading {
  const q = (s: string): HTMLElement | null => document.querySelector<HTMLElement>(s);
  const pen = q('[data-toolbar-item="pen"]');
  const comments = q('[data-toolbar-item="comments"]');
  const nextConflict = q('[data-toolbar-item="next-conflict"]');
  const mode = ['view-tsld', 'view-gantt'].map(
    (id) => `${id}:${q(`[data-toolbar-item="${id}"]`)?.getAttribute('aria-pressed') ?? ''}`,
  );
  return {
    pen: pen ? (pen.getAttribute('aria-label') ?? pen.textContent ?? '').trim().slice(0, 60) : null,
    penAriaDisabled: pen?.getAttribute('aria-disabled') ?? null,
    selected: document.querySelectorAll('[role="option"][aria-selected="true"]').length,
    commentsPressed: comments?.getAttribute('aria-pressed') ?? null,
    conflictChip: q('[data-toolbar-item="next-conflict-status"]')?.textContent?.trim() ?? null,
    nextConflictDisabled: nextConflict?.getAttribute('aria-disabled') ?? null,
    minimapPressed: q('[data-toolbar-item="minimap"]')?.getAttribute('aria-pressed') ?? null,
    overview: [...document.querySelectorAll('span')].some(
      (s) => (s.textContent ?? '').trim() === 'Overview',
    ),
    hasCanvas: document.querySelector('canvas') !== null,
    mode,
  };
}

async function assertPointer(page: Page, expected: 'coarse' | 'fine'): Promise<void> {
  const actual = await page.evaluate(() =>
    window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
  );
  if (actual !== expected) {
    throw new Error(`asked for a ${expected} pointer, page reports ${actual}`);
  }
}

async function waitDeck(page: Page): Promise<void> {
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(700);
}

async function inviteAndSignUpPeer(
  a: Page,
  browser: Browser,
  stamp: number,
): Promise<{ b: Page; orgSlug: string }> {
  const orgSlug = `chrome-co-${stamp}`;
  await a.getByRole('link', { name: 'Members' }).click();
  await a.getByRole('button', { name: 'Invite member' }).click();
  const invite = a.getByRole('dialog');
  await invite.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await invite.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await invite.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await a.getByLabel('Invitation link').inputValue();
  await invite.getByRole('button', { name: 'Done' }).click();

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await b.goto('/sign-up');
  await b.getByLabel('Full name').fill('Peer Planner');
  await b.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await b.getByLabel('Password').fill(PASSWORD);
  await b.getByRole('button', { name: /create an account/i }).click();
  await expect(b.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await b.goto(acceptUrl);
  await b.getByRole('button', { name: /accept and join/i }).click();
  await expect(b).toHaveURL(/\/orgs\//);
  return { b, orgSlug };
}

async function peerTakesPen(b: Page, org: string, planId: string): Promise<void> {
  const res = await b.evaluate(
    async ({ o, p }: { o: string; p: string }) => {
      const url = `/api/v1/organizations/${o}/plans/${p}/edit-lock`;
      const r = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      // Keep the lease alive for the whole sweep: the peer has no page open on the plan.
      const w = window as unknown as { __m0hb?: number };
      if (w.__m0hb) clearInterval(w.__m0hb);
      w.__m0hb = window.setInterval(() => {
        void fetch(`${url}/heartbeat`, { method: 'POST', credentials: 'include' });
      }, 15_000);
      return { ok: r.ok, status: r.status, body: r.ok ? '' : await r.text() };
    },
    { o: org, p: planId },
  );
  expect(res.ok, `peer could not take the pen: ${JSON.stringify(res)}`).toBe(true);
}

async function peerReleasesPen(b: Page, org: string, planId: string): Promise<void> {
  await b.evaluate(
    async ({ o, p }: { o: string; p: string }) => {
      const w = window as unknown as { __m0hb?: number };
      if (w.__m0hb) clearInterval(w.__m0hb);
      await fetch(`/api/v1/organizations/${o}/plans/${p}/edit-lock`, {
        method: 'DELETE',
        credentials: 'include',
      });
    },
    { o: org, p: planId },
  );
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`toolbar-redesign M5 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M5 readings, ${pointer} pointer`, async ({ page, browser }) => {
      test.setTimeout(7_200_000);
      const name = `toolbar-redesign-m5.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = { pointer, wide: null as Reading | null, cells: [] as Reading[] };
      const cells = record.cells as Reading[];
      const save = (): void => {
        writeMeasurement(name, record);
      };

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);

      // ---- fixture (as M4) ----------------------------------------------------------------
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

      const { b } = await inviteAndSignUpPeer(page, browser, stamp);
      await createHierarchy(page);
      await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
      const planId = openPlanId(page);
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

      const reopen = async (pen: boolean): Promise<void> => {
        await page.setViewportSize({ width: 1646, height: 1097 });
        await page.goto(planUrl);
        await waitDeck(page);
        if (pen) await ensurePen(page);
        await page.waitForTimeout(400);
      };

      const sweep = async (state: string, cellList: readonly Cell[]): Promise<void> => {
        for (const c of cellList) {
          await page.setViewportSize({ width: c.w, height: c.h });
          await page.waitForTimeout(550);
          log(`${state} ${c.label}`);
          const reading = await page.evaluate(readPage);
          const markers = await page.evaluate(readMarkers);
          cells.push({ state, cell: c.label, markers, ...reading });
        }
        save();
      };

      // ---- the promoted forms' widths, in the base state ----------------------------------
      await reopen(true);
      await page.setViewportSize({ width: WIDE.w, height: WIDE.h });
      await page.waitForTimeout(700);
      record.wide = { cell: WIDE.label, ...(await page.evaluate(readPage)) };
      save();

      // ---- unused width per stage: base, then the worst stress state ----------------------
      await sweep('base', CELLS);

      // conflicts: place a bar before its logic allows, recalculate, then cycle.
      await reopen(true);
      await placeViaApi(page, orgSlug, 'Excavate to formation', '2026-01-05');
      await recalculate(page, orgSlug);
      await waitDeck(page);
      await ensurePen(page);
      await expect
        .poll(
          async () => (await placements(page, orgSlug)).some((r) => r.visualConflict === true),
          { timeout: 25_000 },
        )
        .toBe(true);
      await reopen(false);
      await peerTakesPen(b, orgSlug, planId);
      await page.reload();
      await waitDeck(page);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.locator('[data-toolbar-item="next-conflict"]').first().click();
      await page.waitForTimeout(500);
      await expect
        .poll(async () => (await page.evaluate(readMarkers)).conflictChip)
        .toMatch(/^Conflict \d+ of \d+/);
      await sweep('conflicts-cycling+peer-pen', CELLS);
      await peerReleasesPen(b, orgSlug, planId);

      save();
      expect(cells.length).toBeGreaterThan(0);
    });
  });
}
