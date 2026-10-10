import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Browser, type BrowserContext, type Page } from '@playwright/test';

import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  createHierarchy,
  ensurePen,
  linkActivities,
  newPlan,
  onboard,
  openPlanId,
  placements,
  placeViaApi,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { PROMOTION_LADDER, type LadderRank } from '../src/features/tsld/toolbar/promotion-ladder';
import { PROMOTION_STAGES } from '../src/lib/breakpoints';

/**
 * **Free space is used** (toolbar-redesign M5; spec §4.11; SC-17, SC-18, E-1..E-3).
 *
 * The product owner's requirement: a command that lives in a menu comes out onto the bar when the
 * viewport has room, and falls back into the menu when it does not. This drives the real deck at the
 * four stages the product is judged at (1280, 1440, 1912, 2560) on **both pointers**, and asks the
 * questions in the order the requirement does:
 *
 * 1. **SC-17** — each deck row's unused width is ≤ 15 %, or no ladder entry that is still in a menu
 *    would fit in it. And every row is one line (coarse LOOK at 1280 is the one accepted exception:
 *    `m4-measurement.md` §2, a conflict read-out costs touch a line there, with nothing promoted).
 * 2. **SC-18 (a)** — at 3840 × 1440, past the widest stage, every promoted form's width is what
 *    `promotion-widths.<pointer>.json` says, within 2 px. A stale file fails here.
 * 3. **SC-18 (b)** — in the *worst* stress state (a cycling conflict read-out on LOOK, a peer
 *    holding the pen on DO), no entry left in a menu would fit the row's free gap. **Verified red**
 *    by raising one `at` in `promotion-ladder.ts` (see the record).
 * 4. **Placement** — each promoted item sits immediately after its source trigger inside the same
 *    deck group, group names are unchanged, the menu it left no longer lists it, every source
 *    trigger is present at every stage (E-3), and the roving order is the visual order.
 * 5. **Behaviour** — Critical only and Filter agree; a dock toggle follows the dock closed from its
 *    own close button; a kind preset arms its tool and is pen-gated with the same reason.
 * 6. **Focus** — E-1: a resize promotes the command a reader is on in a menu, and focus follows it
 *    and is announced. E-2: a resize demotes the command a reader is on, and focus lands on its
 *    source trigger with the reason, at 100 % text and at text-only 200 %.
 *
 * Not in a unit test because every defect here is a statement about a browser: rem media queries,
 * a real flex line, a real focus ring.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

interface WidthEntry {
  rank: LadderRank;
  row: 'look' | 'do';
  name: string;
  from: string;
  memberWidths: Record<string, number>;
  /** Set where promoting the entry also shortens its trigger's name; `width` is net of it. */
  triggerShrinkPx?: number;
  width: number;
}
interface WidthsFile {
  itemGapPx: number;
  safetyPx: number;
  entries: WidthEntry[];
  freeWidthByStage: Record<
    'look' | 'do',
    Record<keyof typeof STAGE_REM, { freeBase: number; freeWorst: number }>
  >;
}

function widthsFor(pointer: 'fine' | 'coarse'): WidthsFile {
  return JSON.parse(
    readFileSync(
      resolve(HERE, `../../../docs/specs/toolbar-redesign/promotion-widths.${pointer}.json`),
      'utf8',
    ),
  ) as WidthsFile;
}

const STAGE_REM = Object.fromEntries(
  PROMOTION_STAGES.map(({ name, rem }) => [name, rem]),
) as Record<(typeof PROMOTION_STAGES)[number]['name'], number>;

/** Is `rank` on the bar at a viewport `px` wide (16 px root)? The committed ladder, not a guess. */
function promotedAt(rank: LadderRank, pointer: 'fine' | 'coarse', px: number): boolean {
  const at = PROMOTION_LADDER[rank][pointer];
  return at !== 'never' && px >= STAGE_REM[at] * 16;
}

const CELLS = [
  { w: 1280, h: 800 },
  { w: 1440, h: 900 },
  { w: 1600, h: 900 },
  { w: 1912, h: 1080 },
  { w: 2160, h: 1200 },
  { w: 2560, h: 1440 },
] as const;

