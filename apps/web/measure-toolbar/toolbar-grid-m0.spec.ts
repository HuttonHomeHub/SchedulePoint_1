import { expect, type Browser, type Locator, type Page, test } from '@playwright/test';

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
 * **The toolbar as a grid, M0: what the later milestones depend on, measured before any code changes**
 * (`docs/specs/toolbar-grid/implementation-plan.md` M0; the record is `m0-measurement.md`).
 *
 * Three readings of the **real** product, every cell of one pointer taken in one sitting (CLAUDE.md
 * §17's canvas lesson: a reading from another sitting is not comparable):
 *
 * - **The deck's widths**, per cell and state: each row's lead group (View on LOOK, Author on DO), every
 *   group's natural width, the row's natural width and its free width. `toolbar-grid-m0-fit.mjs` turns
 *   them into the column-fit table.
 * - **The photographs**, the header and the toolbar band plus ~120 px of canvas, at four cells in four
 *   states, for the owner's before-and-after (SC-15).
 * - **Forced colours today**: what distinguishes the chosen Diagram | Gantt segment (and the chosen
 *   Colour value) when the mode drops backgrounds and shadows.
 *
 * `M0_TAG` names the output (`toolbar-grid-m0-<tag>.<pointer>.json`); `M0_LEAN=1` takes only the
 * three states the prototype-cost comparison needs and no photographs. The prototypes themselves are
 * a local, uncommitted branch (M0-T1 item 3): this file measures whatever tree it is pointed at.
 *
 * A harness, not a gate (ADR-0081 §3). Run: `PLAYWRIGHT_CHROMIUM_PATH=... DATABASE_URL=... pnpm
 * --filter @repo/web measure:toolbar -- toolbar-grid-m0` (the api and the web dev server are reused when
 * already up, or `PLAYWRIGHT_SKIP_WEBSERVER=1` with `E2E_BASE_URL` when started by hand).
 */

const TAG = process.env.M0_TAG ?? 'before';
const LEAN = process.env.M0_LEAN === '1';
const PASSWORD = 'correct-horse-battery';
const PHOTO_DIR = '../../docs/specs/toolbar-grid/photos';
/** Only the untouched tree is photographed: a prototype run must never overwrite the "before" set. */
const PHOTOS = TAG === 'before';

interface Cell {
  label: string;
  w: number;
  h: number;
}

/** The floor, the six promotion-stage cells, the owner's 1646 and the scrolling line. */
const CELLS: readonly Cell[] = [
  { label: '640x480', w: 640, h: 480 },
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1600x900', w: 1600, h: 900 },
  { label: '1646x1097', w: 1646, h: 1097 },
  { label: '1912x1080', w: 1912, h: 1080 },
  { label: '2160x1200', w: 2160, h: 1200 },
  { label: '2560x1440', w: 2560, h: 1440 },
];

const PHOTO_LABELS = new Set(['1024x600', '1280x800', '1646x1097', '1912x1080']);

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[m0 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

type Reading = Record<string, unknown>;

/** The in-page reader. **Self-contained** (Playwright serialises it), so every helper is inside. */
function readDeck(): Reading {
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
  const deck = document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Plan commands"]');
  if (!deck) throw new Error('the deck was not found');

  const groupsOf = (row: Element): HTMLElement[] =>
    [...row.querySelectorAll<HTMLElement>(':scope > [role="group"]')].filter(isVisible);

  const rows: Reading[] = [];
  const avail: Record<string, number> = {};
  for (const id of ['look', 'do']) {
    const row = deck.querySelector<HTMLElement>(`[data-deck-row="${id}"]`);
    if (!row) throw new Error(`deck row ${id} missing`);
    const rr = row.getBoundingClientRect();
    avail[id] = rr.width;
    const controls = [...row.querySelectorAll('button, input, [data-toolbar-item]')].filter(
      isVisible,
    );
    const tops = cluster(
      controls
        .filter((c) => c.getBoundingClientRect().height >= 24)
        .map((c) => c.getBoundingClientRect().top),
    );
    const groups = groupsOf(row).map((g) => {
      const b = g.getBoundingClientRect();
      return {
        name: g.getAttribute('aria-label'),
        left: r(b.left - rr.left),
        w: r(b.width),
        trailing: g.classList.contains('ml-auto'),
      };
    });
    // The free gap on a one-line row: between the last group before the trailing one and the
    // trailing group's start (an `ml-auto` group would otherwise read the row as full).
    const trailing = groups.find((g) => g.trailing);
    const before = groups.filter((g) => !g.trailing);
    const lead = before.length > 0 ? Math.max(...before.map((g) => g.left + g.w)) : 0;
    const used = trailing ? trailing.left : rr.width;
    rows.push({
      row: id,
      width: r(rr.width),
      lines: tops.length,
      gap: r(used - lead),
      groups,
    });
  }

  /** Natural (nowrap, max-content) widths on a disposable clone, so React's nodes stay untouched. */
  const tmp = deck.cloneNode(true) as HTMLElement;
  tmp.setAttribute('data-m0-natural', '');
  deck.style.display = 'none';
  deck.after(tmp);
  tmp.querySelectorAll<HTMLElement>('.flex-wrap').forEach((e) => (e.style.flexWrap = 'nowrap'));
  tmp.querySelectorAll<HTMLElement>('[role="group"]').forEach((e) => (e.style.flexShrink = '0'));
  const natural: Record<string, unknown> = {};
  for (const id of ['look', 'do']) {
    const row = tmp.querySelector<HTMLElement>(`[data-deck-row="${id}"]`);
    if (!row) continue;
    row.style.width = 'max-content';
    row.style.alignSelf = 'flex-start';
    const nat = row.getBoundingClientRect().width;
    natural[id] = {
      natural: r(nat),
      available: r(avail[id] ?? 0),
      free: r((avail[id] ?? 0) - nat),
      groups: groupsOf(row).map((g) => ({
        name: g.getAttribute('aria-label'),
        w: r(g.getBoundingClientRect().width),
      })),
    };
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
    };
  });

  const header = document.querySelector('header');
  const band = document.querySelector<HTMLElement>(
    '[data-surface="chrome"]:not([data-activities-bar])',
  );
  const headerControls = header
    ? [...header.querySelectorAll('a,button,[role="button"],input,select')].filter(isVisible)
    : [];
  const headerLines = cluster(
    headerControls.map((c) => c.getBoundingClientRect().top),
    6,
  ).length;
  return {
    viewport: { w: innerWidth, h: innerHeight },
    remW: r(innerWidth / parseFloat(getComputedStyle(document.documentElement).fontSize)),
    pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1,
    deckScrolls: deck.scrollWidth > deck.clientWidth + 1,
    headerLines,
    bandHeight: r(band?.getBoundingClientRect().height ?? 0),
    bandBottom: r(band?.getBoundingClientRect().bottom ?? 0),
    rows,
    natural,
    items,
  };
}

