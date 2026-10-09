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
 * **Toolbar redesign, M0: measure the premises before any of it is built**
 * (`docs/specs/toolbar-redesign/implementation-plan.md` M0-T1/T2).
 *
 * A harness, not a gate (ADR-0081 §3): it drives the real plan workspace through the real
 * sign-up -> client -> project -> plan journey and reads the real DOM, so the numbers are the
 * product's. Where it **cannot** read the redesigned surface (it does not exist yet), it says so
 * and projects instead, and the projection is labelled `after` and built the only honest way:
 *
 * - the deck is **cloned** and the clone is mutated (zoom/fit/summary hidden, the three compact
 *   items' labels made `sr-only`, Legend + Resource view + Comments moved into a trailing Panels
 *   group, Apply levelled dates labelled where the row is roomy, the search field grown at 2560).
 *   The real deck is hidden while the clone is read and shown again before the call returns, so
 *   React never sees a mutated node;
 * - a promoted form's width is the width of a **clone of a real labelled deck button** with its
 *   label replaced, read inside the real group so the pointer's `--control-h` and padding apply.
 *
 * Run: `PLAYWRIGHT_CHROMIUM_PATH=... DATABASE_URL=... pnpm --filter @repo/web measure:toolbar --
 * toolbar-redesign-m0` (the api and the web dev server are reused when already up).
 */

interface Cell {
  label: string;
  w: number;
  h: number;
  /** Browser default font size multiplier (Chromium `Page.setFontSizes`), 1 = 16 px. */
  scale?: 2;
}

const CELLS: readonly Cell[] = [
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1912x1080', w: 1912, h: 1080 },
  { label: '1912x948', w: 1912, h: 948 },
  { label: '1912x1114', w: 1912, h: 1114 },
  { label: '1280x600', w: 1280, h: 600 },
  { label: '1366x768', w: 1366, h: 768 },
  { label: '2560x1440', w: 2560, h: 1440 },
  { label: '640x480', w: 640, h: 480 },
  { label: '640x360', w: 640, h: 360 },
  { label: '640x300', w: 640, h: 300 },
  { label: '320x720', w: 320, h: 720 },
  { label: '320x256', w: 320, h: 256 },
];

const CELLS_200: readonly Cell[] = [
  { label: '1280x800@200', w: 1280, h: 800, scale: 2 },
  { label: '2560x1440@200', w: 2560, h: 1440, scale: 2 },
];

/** The cells whose menus are opened (panel heights are the question, not the sweep). */
const MENU_CELLS = new Set(['1024x600', '1440x900']);

/** The cells the screenshots are taken at. */
const SHOT_CELLS = new Set(['1024x600', '1440x900']);