/** The viewport width a stage starts at, at the default 16 px root. */
const stagePx = (name: keyof typeof STAGE_REM): number => STAGE_REM[name] * 16;
/** The first width Critical only is on the bar at, on either pointer. */
const criticalOnlyPx = (pointer: 'fine' | 'coarse'): number => {
  const at = PROMOTION_LADDER.L1[pointer];
  if (at === 'never') throw new Error('Critical only never promotes');
  return stagePx(at);
};
/**
 * A window one step under the first stage (79.5 rem): nothing has been promoted, and Critical only is
 * a row of Filter. It was 1280 until the M6 re-take, when icon-only Baseline overlay, Comments and
 * Settings freed LOOK enough for Critical only to promote AT 80 rem.
 */
const NARROW = { w: 1272, h: 800 } as const;
const WIDE = { w: 3840, h: 1440 } as const;
/**
 * The range the SC-17 sweep walks, in CSS px at the default root: 1192 (where touch's LOOK row stops
 * wrapping) to just over the last stage; `ladderFrom` is the first stage, 80 rem.
 */
const SWEEP = { from: 1192, ladderFrom: 1280, to: 2600, step: 40 } as const;
/**
 * The most any row may be empty at a width between the stage cells — see `m5-measurement.md` §3,
 * which records the peaks these are set just over (fine 31.4 % / 26.5 %, coarse 22.8 % / 27.4 %).
 * Not the 15 % of the stage cells: a window can be any width, and the room only grows until the
 * next stage spends it. `compact` is the band under 80 rem, where labels are still icon-only and
 * nothing promotes by design.
 */
const CEILING_PCT = { compact: 33, ladder: 30 } as const;

const PASSWORD = 'correct-horse-battery';
const DECK = 'Plan commands';

const deck = (page: Page) => page.getByRole('toolbar', { name: DECK });
const item = (page: Page, id: string) => deck(page).locator(`[data-toolbar-item="${id}"]`);

async function settle(page: Page, size: { w: number; h: number }): Promise<void> {
  await page.setViewportSize({ width: size.w, height: size.h });
  await expect(deck(page)).toBeVisible();
  await page.waitForTimeout(450);
}

interface RowReading {
  natural: number;
  available: number;
  lines: number;
}

/**
 * Each deck row's natural (no-wrap) width and the width it has, and its line count. Measured on a
 * disposable clone so React's nodes are untouched — the harness technique, `measure-toolbar/
 * toolbar-redesign-m5.spec.ts`. Captions are as tall as a control, so they share their line.
 */
async function readRows(page: Page): Promise<Record<'look' | 'do', RowReading>> {
  return page.evaluate(() => {
    const deckEl = document.querySelector<HTMLElement>(
      '[role="toolbar"][aria-label="Plan commands"]:not([data-m0-clone])',
    );
    if (!deckEl) throw new Error('the deck was not found');
    const out = {} as Record<'look' | 'do', { natural: number; available: number; lines: number }>;
    const rowEl = (root: ParentNode, id: string): HTMLElement => {
      const el = root.querySelector<HTMLElement>(`[data-deck-row="${id}"]`);
      if (!el) throw new Error(`deck row ${id} missing`);
      return el;
    };
    const lines = (row: HTMLElement): number => {
      const tops = [...row.querySelectorAll('button, input')]
        .filter((c) => {
          const b = c.getBoundingClientRect();
          return b.width > 1.5 && b.height >= 24;
        })
        .map((c) => c.getBoundingClientRect().top)
        .sort((a, b) => a - b);
      const clustered: number[] = [];
      for (const t of tops) {
        const last = clustered[clustered.length - 1];
        if (last === undefined || t - last > 4) clustered.push(t);
      }
      return clustered.length;
    };
    const available: Record<string, number> = {};
    const counted: Record<string, number> = {};
    for (const id of ['look', 'do'] as const) {
      const row = rowEl(deckEl, id);
      available[id] = row.getBoundingClientRect().width;
      counted[id] = lines(row);
    }
    const tmp = deckEl.cloneNode(true) as HTMLElement;
    tmp.setAttribute('data-m0-clone', '');
    deckEl.style.display = 'none';
    deckEl.after(tmp);
    tmp.querySelectorAll<HTMLElement>('.flex-wrap').forEach((e) => (e.style.flexWrap = 'nowrap'));
    tmp.querySelectorAll<HTMLElement>('[role="group"]').forEach((e) => (e.style.flexShrink = '0'));
    for (const id of ['look', 'do'] as const) {
      const row = rowEl(tmp, id);
      row.style.width = 'max-content';
      row.style.alignSelf = 'flex-start';
      out[id] = {
        natural: Math.round(row.getBoundingClientRect().width * 10) / 10,
        available: Math.round((available[id] ?? 0) * 10) / 10,
        lines: counted[id] ?? 0,
      };
    }
    tmp.remove();
    deckEl.style.display = '';
    return out;
  });
}

