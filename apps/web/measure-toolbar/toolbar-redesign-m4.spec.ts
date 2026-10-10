import { expect, type Browser, type Page, test } from '@playwright/test';

import {
  createHierarchy,
  diagramList,
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
 * **Toolbar redesign, M4: read the moves on the surface that now exists**
 * (`docs/specs/toolbar-redesign/implementation-plan.md` M4; the record is `m4-measurement.md`).
 *
 * `toolbar-redesign-m0.spec.ts` projected the "after" by cloning the real deck and mutating the
 * clone. M4 built the moves (the identity row, the Panels group, Float paths on the selection bar,
 * Apply levelled dates labelled where the deck is roomy, View ▾ in three columns), so this reads the
 * **real** DOM and nothing is projected. Zoom, Fit and the Minimap are still on the deck until M4,
 * which is why two lines at the floor are not asserted here — the lines are RECORDED, with the free
 * width, including the cycling "Conflict 2 of 7 · reason" read-out M0 could not measure.
 *
 * A harness, not a gate (ADR-0081 §3). Run: `PLAYWRIGHT_CHROMIUM_PATH=... DATABASE_URL=... pnpm
 * --filter @repo/web measure:toolbar -- toolbar-redesign-m4` (the api and the web dev server are
 * reused when already up).
 */

interface Cell {
  label: string;
  w: number;
  h: number;
}

const CELLS: readonly Cell[] = [
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1366x768', w: 1366, h: 768 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1912x948', w: 1912, h: 948 },
  { label: '1912x1080', w: 1912, h: 1080 },
  { label: '2560x1440', w: 2560, h: 1440 },
];

/** The cells the screenshots are taken at. */
const SHOT_CELLS = new Set(['1024x600', '1440x900']);