const PASSWORD = 'correct-horse-battery';

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[m0 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
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
function readPage(opts: { after: boolean; items: boolean }): Reading {
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

  const mm = [...document.querySelectorAll('div.absolute')].find(
    (d) =>
      d.className.toString().includes('right-3') &&
      (d.textContent ?? '').includes('Overview') &&
      isVisible(d),
  );
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
    expandHittable: hit(expand ?? null),
    recalculateHittable: hit(recalcBtn ?? null),
    bandShareOfViewport: band ? r((band.getBoundingClientRect().height / innerHeight) * 100) : null,
  });
  const base = geometry();

  const out: Reading = {
    ...base,
    searchW: searchEl ? r(searchEl.getBoundingClientRect().width) : null,
    minimap: mm
      ? {
          x: r(mm.getBoundingClientRect().left),
          y: r(mm.getBoundingClientRect().top),
          w: r(mm.getBoundingClientRect().width),
          h: r(mm.getBoundingClientRect().height),
          bottomCss: (mm as HTMLElement).style.bottom,
          fromStageBottom: stageRect
            ? r(stageRect.bottom - mm.getBoundingClientRect().bottom)
            : null,
          fromStageRight: stageRect ? r(stageRect.right - mm.getBoundingClientRect().right) : null,
        }
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

  // Below the 64 rem floor the deck is M3's scrolling line, not the two-row wrap: no projection.
  if (!opts.after || remW < 64) return out;

  // ---- the projected deck (clone) ------------------------------------------------------------
  const clone = realDeck.cloneNode(true) as HTMLElement;
  clone.setAttribute('data-m0-clone', '');
  realDeck.style.display = 'none';
  realDeck.after(clone);
  const compact = remW < 80;
  const hide = (id: string): void => {
    const el = q(`[data-toolbar-item="${id}"]`, clone);
    if (!el) return;
    const t = el.closest<HTMLElement>('[data-toolbar-item-scope]') ?? el;
    t.style.display = 'none';
  };
  for (const id of ['zoom-out', 'zoom-in', 'fit', 'summary']) hide(id);
  const labelSpans = (id: string): HTMLElement[] => {
    const el = q(`[data-toolbar-item="${id}"]`, clone);
    return el
      ? [...el.querySelectorAll<HTMLElement>('span')].filter(
          (s) => s.children.length === 0 && (s.textContent ?? '').trim().length > 0,
        )
      : [];
  };
  if (compact) {
    for (const id of ['baseline-overlay', 'comments', 'calendar'])
      for (const s of labelSpans(id)) s.classList.add('sr-only');
  } else {
    // Apply levelled dates is `'roomy'`: labelled wherever the deck is at least roomy.
    const lev = q('[data-toolbar-item="apply-levelling"]', clone);
    const donor = labelSpans('marquee-select')[0];
    if (lev && donor && labelSpans('apply-levelling').length === 0) {
      const s = donor.cloneNode(true) as HTMLElement;
      s.textContent = 'Apply levelled dates…';
      lev.append(s);
    }
  }
  // Panels: Legend, Resource view, Comments, trailing on LOOK.
  const lookRow = q<HTMLElement>('[data-deck-row="look"]', clone);
  const findGroup = q<HTMLElement>('[role="group"][aria-label="Find"]', clone);
  if (lookRow && findGroup) {
    const panels = findGroup.cloneNode(false) as HTMLElement;
    panels.setAttribute('aria-label', 'Panels');
    panels.style.marginLeft = 'auto';
    const inner = (findGroup.firstElementChild as HTMLElement).cloneNode(false) as HTMLElement;
    const section = (findGroup.firstElementChild?.firstElementChild as HTMLElement).cloneNode(
      false,
    ) as HTMLElement;
    inner.append(section);
    panels.append(inner);
    const isSection = (p: Element | null): boolean =>
      p?.parentElement?.parentElement?.getAttribute('role') === 'group';
    for (const id of ['legend', 'resource-view', 'comments']) {
      let n = q(`[data-toolbar-item="${id}"]`, clone);
      if (!n) continue;
      while (n.parentElement && !isSection(n.parentElement)) n = n.parentElement;
      section.append(n);
    }
    lookRow.append(panels);
  }
  const planGroup = q<HTMLElement>('[role="group"][aria-label="Plan"]', clone);
  if (planGroup) planGroup.style.marginLeft = 'auto';
  // The search field grows at 160rem (spec 4.11): +240.
  const cloneSearch = q<HTMLElement>('[data-toolbar-item="search"]', clone);
  if (cloneSearch && remW >= 159) {
    cloneSearch.style.width = `${cloneSearch.getBoundingClientRect().width + 240}px`;
    cloneSearch.style.flexShrink = '0';
  }
  const after = readDeck(clone);
  const afterGeo = geometry();
  const afterNatural = naturalOf(clone);
  // Variant B: Float paths also leaves the deck (D-c: it moves to the selection bar and the Gantt
  // row menu). The plan's premise list omits it; the spec's own LOOK estimate (1120) includes it.
  hide('float-paths');
  const afterB = readDeck(clone);
  const afterBGeo = geometry();
  const afterBNatural = naturalOf(clone);

  // Header: the identity row adds Plan summary as one more icon button beside Edit plan.
  let headerAfter: Reading | null = null;
  if (header) {
    const edit = [...header.querySelectorAll('button')].find((b) =>
      /edit plan/i.test(b.getAttribute('aria-label') ?? ''),
    );
    if (edit) {
      const before = header.getBoundingClientRect().height;
      const dup = edit.cloneNode(true) as HTMLElement;
      dup.setAttribute('data-m0-dup', '');
      edit.after(dup);
      headerAfter = {
        beforeH: r(before),
        afterH: r(header.getBoundingClientRect().height),
        afterLines: cluster(
          [...header.querySelectorAll('button, a, select, [data-toolbar-item]')]
            .filter(isVisible)
            .map((e) => e.getBoundingClientRect().top),
        ).length,
      };
      dup.remove();
    }
  }

  clone.remove();
  realDeck.style.display = '';

  const stageHAfter = (afterGeo.stageH as number | null) ?? null;
  const stageHReal = (base.stageH as number | null) ?? null;
  const canvasReal = (base.canvasH as number | null) ?? null;
  out.afterB = {
    ...afterB,
    natural: afterBNatural,
    bandH: afterBGeo.bandH,
    stageH: afterBGeo.stageH,
    canvasHProjected:
      canvasReal !== null && afterBGeo.stageH !== null && stageHReal !== null
        ? r(canvasReal + ((afterBGeo.stageH as number) - stageHReal))
        : null,
  };
  out.after = {
    compact,
    ...after,
    natural: afterNatural,
    headerH: afterGeo.headerH,
    bandH: afterGeo.bandH,
    stageH: stageHAfter,
    canvasHProjected:
      canvasReal !== null && stageHAfter !== null && stageHReal !== null
        ? r(canvasReal + (stageHAfter - stageHReal))
        : null,
    headerWithSummary: headerAfter,
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

/** Read the open menu or popover panel of a deck trigger, then close it. */
async function readMenu(page: Page, itemId: string): Promise<Reading> {
  const trigger = page.locator(`[data-toolbar-item="${itemId}"]`).first();
  if ((await trigger.count()) === 0) return { id: itemId, present: false };
  // A split button's menu opens from its caret, a sibling that is not itself a toolbar item;
  // clicking the primary half would arm the tool (and change every later reading).
  const caret = trigger.locator('xpath=following-sibling::button[1]');
  const split =
    ['today', 'add-activity', 'link-tool'].includes(itemId) && (await caret.count()) > 0;
  await (split ? caret : trigger).click();
  await page.waitForTimeout(450);
  const reading = await page.evaluate((id: string) => {
    const r = (n: number): number => Math.round(n * 10) / 10;
    const t = document.querySelector(`[data-toolbar-item="${id}"]`);
    const controlsId = t?.getAttribute('aria-controls');
    let panel: Element | null = controlsId ? document.getElementById(controlsId) : null;
    if (!panel) {
      const cands = [...document.querySelectorAll('[role="menu"], [role="dialog"]')].filter(
        (e) => e.getBoundingClientRect().width > 0 && !e.closest('header'),
      );
      panel = cands[cands.length - 1] ?? null;
    }
    if (!panel) return { id, opened: false };
    const b = panel.getBoundingClientRect();
    // The scrollable element may be the panel or an inner wrapper.
    const scrollers = [panel, ...panel.querySelectorAll('*')].filter(
      (e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== 'visible',
    );
    const names = [
      ...panel.querySelectorAll(
        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], input[type="checkbox"], input[type="radio"], button',
      ),
    ].map((e) => {
      const label =
        e.getAttribute('aria-label') ??
        (e.closest('label')?.textContent ?? e.textContent ?? '').trim();
      return label.replace(/\s+/g, ' ').slice(0, 60);
    });
    const legends = [...panel.querySelectorAll('legend, [role="group"][aria-label]')].map(
      (e) => e.getAttribute('aria-label') ?? (e.textContent ?? '').trim().slice(0, 30),
    );
    return {
      id,
      opened: true,
      role: panel.getAttribute('role'),
      top: r(b.top),
      bottom: r(b.bottom),
      height: r(b.height),
      width: r(b.width),
      viewportH: innerHeight,
      shareOfViewport: r((b.height / innerHeight) * 100),
      innerScroll: scrollers.map((e) => ({ scrollH: e.scrollHeight, clientH: e.clientHeight })),
      names,
      legends,
    };
  }, itemId);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  return reading;
}

/** Hover and focus a compact candidate and report whether a tooltip appears, and what it says. */
async function readTooltips(page: Page): Promise<Reading[]> {
  const out: Reading[] = [];
  for (const id of [
    'baseline-overlay',
    'comments',
    'calendar',
    'apply-levelling',
    'zoom-in',
    'undo',
    'resource-view',
  ]) {
    const el = page.locator(`[data-toolbar-item="${id}"]`).first();
    if ((await el.count()) === 0) {
      out.push({ id, present: false });
      continue;
    }
    await page.mouse.move(2, 300);
    await page.waitForTimeout(150);
    await el.hover();
    await page.waitForTimeout(900);
    const hover = await page.evaluate(
      () => (document.querySelector('[data-tooltip]')?.textContent ?? '').trim() || null,
    );
    await page.mouse.move(2, 300);
    await page.waitForTimeout(250);
    await el.focus();
    await page.waitForTimeout(900);
    const focus = await page.evaluate(
      () => (document.querySelector('[data-tooltip]')?.textContent ?? '').trim() || null,
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const afterEscape = await page.evaluate(
      () => (document.querySelector('[data-tooltip]')?.textContent ?? '').trim() || null,
    );
    const attrs = await el.evaluate((n) => ({
      ariaLabel: n.getAttribute('aria-label'),
      title: n.getAttribute('title'),
      describedBy: n.getAttribute('aria-describedby'),
      text: (n.textContent ?? '').trim(),
    }));
    out.push({ id, present: true, hover, focus, afterEscape, ...attrs });
  }
  return out;
}

/**
 * Promoted-form widths: a clone of a real labelled button with its label replaced, at 3840 x 1440
 * (past the widest stage), read inside the real group so the pointer's tokens apply.
 */
function readPromotedWidths(entries: ReadonlyArray<{ key: string; label: string }>): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
  const donor = document.querySelector<HTMLElement>('[data-toolbar-item="marquee-select"]');
  if (!donor) throw new Error('no donor button');
  const host = donor.parentElement;
  if (!host) throw new Error('no host');
  const labelSpan = [...donor.querySelectorAll<HTMLElement>('span')].find(
    (s) => s.children.length === 0 && (s.textContent ?? '').trim().length > 0,
  );
  if (!labelSpan) throw new Error('donor has no label span');
  const widths: Record<string, number> = {};
  for (const e of entries) {
    const c = donor.cloneNode(true) as HTMLElement;
    c.removeAttribute('data-toolbar-item');
    c.removeAttribute('data-toolbar-focusable');
    const span = [...c.querySelectorAll<HTMLElement>('span')].find(
      (s) => s.children.length === 0 && (s.textContent ?? '').trim().length > 0,
    );
    if (span) span.textContent = e.label;
    c.style.position = 'absolute';
    c.style.visibility = 'hidden';
    host.append(c);
    widths[e.key] = r(c.getBoundingClientRect().width);
    c.remove();
  }
  const caption = document.createElement('span');
  caption.className = labelSpan.className;
  caption.textContent = 'Colour';
  caption.style.position = 'absolute';
  caption.style.visibility = 'hidden';
  host.append(caption);
  widths['caption:Colour'] = r(caption.getBoundingClientRect().width);
  caption.textContent = 'Zoom';
  widths['caption:Zoom'] = r(caption.getBoundingClientRect().width);
  caption.remove();
  const own = (id: string): number | null => {
    const el = document.querySelector(`[data-toolbar-item="${id}"]`);
    return el ? r(el.getBoundingClientRect().width) : null;
  };
  return {
    donorW: r(donor.getBoundingClientRect().width),
    donorH: r(donor.getBoundingClientRect().height),
    sectionGap: parseFloat(getComputedStyle(host).columnGap || '0'),
    widths,
    ownWidths: {
      'zoom-out': own('zoom-out'),
      'zoom-in': own('zoom-in'),
      fit: own('fit'),
      undo: own('undo'),
      redo: own('redo'),
    },
  };
}

/** The ladder, with the bar name each entry would carry when promoted (spec 4.11). */
const LADDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'L1 Critical only', label: 'Critical only' },
  { key: 'L2a Colour: Criticality', label: 'Criticality' },
  { key: 'L2b Colour: Total float', label: 'Total float' },
  { key: 'L2c Colour: WBS group', label: 'WBS group' },
  { key: 'L3 Late-start overlay', label: 'Late-start overlay' },
  { key: 'L4 Feasible window', label: 'Feasible window' },
  { key: 'L5 Levelled placement', label: 'Levelled placement' },
  { key: 'L6 Has conflict only', label: 'Has conflict only' },
  { key: 'P1 Health check', label: 'Health check' },
  { key: 'P2 Add: Start milestone', label: 'Add: Start milestone' },
  { key: 'P3 Add: Finish milestone', label: 'Add: Finish milestone' },
  { key: 'P4 Share…', label: 'Share…' },
  { key: 'P5a Link: Finish-to-start', label: 'Link: Finish-to-start' },
  { key: 'P5b Link: Start-to-start', label: 'Link: Start-to-start' },
  { key: 'P5c Link: Finish-to-finish', label: 'Link: Finish-to-finish' },
  { key: 'P6 Compare revisions', label: 'Compare revisions' },
  { key: 'P7 Earned value…', label: 'Earned value…' },
  { key: 'P8 Resource histogram…', label: 'Resource histogram…' },
  { key: 'C1a Zoom: Day', label: 'Day' },
  { key: 'C1b Zoom: Week', label: 'Week' },
  { key: 'C1c Zoom: Month', label: 'Month' },
  { key: 'C1d Zoom: Quarter', label: 'Quarter' },
  { key: 'C1e Zoom: Year', label: 'Year' },
];

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`toolbar-redesign M0 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M0 readings, ${pointer} pointer`, async ({ page, browser }) => {
      test.setTimeout(7_200_000);
      const name = `toolbar-redesign-m0.${pointer}`;
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
        const dia = page.locator('[data-toolbar-item="view-tsld"]').first();
        if ((await dia.count()) > 0 && (await dia.getAttribute('aria-pressed')) === 'false')
          await dia.click();
        await page.waitForTimeout(500);
      };

      const sweep = async (
        state: string,
        cellList: readonly Cell[],
        scale: 1 | 2,
      ): Promise<void> => {
        for (const c of cellList) {
          await page.setViewportSize({ width: c.w, height: c.h });
          await page.waitForTimeout(550);
          log(`${state} ${c.label}`);
          const withItems = state === 'base' && scale === 1;
          const reading = await page.evaluate(readPage, { after: true, items: withItems });
          const markers = await page.evaluate(readMarkers);
          const entry: Reading = { state, cell: c.label, scale, markers, ...reading };
          if (MENU_CELLS.has(c.label) && state === 'base') {
            const menus: Reading[] = [];
            for (const id of [
              'today',
              'view',
              'filter',
              'analysis',
              'export',
              'add-activity',
              'link-tool',
            ]) {
              menus.push(
                await readMenu(page, id).catch((e: unknown) => ({
                  id,
                  error: String(e).slice(0, 200),
                })),
              );
            }
            entry.menus = menus;
            entry.tooltips = await readTooltips(page).catch((e: unknown) => [
              { error: String(e).slice(0, 300) },
            ]);
          }
          if (SHOT_CELLS.has(c.label) && state === 'base' && scale === 1) {
            await page.screenshot({
              path: `../../docs/specs/toolbar-redesign/photos/m0-${pointer}-${c.label}-base.png`,
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
      await page.getByRole('button', { name: 'View', exact: true }).click();
      await page.getByRole('checkbox', { name: /minimap/i }).check();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      await guard('minimap', (m) => m.overview === true);
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

      // ---- 200 % text ---------------------------------------------------------------------
      await page.setViewportSize({ width: 1646, height: 1097 });
      await setFont(page, 2);
      await page.goto(planUrl);
      await waitDeck(page);
      const rootPx = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      record.fontScale2RootPx = rootPx;
      if (rootPx === '32px') {
        await ensurePen(page);
        await sweep('base', CELLS_200, 2);
        await reopen(true);
        await sweep('base-after-reopen', CELLS_200, 2);
      } else {
        record.fontScale2 = `setFontSizes did not move the root font size (${rootPx}); 200% cells NOT read`;
      }
      await setFont(page, 1);

      // ---- promoted widths (3840 x 1440) ---------------------------------------------------
      await page.goto(planUrl);
      await waitDeck(page);
      await ensurePen(page);
      await page.setViewportSize({ width: 3840, height: 1440 });
      await page.waitForTimeout(700);
      record.promotedWidths = await page.evaluate(readPromotedWidths, LADDER);
      record.stage3840 = await page.evaluate(readPage, { after: false, items: false });
      save();

      expect(cells.length).toBeGreaterThan(0);
    });
  });
}