/** Marker facts that prove a state is the state it is named for. */
function readMarkers(): Reading {
  const q = (s: string): HTMLElement | null => document.querySelector<HTMLElement>(s);
  const text = (s: string): string | null => {
    const el = q(s);
    return el ? (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 60) : null;
  };
  return {
    pen: text('[data-toolbar-item="pen"]'),
    addLabel: (q('[data-toolbar-item="add-activity"]')?.textContent ?? '').trim(),
    linkLabel: (q('[data-toolbar-item="link-tool"]')?.textContent ?? '').trim(),
    conflictChip: q('[data-toolbar-item="next-conflict-status"]')?.textContent?.trim() ?? null,
    ganttPressed: q('[data-toolbar-item="view-gantt"]')?.getAttribute('aria-pressed') ?? null,
    tsldPressed: q('[data-toolbar-item="view-tsld"]')?.getAttribute('aria-pressed') ?? null,
    colourOnBar: q('[data-toolbar-item="colour-by-criticality"]') !== null,
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

async function signUp(page: Page, stamp: number): Promise<string> {
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
  return orgSlug;
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
      const w = window as unknown as { __hb?: number };
      if (w.__hb) clearInterval(w.__hb);
      w.__hb = window.setInterval(() => {
        void fetch(`${url}/heartbeat`, { method: 'POST', credentials: 'include' });
      }, 15_000);
      return { ok: r.ok, status: r.status };
    },
    { o: org, p: planId },
  );
  expect(res.ok, `peer could not take the pen: ${JSON.stringify(res)}`).toBe(true);
}