const PASSWORD = 'correct-horse-battery';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[m4 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

/**
 * Everything the page reports. Typed loosely on purpose: the JSON is the record, and a type here
 * would only restate what the reader function builds.
 */
type Reading = Record<string, unknown>;

/**
 * The in-page reader. **Self-contained** (Playwright serialises it), so every helper is declared
 * inside. `after` asks for the projected deck as well as the real one.
 */
function readPage(opts: { items: boolean }): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const remW = innerWidth / rootPx;
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
  const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
    root.querySelector<T>(sel);

  const realDeck = q('[role="toolbar"][aria-label="Plan commands"]:not([data-m0-clone])');
  if (!realDeck) throw new Error('the deck was not found');

  const labelShown = (item: Element): boolean =>
    [...item.querySelectorAll('span')].some(
      (s) =>
        s.children.length === 0 &&
        (s.textContent ?? '').trim().length > 0 &&
        s.getBoundingClientRect().width > 3 &&
        s.getBoundingClientRect().height > 3,
    );

  const readDeck = (deck: HTMLElement): Reading => {
    const rows: Reading[] = [];
    for (const id of ['look', 'do']) {
      const row = q(`[data-deck-row="${id}"]`, deck);
      if (!row) throw new Error(`deck row ${id} missing`);
      const rr = row.getBoundingClientRect();
      const controls = [...row.querySelectorAll('button, input, [role="button"]')].filter(
        isVisible,
      );
      const tops = cluster(controls.map((c) => c.getBoundingClientRect().top));
      const usedPerLine = tops.map((t) => {
        const onLine = controls.filter((c) => Math.abs(c.getBoundingClientRect().top - t) <= 4);
        return r(Math.max(...onLine.map((c) => c.getBoundingClientRect().right)) - rr.left);
      });
      const lastUsed = usedPerLine[usedPerLine.length - 1] ?? 0;
      const groups = [...row.querySelectorAll(':scope > [role="group"]')].filter(isVisible);
      let leadingSeams = 0;
      groups.forEach((g, gi) => {
        const prev = groups[gi - 1];
        if (gi > 0 && prev && g.getBoundingClientRect().top > prev.getBoundingClientRect().top + 4)
          leadingSeams += 1;
        const sections = [...(g.firstElementChild?.children ?? [])].filter(isVisible);
        sections.forEach((s, si) => {
          const ps = sections[si - 1];
          if (si > 0 && ps && s.getBoundingClientRect().top > ps.getBoundingClientRect().top + 4)
            leadingSeams += 1;
        });
      });
      rows.push({
        row: id,
        width: r(rr.width),
        height: r(rr.height),
        lines: tops.length,
        usedPerLine,
        unusedLastLine: r(rr.width - lastUsed),
        unusedPct: r(((rr.width - lastUsed) / rr.width) * 100),
        groups: groups.map((g) => ({
          name: g.getAttribute('aria-label'),
          x: r(g.getBoundingClientRect().left - rr.left),
          w: r(g.getBoundingClientRect().width),
          top: r(g.getBoundingClientRect().top - rr.top),
        })),
        leadingSeams,
      });
    }
    const items = [...deck.querySelectorAll('[data-toolbar-item]')].filter(isVisible).map((el) => {
      const b = el.getBoundingClientRect();
      const row = el.closest('[data-deck-row]');
      const rb = row?.getBoundingClientRect();
      return {
        id: el.getAttribute('data-toolbar-item'),
        row: row?.getAttribute('data-deck-row') ?? null,
        group: el.closest('[role="group"]')?.getAttribute('aria-label') ?? null,
        x: r(b.left - (rb?.left ?? 0)),
        y: r(b.top - (rb?.top ?? 0)),
        w: r(b.width),
        h: r(b.height),
        labelShown: labelShown(el),
        name: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
        hasTitle: el.hasAttribute('title'),
        hasDescribedBy: el.hasAttribute('aria-describedby'),
        ariaDisabled: el.getAttribute('aria-disabled'),
      };
    });
    return {
      deckH: r(deck.getBoundingClientRect().height),
      deckW: r(deck.getBoundingClientRect().width),
      lines: new Set(
        cluster(
          items.map((i) => {
            const el = deck.querySelector(`[data-toolbar-item="${String(i.id)}"]`);
            return el ? el.getBoundingClientRect().top : 0;
          }),
        ),
      ).size,
      rows,
      itemCount: items.length,
      ...(opts.items ? { items } : {}),
    };
  };

  /** Natural (nowrap, max-content) width per row, on a disposable clone so React's nodes stay. */
  const naturalOf = (deck: HTMLElement): Record<string, { natural: number; available: number }> => {
    const out: Record<string, { natural: number; available: number }> = {};
    const avail: Record<string, number> = {};
    for (const id of ['look', 'do']) {
      const row = q(`[data-deck-row="${id}"]`, deck);
      avail[id] = row ? row.getBoundingClientRect().width : 0;
    }
    const tmp = deck.cloneNode(true) as HTMLElement;
    tmp.setAttribute('data-m0-natural', '');
    deck.style.display = 'none';
    deck.after(tmp);
    tmp.querySelectorAll<HTMLElement>('.flex-wrap').forEach((e) => (e.style.flexWrap = 'nowrap'));
    tmp.querySelectorAll<HTMLElement>('[role="group"]').forEach((e) => (e.style.flexShrink = '0'));
    for (const id of ['look', 'do']) {
      const row = q<HTMLElement>(`[data-deck-row="${id}"]`, tmp);
      if (!row) continue;
      row.style.width = 'max-content';
      row.style.alignSelf = 'flex-start';
      out[id] = { natural: r(row.getBoundingClientRect().width), available: r(avail[id] ?? 0) };
    }
    tmp.remove();
    deck.style.display = '';
    return out;
  };

  const band = q('[data-surface="chrome"]:not([data-activities-bar])');
  const header = q('header');
  const main = q('main');
  const foot = q('[data-activities-bar]');
  const canvas = q('canvas');
  const stage = canvas?.parentElement ?? null;

  const headerItems = header
    ? [...header.querySelectorAll('button, a, select, [data-toolbar-item]')].filter(isVisible)
    : [];

  const expand = q('button[aria-label="Expand activities panel"]');
  const hit = (el: Element | null): boolean | null => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return false;
    const top = document.elementFromPoint(cx, cy);
    return top !== null && (top === el || el.contains(top));
  };
  const recalcBtn = [...document.querySelectorAll('button')].find(
    (b) => (b.textContent ?? '').trim() === 'Recalculate',
  );

  const rect = (el: Element | null): Reading | null => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return {
      x: r(b.left),
      y: r(b.top),
      w: r(b.width),
      h: r(b.height),
      right: r(b.right),
      bottom: r(b.bottom),
    };
  };
  const mm = q('[data-testid="tsld-minimap"]');
  const column = q('[data-testid="tsld-viewport-column"]');
  const clusterEl = q('[role="toolbar"][aria-label="Diagram viewport"]');
  const ruler = q('[data-testid="tsld-ruler"]');
  const axisMarkers = q('[data-testid="tsld-axis-markers"]');
  const stageRect = stage?.getBoundingClientRect() ?? null;

  const searchEl = q('[data-toolbar-item="search"]', realDeck);

  const real = readDeck(realDeck);
  const realNatural = naturalOf(realDeck);

  const geometry = (): Reading => ({
    viewport: { w: innerWidth, h: innerHeight },
    remW: r(remW),
    rootPx,
    headerH: header ? r(header.getBoundingClientRect().height) : null,
    headerLines: cluster(headerItems.map((e) => e.getBoundingClientRect().top)).length,
    bandH: band ? r(band.getBoundingClientRect().height) : null,
    mainTop: main ? r(main.getBoundingClientRect().top) : null,
    stageH: stageRect ? r(stageRect.height) : null,
    stageW: stageRect ? r(stageRect.width) : null,
    canvasH: canvas ? r(canvas.getBoundingClientRect().height) : null,
    footH: foot ? r(foot.getBoundingClientRect().height) : null,
    footTop: foot ? r(foot.getBoundingClientRect().top) : null,
    docScrollH: document.documentElement.scrollHeight,
    identityToolbar: (() => {
      const t = q('[role="toolbar"][aria-label="Plan details"]');
      if (!t) return null;
      const b = t.getBoundingClientRect();
      return {
        x: r(b.left),
        w: r(b.width),
        h: r(b.height),
        items: [...t.querySelectorAll('[data-toolbar-item]')].map((e) => ({
          id: e.getAttribute('data-toolbar-item'),
          w: r(e.getBoundingClientRect().width),
          h: r(e.getBoundingClientRect().height),
        })),
      };
    })(),
    expandHittable: hit(expand ?? null),
    recalculateHittable: hit(recalcBtn ?? null),
    bandShareOfViewport: band ? r((band.getBoundingClientRect().height / innerHeight) * 100) : null,
  });
  const base = geometry();

  const out: Reading = {
    ...base,
    searchW: searchEl ? r(searchEl.getBoundingClientRect().width) : null,
    minimap: rect(mm),
    column: rect(column),
    cluster: rect(clusterEl),
    clusterItems: clusterEl
      ? [...clusterEl.querySelectorAll('[data-toolbar-item]')].map((e) => ({
          id: e.getAttribute('data-toolbar-item'),
          pressed: e.getAttribute('aria-pressed'),
          disabled: e.getAttribute('aria-disabled'),
          w: r(e.getBoundingClientRect().width),
          h: r(e.getBoundingClientRect().height),
        }))
      : null,
    ruler: rect(ruler),
    stage: rect(stage),
    columnBelowRuler:
      column && ruler
        ? r(column.getBoundingClientRect().top - ruler.getBoundingClientRect().bottom)
        : null,
    // `minimapRoom` turns false below 3 x MINIMAP_BOX.width (600) of measured stage width.
    minimapRoomExpected: stageRect ? stageRect.width >= 600 : null,
    axisMarkers: axisMarkers
      ? {
          y: r(axisMarkers.getBoundingClientRect().top),
          h: r(axisMarkers.getBoundingClientRect().height),
        }
      : null,
    real: { ...real, natural: realNatural },
  };

  return out;
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
  test.describe(`toolbar-redesign M4 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M4 readings, ${pointer} pointer`, async ({ page, browser }) => {
      test.setTimeout(7_200_000);
      const name = `toolbar-redesign-m4.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = { pointer, cells: [] as Reading[] };
      const cells = record.cells as Reading[];
      const save = (): void => {
        writeMeasurement(name, record);
      };

      // The product's own notice (ADR-0179) covers the page below the floor; a planner who has
      // acknowledged it never sees it again, and the readings are about the toolbar beneath it.
      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);

      // ---- fixture ------------------------------------------------------------------------
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

      log('signed up');
      const { b } = await inviteAndSignUpPeer(page, browser, stamp);
      log('peer ready');
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

      // ---- state plumbing -----------------------------------------------------------------
      const reopen = async (pen: boolean): Promise<void> => {
        await page.setViewportSize({ width: 1646, height: 1097 });
        await page.goto(planUrl);
        await waitDeck(page);
        if (pen) await ensurePen(page);
        // Normalise the toggles a previous state may have persisted.
        const comments = page.locator('[data-toolbar-item="comments"]').first();
        if ((await comments.getAttribute('aria-pressed')) === 'true') await comments.click();
        const overview = await page.getByText('Overview', { exact: true }).count();
        if (overview > 0) {
          await page.getByRole('button', { name: 'Hide overview' }).click();
        }
        const mmBtn = page.locator('[data-toolbar-item="minimap"]').first();
        if ((await mmBtn.count()) > 0 && (await mmBtn.getAttribute('aria-pressed')) === 'true') {
          await mmBtn.click();
        }
        const dia = page.locator('[data-toolbar-item="view-tsld"]').first();
        if ((await dia.count()) > 0 && (await dia.getAttribute('aria-pressed')) === 'false')
          await dia.click();
        await page.waitForTimeout(500);
      };

      const sweep = async (state: string, cellList: readonly Cell[], scale: 1): Promise<void> => {
        for (const c of cellList) {
          await page.setViewportSize({ width: c.w, height: c.h });
          await page.waitForTimeout(550);
          log(`${state} ${c.label}`);
          const withItems = state === 'base' && scale === 1;
          const reading = await page.evaluate(readPage, { items: withItems });
          const markers = await page.evaluate(readMarkers);
          const entry: Reading = { state, cell: c.label, scale, markers, ...reading };
          if (SHOT_CELLS.has(c.label) && state === 'base' && scale === 1) {
            await page.screenshot({
              path: `../../docs/specs/toolbar-redesign/photos/m4-${pointer}-${c.label}-base.png`,
            });
          }
          cells.push(entry);
        }
        save();
      };

      const guard = async (what: string, pred: (m: Reading) => boolean): Promise<void> => {
        const m = await page.evaluate(readMarkers);
        expect(pred(m), `${what}: ${JSON.stringify(m)}`).toBe(true);
      };

      // ---- 100 % text ---------------------------------------------------------------------
      // 1 base
      await reopen(true);
      await guard(
        'base',
        (m) => m.penAriaDisabled !== 'true' && m.selected === 0 && m.hasCanvas === true,
      );
      await sweep('base', CELLS, 1);

      // 2 selection
      await reopen(true);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await diagramList(page).focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      await guard('selection', (m) => m.selected === 1);
      await sweep('selection', CELLS, 1);

      // 3 dock open (Comments)
      await reopen(true);
      await page.locator('[data-toolbar-item="comments"]').first().click();
      await page.waitForTimeout(700);
      await guard('dock', (m) => m.commentsPressed === 'true');
      await sweep('dock', CELLS, 1);

      // 4 minimap open
      await reopen(true);
      await page
        .getByRole('toolbar', { name: 'Diagram viewport' })
        .getByRole('button', { name: 'Minimap' })
        .click();
      await page.waitForTimeout(600);
      await guard('minimap', (m) => m.overview === true || m.minimapPressed === 'true');
      await sweep('minimap', CELLS, 1);

      // 5 Gantt
      await reopen(true);
      await page.locator('[data-toolbar-item="view-gantt"]').first().click();
      await page.waitForTimeout(900);
      await guard('gantt', (m) => m.hasCanvas === false);
      await sweep('gantt', CELLS, 1);

      // 6 pen held by a peer (no conflicts yet)
      await reopen(false);
      await peerTakesPen(b, orgSlug, planId);
      await page.reload();
      await waitDeck(page);
      await guard('peer pen', (m) => /edit|pen|hold|has|by/i.test(String(m.pen)));
      await sweep('peer-pen', CELLS, 1);
      await peerReleasesPen(b, orgSlug, planId);

      // 7 conflicts present: place Pour slab before its logic allows, recalculate.
      await reopen(true);
      const rows = await placements(page, orgSlug);
      expect(rows.length).toBeGreaterThan(0);
      await placeViaApi(page, orgSlug, 'Excavate to formation', '2026-01-05');
      await recalculate(page, orgSlug);
      await waitDeck(page);
      await ensurePen(page);
      await expect
        .poll(
          async () => (await placements(page, orgSlug)).some((r) => r.visualConflict === true),
          {
            timeout: 25_000,
          },
        )
        .toBe(true);
      await reopen(true);
      await guard('conflicts', (m) => m.conflictChip !== null && m.nextConflictDisabled !== 'true');
      await sweep('conflicts', CELLS, 1);

      // 7b the CYCLING read-out ("Conflict 1 of 1 · reason"), which M0 could not measure: it is longer
      // than the idle "1 conflict" chip, and it is the state spec 4.5's exit rule is about.
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.locator('[data-toolbar-item="next-conflict"]').first().click();
      await page.waitForTimeout(500);
      await guard('conflict cycling', (m) => /^Conflict \d+ of \d+/.test(String(m.conflictChip)));
      await sweep('conflicts-cycling', CELLS, 1);

      // 8 conflicts AND a peer holding the pen: the worst case for DO and LOOK together.
      await reopen(false);
      await peerTakesPen(b, orgSlug, planId);
      await page.reload();
      await waitDeck(page);
      await guard(
        'conflicts + peer',
        (m) => m.conflictChip !== null && /edit|pen|hold|has|by/i.test(String(m.pen)),
      );
      await sweep('conflicts+peer-pen', CELLS, 1);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.locator('[data-toolbar-item="next-conflict"]').first().click();
      await page.waitForTimeout(500);
      await guard(
        'conflict cycling + peer',
        (m) =>
          /^Conflict \d+ of \d+/.test(String(m.conflictChip)) &&
          /edit|pen|hold|has|by/i.test(String(m.pen)),
      );
      await sweep('conflicts-cycling+peer-pen', CELLS, 1);
      await peerReleasesPen(b, orgSlug, planId);

      // 9 no computed diagram: an empty plan.
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto(`/orgs/${orgSlug}`);
      await page.getByRole('link', { name: 'Clients', exact: true }).click();
      await page.getByRole('link', { name: 'Northgate' }).click();
      await page.getByRole('link', { name: 'Riverside', exact: true }).click();
      await newPlan(page, 'Empty plan');
      await waitDeck(page);
      await ensurePen(page);
      await sweep('no-diagram (empty plan)', CELLS, 1);

      save();

      expect(cells.length).toBeGreaterThan(0);
    });
  });
}