/** The data-toolbar-item ids on the deck, in document order. */
async function barIds(page: Page): Promise<string[]> {
  return deck(page)
    .locator('[data-toolbar-item]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-toolbar-item') ?? ''));
}

/** Member item ids of a ladder entry — the keys of its committed `memberWidths`. */
const membersOf = (entry: WidthEntry): string[] => Object.keys(entry.memberWidths);

async function inviteAndSignUpPeer(
  a: Page,
  browser: Browser,
  stamp: number,
): Promise<{ b: Page; ctx: BrowserContext }> {
  await a.getByRole('link', { name: 'Members' }).click();
  await a.getByRole('button', { name: 'Invite member' }).click();
  const invite = a.getByRole('dialog');
  await invite.getByLabel('Email').fill(`peer-${stamp}@example.com`);
  await invite.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await invite.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await a.getByLabel('Invitation link').inputValue();
  await invite.getByRole('button', { name: 'Done' }).click();

  const ctx = await browser.newContext();
  const b = await ctx.newPage();
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
  return { b, ctx };
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
  expect(res.ok, `the peer could not take the pen: ${JSON.stringify(res)}`).toBe(true);
}

test.describe.configure({ mode: 'serial' });

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`The promotion ladder, ${pointer} pointer`, () => {
    const widths = widthsFor(pointer);
    let page: Page;
    let context: BrowserContext;
    let peerContext: BrowserContext;
    let peer: Page;
    let orgSlug: string;
    let planId: string;
    let planUrl: string;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(240_000);
      context = await browser.newContext({
        viewport: { width: 1646, height: 1097 },
        ...(pointer === 'coarse' ? { hasTouch: true } : {}),
      });
      await acknowledgeViewportNotice(context);
      page = await context.newPage();
      const stamp = Date.now() + (pointer === 'coarse' ? 3 : 0);
      orgSlug = await onboard(page, stamp);
      // The pointer is asserted before anything is measured: a mis-built context yields a green run
      // about the wrong set of widths, which is worse than no gate (ADR-0110 D5).
      expect(
        await page.evaluate(() =>
          window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
        ),
      ).toBe(pointer);
      ({ b: peer, ctx: peerContext } = await inviteAndSignUpPeer(page, browser, stamp));
      await createHierarchy(page);
      await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
      planId = openPlanId(page);
      await ensurePen(page);
      const [s0, s1] = await seedActivities(page, orgSlug, [
        { name: 'Site setup', laneIndex: 0, durationDays: 12 },
        { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
        { name: 'Pour slab', laneIndex: 2, durationDays: 6 },
      ]);
      if (!s0 || !s1) throw new Error('seed too short');
      await linkActivities(page, orgSlug, s0.id, s1.id);
      await recalculate(page, orgSlug);
      await ensurePen(page);
      planUrl = page.url();
    });

    test.afterAll(async () => {
      await peerContext.close();
      await context.close();
    });

    test('SC-17: each row is one line and at most 15 % empty, or nothing left in a menu would fit', async () => {
      for (const cell of CELLS) {
        await settle(page, cell);
        const rows = await readRows(page);
        const ids = new Set(await barIds(page));
        for (const row of ['look', 'do'] as const) {
          const r = rows[row];
          const unused = r.available - r.natural;
          const pct = (unused / r.available) * 100;
          // "Exhausted" is judged the way the ladder fills a row: with the worst stress state and the
          // safety margin reserved. A command that would fit this empty row and not the row with a
          // conflict read-out in it is correctly still in its menu (coarse LOOK at 1912 is 15.3 %
          // empty for exactly that reason: Feasible window would leave 0.4 px).
          const stageName = (Object.keys(STAGE_REM) as Array<keyof typeof STAGE_REM>).find(
            (name) => STAGE_REM[name] * 16 === cell.w,
          );
          if (!stageName) throw new Error(`${String(cell.w)} is not a stage cell`);
          const free = widths.freeWidthByStage[row][stageName];
          const reserve = free.freeBase - free.freeWorst + widths.safetyPx;
          const waiting = widths.entries.filter(
            (e) => e.row === row && !membersOf(e).some((m) => ids.has(m)),
          );
          const fits = waiting.filter((e) => e.width + widths.itemGapPx + reserve <= unused);
          const where = `${pointer} ${String(cell.w)} ${row}`;
          expect(
            pct <= 15 || fits.length === 0,
            `${where}: ${pct.toFixed(1)} % empty with ${fits.map((e) => e.rank).join(', ')} still fitting`,
          ).toBe(true);
          // Touch's LOOK row at 1280 is the one row that can wrap in the base state and does not:
          // the base state has 20.6 px spare there (`m4-measurement.md` §2).
          expect(r.lines, `${where}: wraps`).toBe(1);
        }
      }
    });

    test('SC-17, swept: across 1192-2600 no row is more than the documented share empty, and none wraps', async () => {
      test.setTimeout(240_000);
      // The stage cells above are the widths the ladder is *filled* at. Between them the window is
      // free to be any width, and the free room only grows until the next stage spends it — so the
      // honest claim is a ceiling over the whole range, not "15 % at six widths". Two ranges, two
      // ceilings (`m5-measurement.md` §3 records the peaks): below 80 rem the compact labels are
      // still hidden and nothing promotes (the ladder starts one rem over `--container-roomy`), so
      // that range has the unpromoted deck's gap; from 80 rem the ladder is at work.
      const peak = { compact: { w: 0, row: '', pct: -1 }, ladder: { w: 0, row: '', pct: -1 } };
      for (let w = SWEEP.from; w <= SWEEP.to; w += SWEEP.step) {
        await settle(page, { w, h: 1000 });
        const rows = await readRows(page);
        const range = w < SWEEP.ladderFrom ? 'compact' : 'ladder';
        for (const row of ['look', 'do'] as const) {
          const r = rows[row];
          const pct = ((r.available - r.natural) / r.available) * 100;
          if (pct > peak[range].pct) peak[range] = { w, row, pct };
          expect(r.lines, `${pointer} ${String(w)} ${row}: wraps`).toBe(1);
        }
      }
      test.info().annotations.push({
        type: 'sc-17 sweep peaks',
        description: `${pointer}: compact ${peak.compact.pct.toFixed(1)} % at ${String(peak.compact.w)} (${peak.compact.row}); ladder ${peak.ladder.pct.toFixed(1)} % at ${String(peak.ladder.w)} (${peak.ladder.row})`,
      });
      expect(
        peak.ladder.pct,
        `${pointer} ${String(peak.ladder.w)} ${peak.ladder.row}: ${peak.ladder.pct.toFixed(1)} % empty, ladder ceiling ${String(CEILING_PCT.ladder)} %`,
      ).toBeLessThanOrEqual(CEILING_PCT.ladder);
      expect(
        peak.compact.pct,
        `${pointer} ${String(peak.compact.w)} ${peak.compact.row}: ${peak.compact.pct.toFixed(1)} % empty, compact ceiling ${String(CEILING_PCT.compact)} %`,
      ).toBeLessThanOrEqual(CEILING_PCT.compact);
    });

    test('SC-18 (a): at 3840 × 1440 every promoted form is the width the committed file says', async () => {
      await settle(page, WIDE);
      const measured = await deck(page)
        .locator('[data-toolbar-item]')
        .evaluateAll((els) =>
          Object.fromEntries(
            els.map((el) => [
              el.getAttribute('data-toolbar-item') ?? '',
              Math.round(el.getBoundingClientRect().width * 10) / 10,
            ]),
          ),
        );
      for (const entry of widths.entries) {
        const at = PROMOTION_LADDER[entry.rank][pointer];
        if (at === 'never') {
          // Never on the bar, however wide: its width cannot be measured, so it is asserted absent.
          for (const m of membersOf(entry)) {
            expect(
              measured[m],
              `${entry.rank} (${m}) is on the bar but its stage is 'never'`,
            ).toBeUndefined();
          }
          continue;
        }
        let sum = 0;
        for (const [id, width] of Object.entries(entry.memberWidths)) {
          const got = measured[id];
          expect(got, `${entry.rank}: ${id} is not on the bar at 3840`).toBeDefined();
          expect(
            Math.abs((got ?? 0) - width),
            `${pointer} ${entry.rank} ${id}: ${String(got)} px, file says ${String(width)}`,
          ).toBeLessThanOrEqual(2);
          sum += got ?? 0;
        }
        // Net of the trigger it renames (Share… turns "Share & export" into "Export").
        const total =
          sum + widths.itemGapPx * (membersOf(entry).length - 1) - (entry.triggerShrinkPx ?? 0);
        expect(
          Math.abs(total - entry.width),
          `${pointer} ${entry.rank} (${entry.name}): ${total.toFixed(1)} px, file says ${String(entry.width)}`,
        ).toBeLessThanOrEqual(2 * membersOf(entry).length);
      }
    });

    test('each promoted item sits right after its source trigger, in the same group, and leaves its menu', async () => {
      for (const cell of CELLS) {
        await settle(page, cell);
        const ids = await barIds(page);
        const groups = await deck(page)
          .getByRole('group')
          .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
        // The deck groups are named as they always were: nothing grew a group.
        expect(groups, `${pointer} ${String(cell.w)}: group names`).toEqual([
          'View',
          'Find',
          'Panels',
          'Author',
          'Plan',
        ]);
        for (const entry of widths.entries) {
          const on = promotedAt(entry.rank, pointer, cell.w);
          const members = membersOf(entry);
          for (const m of members) {
            expect(ids.includes(m), `${pointer} ${String(cell.w)} ${entry.rank} ${m}`).toBe(on);
          }
          if (!on) continue;
          // Contiguous and in one group.
          const idx = members.map((m) => ids.indexOf(m));
          expect(idx, `${entry.rank} members are contiguous`).toEqual(
            idx.map((_, i) => (idx[0] ?? 0) + i),
          );
          const groupOf = async (id: string): Promise<string | null> =>
            item(page, id).evaluate(
              (el) => el.closest('[role="group"]')?.getAttribute('aria-label') ?? null,
            );
          const trigger =
            entry.from === 'Filter'
              ? 'filter'
              : entry.from === 'View'
                ? 'view'
                : entry.from === 'Analysis'
                  ? 'analysis'
                  : entry.from === 'Share & export'
                    ? 'export'
                    : entry.from === 'Add'
                      ? 'add-activity'
                      : 'link-tool';
          expect(await groupOf(members[0] ?? ''), `${entry.rank}: group`).toBe(
            await groupOf(trigger),
          );
        }
        // E-3: every source trigger is present at every stage.
        for (const trigger of [
          'filter',
          'view',
          'analysis',
          'export',
          'add-activity',
          'link-tool',
        ]) {
          await expect(item(page, trigger), `${trigger} at ${String(cell.w)}`).toBeVisible();
        }
      }
    });

    test('a promoted command is absent from its menu, not shaded', async () => {
      await settle(page, CELLS[CELLS.length - 1] ?? WIDE);
      const menus: Array<{
        trigger: string;
        open: () => Promise<void>;
        gone: Array<string | RegExp>;
      }> = [
        {
          trigger: 'analysis',
          open: () => item(page, 'analysis').click(),
          gone: [
            ...(promotedAt('P1', pointer, 2560) ? ['Health check…'] : []),
            ...(promotedAt('P6', pointer, 2560) ? ['Compare revisions…'] : []),
            ...(promotedAt('P7', pointer, 2560) ? ['Earned value…'] : []),
          ],
        },
        {
          trigger: 'export',
          open: () => item(page, 'export').click(),
          gone: promotedAt('P4', pointer, 2560) ? ['Share…'] : [],
        },
        {
          trigger: 'add-activity',
          open: () => page.getByRole('button', { name: /^Activity type:/ }).click(),
          gone: [
            ...(promotedAt('P2', pointer, 2560) ? ['Start milestone'] : []),
            ...(promotedAt('P3', pointer, 2560) ? ['Finish milestone'] : []),
          ],
        },
      ];
      for (const menu of menus) {
        await menu.open();
        const panel = page.getByRole('menu');
        await expect(panel).toBeVisible();
        for (const name of menu.gone) {
          await expect(panel.getByRole('menuitem', { name })).toHaveCount(0);
          await expect(panel.getByRole('menuitemradio', { name })).toHaveCount(0);
        }
        // The anchor is always there.
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
      }
      // Filter: Has constraint is the anchor; Critical left it with Critical only.
      await item(page, 'filter').click();
      const filterPanel = page.getByRole('dialog', { name: 'Filter' });
      await expect(filterPanel.getByRole('checkbox', { name: 'Has constraint' })).toBeVisible();
      await expect(filterPanel.getByRole('checkbox', { name: 'Critical' })).toHaveCount(
        promotedAt('L1', pointer, 2560) ? 0 : 1,
      );
      await page.keyboard.press('Escape');
    });

    test('the roving order is the visual order: ArrowRight, Home and End visit promoted items in place', async () => {
      await settle(page, CELLS[CELLS.length - 1] ?? WIDE);
      const dom = await barIds(page);
      const focusables = await deck(page)
        .locator('[data-toolbar-focusable]')
        .evaluateAll((els) =>
          els.map((el) => {
            const b = el.getBoundingClientRect();
            return {
              id: el.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ?? '',
              top: Math.round(b.top),
              left: Math.round(b.left),
            };
          }),
        );
      // Visual order: LOOK above DO, left to right within a row.
      const visual = [...focusables]
        .sort((a, b) => (Math.abs(a.top - b.top) > 8 ? a.top - b.top : a.left - b.left))
        .map((f) => f.id);
      expect(focusables.map((f) => f.id)).toEqual(visual);
      expect(dom.length).toBeGreaterThan(focusables.length - 1);
      // And the keys really walk it: Home, then ArrowRight to the second, then End to the last.
      await deck(page).locator('[data-toolbar-focusable]').first().focus();
      await page.keyboard.press('End');
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute('data-toolbar-item')),
      ).toBe(focusables[focusables.length - 1]?.id);
      await page.keyboard.press('Home');
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute('data-toolbar-item')),
      ).toBe(focusables[0]?.id);
      await page.keyboard.press('ArrowRight');
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute('data-toolbar-item')),
      ).toBe(focusables[1]?.id);
    });

    test('Critical only and Filter agree, and the state survives the window narrowing', async () => {
      await settle(page, { w: criticalOnlyPx(pointer), h: 900 });
      const critical = item(page, 'critical-only');
      await expect(critical).toHaveAttribute('aria-pressed', 'false');
      await critical.click();
      await expect(critical).toHaveAttribute('aria-pressed', 'true');
      // Narrow past its stage: the command is a row of Filter again, and it is checked.
      await settle(page, NARROW);
      await expect(item(page, 'critical-only')).toHaveCount(0);
      await item(page, 'filter').click();
      await expect(
        page.getByRole('dialog', { name: 'Filter' }).getByRole('checkbox', { name: 'Critical' }),
      ).toBeChecked();
      await page
        .getByRole('dialog', { name: 'Filter' })
        .getByRole('checkbox', { name: 'Critical' })
        .uncheck();
      await page.keyboard.press('Escape');
    });

    test('a dock toggle follows its dock, including a dock closed from its own close button', async () => {
      await settle(page, { w: 1912, h: 1080 });
      const health = item(page, 'health-check');
      await expect(health).toHaveAttribute('aria-pressed', 'false');
      await health.click();
      await expect(health).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('region', { name: 'Health check' })).toBeVisible();
      await page.getByRole('button', { name: 'Close health check' }).click();
      await expect(health).toHaveAttribute('aria-pressed', 'false');
      // And focus returns to the control that was pressed, not past it.
      expect(
        await page.evaluate(() => document.activeElement?.getAttribute('data-toolbar-item')),
      ).toBe('health-check');
    });

    test('a kind preset arms its tool exactly as the menu pick does', async () => {
      await settle(page, { w: 1912, h: 1080 });
      const preset = item(page, 'add-start-milestone');
      await expect(preset).toHaveAttribute('aria-pressed', 'false');
      await preset.click();
      await expect(preset).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: /^Adding Start milestone/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(preset).toHaveAttribute('aria-pressed', 'false');
    });

    test('E-1: a resize promotes the command a reader is on in a menu, and focus follows it', async () => {
      const before = NARROW;
      const after = { w: criticalOnlyPx(pointer), h: 900 };
      await settle(page, before);
      await item(page, 'filter').click();
      const critical = page
        .getByRole('dialog', { name: 'Filter' })
        .getByRole('checkbox', { name: 'Critical' });
      await critical.focus();
      await page.setViewportSize({ width: after.w, height: after.h });
      await expect(item(page, 'critical-only')).toBeFocused();
      await expect(page.getByTestId('announcer')).toHaveText(
        'Critical only is now on the toolbar.',
      );
      // The popover it left is not still open behind the move.
      await expect(page.getByRole('dialog', { name: 'Filter' })).toBeHidden();
    });

    test('E-1b: a resize closes a menu the reader is in, and focus lands on its trigger, not on the page', async () => {
      // Baselines… is the Analysis menu's anchor and never promotes, so the row survives the resize
      // and only the menu's closing could strand the reader. Verified red with the focus hand-off
      // removed from `useCloseWhenChanged`: focus is on <body>.
      const after = pointer === 'fine' ? { w: 1912, h: 1080 } : { w: 2560, h: 1440 };
      await settle(page, { w: 1280, h: 800 });
      await item(page, 'analysis').click();
      const menu = page.getByRole('menu', { name: 'Analysis' });
      await menu.getByRole('menuitem', { name: 'Baselines…' }).focus();
      await page.setViewportSize({ width: after.w, height: after.h });
      await expect(menu).toBeHidden();
      await expect(item(page, 'analysis')).toBeFocused();
      await expect(page.getByTestId('announcer')).toHaveText(
        'Menu closed because the toolbar changed.',
      );
    });

    test('E-1b: the same for a popover (Filter), on a row that does not move', async () => {
      const after = pointer === 'fine' ? { w: 1912, h: 1080 } : { w: 2560, h: 1440 };
      await settle(page, { w: 1280, h: 800 });
      await item(page, 'filter').click();
      const panel = page.getByRole('dialog', { name: 'Filter' });
      await panel.getByRole('checkbox', { name: 'Has constraint' }).focus();
      await page.setViewportSize({ width: after.w, height: after.h });
      await expect(panel).toBeHidden();
      await expect(item(page, 'filter')).toBeFocused();
    });

    test('E-2: a resize demotes the command a reader is on, and focus lands on its source trigger', async () => {
      await settle(page, { w: criticalOnlyPx(pointer), h: 900 });
      await item(page, 'critical-only').focus();
      await page.setViewportSize({ width: NARROW.w, height: NARROW.h });
      await expect(item(page, 'filter')).toBeFocused();
      await expect(page.getByTestId('announcer')).toHaveText(
        'Critical only is no longer on the toolbar. Moved into the Filter menu. Focus moved to Filter.',
      );
    });

    test('E-2 at text-only 200 %: the same hand-off when the stage moves under a raised font size', async () => {
      test.setTimeout(240_000);
      const cdp = await context.newCDPSession(page);
      const setFonts = async (scale: 1 | 2): Promise<void> => {
        await cdp.send('Page.setFontSizes', {
          fontSizes: {
            standard: 16 * scale,
            fixed: 13 * scale,
            serif: 16 * scale,
            sansSerif: 16 * scale,
          },
        } as never);
      };
      try {
        await setFonts(2);
        // At a 32 px root, 2560 px is 80 rem (Critical only's stage) and 2544 px is 79.5 rem.
        await page.setViewportSize({ width: criticalOnlyPx(pointer) * 2, height: 1440 });
        await page.goto(planUrl);
        await expect(deck(page)).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(700);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe(
          '32px',
        );
        await expect(item(page, 'critical-only')).toBeVisible();
        await item(page, 'critical-only').focus();
        await page.setViewportSize({ width: NARROW.w * 2, height: 1440 });
        await expect(item(page, 'filter')).toBeFocused();
        await expect(page.getByTestId('announcer')).toContainText('Moved into the Filter menu.');
      } finally {
        await setFonts(1);
        await cdp.detach();
        await page.setViewportSize({ width: 1646, height: 1097 });
        await page.goto(planUrl);
        await expect(deck(page)).toBeVisible();
        await ensurePen(page);
      }
    });

    test('SC-18 (b): in the worst stress state no command left in a menu would fit the free gap', async () => {
      test.setTimeout(240_000);
      // Conflict: place a bar before its logic allows, recalculate; then a peer takes the pen and the
      // reader steps the conflict so the read-out is the long "Conflict n of m".
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto(planUrl);
      await ensurePen(page);
      await placeViaApi(page, orgSlug, 'Excavate to formation', '2026-01-05');
      await recalculate(page, orgSlug);
      await expect
        .poll(
          async () => (await placements(page, orgSlug)).some((r) => r.visualConflict === true),
          {
            timeout: 25_000,
          },
        )
        .toBe(true);
      await peerTakesPen(peer, orgSlug, planId);
      await page.reload();
      await expect(deck(page)).toBeVisible();
      await item(page, 'next-conflict').click();
      await expect(item(page, 'next-conflict-status')).toHaveText(/^Conflict \d+ of \d+/);
      for (const cell of CELLS) {
        await settle(page, cell);
        const rows = await readRows(page);
        const ids = new Set(await barIds(page));
        for (const row of ['look', 'do'] as const) {
          const r = rows[row];
          const free = r.available - r.natural;
          const where = `${pointer} ${String(cell.w)} ${row}`;
          // Pre-existing and accepted for touch (`m4-measurement.md` §2): the read-out alone wraps
          // coarse LOOK at 1280 before anything is promoted into it.
          if (!(pointer === 'coarse' && cell.w === 1280 && row === 'look')) {
            expect(r.lines, `${where}: wraps with a conflict read-out and a peer's pen`).toBe(1);
          }
          const waiting = widths.entries.filter(
            (e) => e.row === row && !membersOf(e).some((m) => ids.has(m)),
          );
          const fits = waiting.filter((e) => e.width + widths.itemGapPx + widths.safetyPx <= free);
          expect(
            fits.map((e) => e.rank),
            `${where}: ${free.toFixed(1)} px free in the worst state and ${fits.map((e) => e.rank).join(', ')} would fit`,
          ).toEqual([]);
        }
      }
    });

    test("the Add and Link presets are pen-gated with the pen's own reason", async () => {
      // Continues the worst-state page: a peer holds the pen.
      await settle(page, { w: 1912, h: 1080 });
      const preset = item(page, 'add-start-milestone');
      await expect(preset).toHaveAttribute('aria-disabled', 'true');
      await preset.focus();
      await expect(preset).toHaveAccessibleDescription(/editing this plan|Request control/i);
    });
  });
}