async function peerReleasesPen(b: Page, org: string, planId: string): Promise<void> {
  await b.evaluate(
    async ({ o, p }: { o: string; p: string }) => {
      const w = window as unknown as { __hb?: number };
      if (w.__hb) clearInterval(w.__hb);
      await fetch(`/api/v1/organizations/${o}/plans/${p}/edit-lock`, {
        method: 'DELETE',
        credentials: 'include',
      });
    },
    { o: org, p: planId },
  );
}

async function inviteAndSignUpPeer(a: Page, browser: Browser, stamp: number): Promise<Page> {
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
  return b;
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`toolbar-grid M0 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M0 readings, ${TAG}, ${pointer} pointer`, async ({ page, browser }) => {
      test.setTimeout(3_600_000);
      const name = `toolbar-grid-m0-${TAG}.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = {
        pointer,
        tag: TAG,
        lean: LEAN,
        cells: [] as Reading[],
        photos: [] as string[],
      };
      const cells = record.cells as Reading[];
      const save = (): void => {
        writeMeasurement(name, record);
      };
      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);

      const orgSlug = await signUp(page, stamp);
      await assertPointer(page, pointer);
      const peer = await inviteAndSignUpPeer(page, browser, stamp);
      await createHierarchy(page);
      // The M5/M6 fixture: a long plan name, three activities and one link.
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

      /** Header + band + ~120 px of canvas, so a reader sees what the bar sits above. */
      const shoot = async (cell: Cell, state: string, bandBottom: number): Promise<void> => {
        const file = `m0-${pointer}-${cell.label}-${state}.png`;
        await page.screenshot({
          path: `${PHOTO_DIR}/${file}`,
          clip: {
            x: 0,
            y: 0,
            width: cell.w,
            height: Math.min(cell.h, Math.ceil(bandBottom) + 120),
          },
        });
        (record.photos as string[]).push(file);
      };

      const sweep = async (state: string, photos: boolean): Promise<void> => {
        for (const c of CELLS) {
          await page.setViewportSize({ width: c.w, height: c.h });
          await page.waitForTimeout(550);
          const reading = await page.evaluate(readDeck);
          const markers = await page.evaluate(readMarkers);
          cells.push({ state, cell: c.label, markers, ...reading });
          if (photos && PHOTOS && !LEAN && PHOTO_LABELS.has(c.label)) {
            await shoot(c, state, Number(reading.bandBottom));
          }
        }
        log(`${state} done`);
        save();
      };

      const armAddFinish = async (): Promise<void> => {
        await page.setViewportSize({ width: 1912, height: 1080 });
        await page.waitForTimeout(500);
        const promoted = page.getByRole('button', { name: /^(Add: )?Finish milestone$/ });
        if (await promoted.isVisible().catch(() => false)) {
          await promoted.click();
        } else {
          await page.getByRole('button', { name: /^Activity type:/ }).click();
          await page
            .getByRole('menuitemradio', { name: 'Finish milestone' })
            .or(page.getByRole('menuitem', { name: 'Finish milestone' }))
            .click();
        }
        await expect
          .poll(async () => (await page.evaluate(readMarkers)).addLabel)
          .toMatch(/^Adding Finish milestone/);
      };

      // ---- 1. pen held ---------------------------------------------------------------------
      await reopen(true);
      await sweep('pen', true);

      // CQ-1 (b)'s cost: the width of a visible "Find" label in the deck's own label font, plus the
      // 4 px the control gap would add. Measured with a throwaway span set in the Filter label's font.
      await page.setViewportSize({ width: 1912, height: 1080 });
      record.findLabelProbe = await page.evaluate(() => {
        const filter = document.querySelector('[data-toolbar-item="filter"]');
        const label = filter
          ? [...filter.querySelectorAll('span')].find(
              (s) => (s.textContent ?? '').trim() === 'Filter',
            )
          : null;
        if (!label) return null;
        const probe = document.createElement('span');
        probe.textContent = 'Find';
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
        const cs = getComputedStyle(label);
        // The longhands, not `cs.font`: Chromium returns the shorthand empty for a computed style.
        probe.style.fontFamily = cs.fontFamily;
        probe.style.fontSize = cs.fontSize;
        probe.style.fontWeight = cs.fontWeight;
        probe.style.letterSpacing = cs.letterSpacing;
        document.body.append(probe);
        const w = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          text: 'Find',
          width: Math.round(w * 10) / 10,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
        };
      });

      // ---- 2. add armed with its longest label ---------------------------------------------
      await reopen(true);
      await armAddFinish();
      await sweep('add-armed', false);
      await page.keyboard.press('Escape');

      if (!LEAN) {
        // ---- 3. pen not held: what a reader meets first -----------------------------------
        await reopen(true);
        await page.getByRole('button', { name: 'Stop editing' }).click();
        await expect(page.getByRole('button', { name: 'Start editing' })).toBeVisible();
        await sweep('nopen', true);

        // ---- 4. link armed ----------------------------------------------------------------
        await reopen(true);
        await page.locator('[data-toolbar-item="link-tool"]').click();
        await expect
          .poll(async () => (await page.evaluate(readMarkers)).linkLabel)
          .toMatch(/^Linking/);
        await sweep('link-armed', false);
        await page.keyboard.press('Escape');

        // ---- 5. the Gantt view ------------------------------------------------------------
        await reopen(true);
        await page.locator('[data-toolbar-item="view-gantt"]').click();
        await expect.poll(async () => (await page.evaluate(readMarkers)).ganttPressed).toBe('true');
        await sweep('gantt', false);
        await page.locator('[data-toolbar-item="view-tsld"]').click();

        // ---- 6. a peer holds the pen ------------------------------------------------------
        await reopen(true);
        await page.getByRole('button', { name: 'Stop editing' }).click();
        await peerTakesPen(peer, orgSlug, planId);
        await page.reload();
        await waitDeck(page);
        await sweep('peer-pen', true);
        await peerReleasesPen(peer, orgSlug, planId);
      }

      // ---- 7. a conflict, cycling: LOOK's worst state --------------------------------------
      await reopen(true);
      await placeViaApi(page, orgSlug, 'Excavate to formation', '2026-01-05');
      await recalculate(page, orgSlug);
      await waitDeck(page);
      await expect
        .poll(
          async () => (await placements(page, orgSlug)).some((p) => p.visualConflict === true),
          {
            timeout: 25_000,
          },
        )
        .toBe(true);
      await reopen(true);
      await page.locator('[data-toolbar-item="next-conflict"]').first().click();
      await page.waitForTimeout(500);
      await expect
        .poll(async () => (await page.evaluate(readMarkers)).conflictChip)
        .toMatch(/^Conflict \d+ of \d+/);
      if (!LEAN) await sweep('conflict', true);

      // ---- 8. the conflict AND a peer holding the pen: the worst of both rows --------------
      await page.getByRole('button', { name: 'Stop editing' }).click();
      await peerTakesPen(peer, orgSlug, planId);
      await page.reload();
      await waitDeck(page);
      await page.locator('[data-toolbar-item="next-conflict"]').first().click();
      await page.waitForTimeout(500);
      await expect
        .poll(async () => (await page.evaluate(readMarkers)).conflictChip)
        .toMatch(/^Conflict \d+ of \d+/);
      await sweep('conflict+peer-pen', false);
      await peerReleasesPen(peer, orgSlug, planId);
      save();
      expect(cells.length).toBeGreaterThan(0);
    });
  });
}

/**
 * Forced colours, today (M0-T1 item 6): the chosen Diagram | Gantt segment and the chosen Colour value,
 * each read in both of its states. `forcedColors: 'active'` is Chromium's emulation of Windows High
 * Contrast, not the mode on real hardware (the `e2e-forced-colors` suites say the same), so this is the
 * input to SC-5's forced-colours case and not a verdict on a machine.
 */
test.describe('toolbar-grid M0 (forced colours)', () => {
  test.use({ actionTimeout: 8_000, forcedColors: 'active' });

  test(`M0 forced-colours reading, ${TAG}`, async ({ page }) => {
    test.setTimeout(600_000);
    const name = `toolbar-grid-m0-${TAG}.forced-colors`;
    clearMeasurement(name);
    await page.addInitScript((key: string) => {
      window.localStorage.setItem(key, '1');
    }, VIEWPORT_NOTICE_ACK_KEY);
    const stamp = Date.now() + 7;
    const orgSlug = await signUp(page, stamp);
    await createHierarchy(page);
    await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
    await ensurePen(page);
    await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 12 }]);
    await recalculate(page, orgSlug);
    await page.setViewportSize({ width: 1912, height: 1080 });
    await waitDeck(page);
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);

    const styleOf = (loc: Locator): Promise<Reading> =>
      loc.evaluate((el) => {
        const read = (cs: CSSStyleDeclaration): Reading => ({
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          borderTop: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
          borderBottom: `${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor}`,
          outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
          boxShadow: cs.boxShadow,
          textDecoration: cs.textDecorationLine,
          fontWeight: cs.fontWeight,
          forcedColorAdjust: cs.forcedColorAdjust,
        });
        const pseudo = (which: '::before' | '::after'): Reading => {
          const cs = getComputedStyle(el, which);
          return { content: cs.content, backgroundColor: cs.backgroundColor, height: cs.height };
        };
        return {
          ariaPressed: el.getAttribute('aria-pressed'),
          ...read(getComputedStyle(el)),
          before: pseudo('::before'),
          after: pseudo('::after'),
        };
      });

    const record: Reading = { tag: TAG, segment: {}, colour: {}, photos: [] as string[] };
    const tsld = page.locator('[data-toolbar-item="view-tsld"]');
    const gantt = page.locator('[data-toolbar-item="view-gantt"]');
    const segment = record.segment as Reading;
    segment['tsld chosen: tsld'] = await styleOf(tsld);
    segment['tsld chosen: gantt'] = await styleOf(gantt);
    const segBox = tsld.locator('xpath=..');
    if (PHOTOS) await segBox.screenshot({ path: `${PHOTO_DIR}/m0-forced-colors-segment-tsld.png` });
    await gantt.click();
    await expect(gantt).toHaveAttribute('aria-pressed', 'true');
    segment['gantt chosen: tsld'] = await styleOf(tsld);
    segment['gantt chosen: gantt'] = await styleOf(gantt);
    if (PHOTOS)
      await segBox.screenshot({ path: `${PHOTO_DIR}/m0-forced-colors-segment-gantt.png` });
    await tsld.click();

    const colour = record.colour as Reading;
    const crit = page.locator('[data-toolbar-item="colour-by-criticality"]');
    const wbs = page.locator('[data-toolbar-item="colour-by-wbs"]');
    colour['present'] = (await crit.count()) > 0;
    if ((await crit.count()) > 0) {
      // The Colour set's three values sit side by side with no wrapper of their own, so the
      // picture is a clip over the first to the last.
      const setShot = async (file: string): Promise<void> => {
        const a = await crit.boundingBox();
        const b = await wbs.boundingBox();
        if (!a || !b) throw new Error('the Colour set has no box');
        if (!PHOTOS) return;
        await page.screenshot({
          path: `${PHOTO_DIR}/${file}`,
          clip: { x: a.x, y: a.y, width: b.x + b.width - a.x, height: a.height },
        });
      };
      colour['criticality chosen: criticality'] = await styleOf(crit);
      colour['criticality chosen: wbs'] = await styleOf(wbs);
      await setShot('m0-forced-colors-colour-criticality.png');
      await wbs.click();
      colour['wbs chosen: criticality'] = await styleOf(crit);
      colour['wbs chosen: wbs'] = await styleOf(wbs);
      await setShot('m0-forced-colors-colour-wbs.png');
      await crit.click();
      (record.photos as string[]).push(
        'm0-forced-colors-colour-criticality.png',
        'm0-forced-colors-colour-wbs.png',
      );
    }
    (record.photos as string[]).push(
      'm0-forced-colors-segment-tsld.png',
      'm0-forced-colors-segment-gantt.png',
    );
    writeMeasurement(name, record);
  });
});
