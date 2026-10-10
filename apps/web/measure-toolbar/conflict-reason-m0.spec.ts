import { expect, type Page, test } from '@playwright/test';

import {
  createHierarchy,
  diagramList,
  ensurePen,
  linkActivities,
  newPlan,
  openPlanId,
  placeViaApi,
  placements,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Conflict reason on the object, M0: measure the problem and the remedy before building it**
 * (`docs/specs/conflict-reason-on-object/implementation-plan.md` M0; the record is `m0-measurement.md`).
 *
 * The spec was written without a browser, so every figure in it is an estimate. This reads the REAL
 * selection bar for each conflict type (with Float paths on the bar, which is default-on), then
 * injects a probe node that carries the read-out's metrics and exact wording as the bar's first
 * item, and reads what that does to the bar's lines, the foot row and the canvas. The probe is the
 * only projection, and it is the thing the spec's Q1/Q2 are about: the label copy is not in the
 * product yet.
 *
 * A harness, not a gate (ADR-0081 §3). Run: `PLAYWRIGHT_CHROMIUM_PATH=... pnpm --filter @repo/web
 * measure:toolbar -- conflict-reason-m0` against an api and a web dev server (`E2E_BASE_URL`).
 */

interface Cell {
  label: string;
  w: number;
  h: number;
}

const CELLS: readonly Cell[] = [
  { label: '1024x600', w: 1024, h: 600 },
  { label: '1280x800', w: 1280, h: 800 },
  { label: '1440x900', w: 1440, h: 900 },
  { label: '1646x1097', w: 1646, h: 1097 },
  { label: '1912x1080', w: 1912, h: 1080 },
];

const SHOT_CELLS = new Set(['1024x600', '1912x1080']);
const PASSWORD = 'correct-horse-battery';

/** The new copy (spec §1 Defaults) - the strings the probe carries. */
const L = {
  constraint: 'Constraint not met',
  earlier: 'Placed before its logic allows',
  later: 'Placed after its constraint date',
  leveling: "Can't be levelled within its window",
} as const;

interface Target {
  /** The activity this selection lands on. */
  name: string;
  /** What it is, for the record. */
  kind: string;
  /** The probe text: the wording the read-out would carry for this activity. `null` = baseline only. */
  probe: string | null;
  /** True when the flag could not be seeded and the text is projected onto an unflagged activity. */
  projected?: boolean;
}

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[conflict-reason m0 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

type Reading = Record<string, unknown>;

/**
 * The in-page reader. Self-contained (Playwright serialises it). With `probeText` it injects the
 * read-out stand-in as the bar's first item and reads again; it always removes the probe.
 */
function readBar(opts: { probeText: string | null }): Reading {
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
  const coarse = matchMedia('(pointer: coarse)').matches;

  const snapshot = (): Reading => {
    const items = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter(isVisible);
    const tops = cluster(items.map((e) => e.getBoundingClientRect().top));
    const bb = bar.getBoundingClientRect();
    const rightmost = Math.max(...items.map((e) => e.getBoundingClientRect().right));
    const clipped = items.filter((e) => {
      const b = e.getBoundingClientRect();
      return b.right > bb.right + 1 || b.bottom > bb.bottom + 1;
    }).length;
    const canvasH = canvas ? canvas.getBoundingClientRect().height : 0;
    const rulerH = ruler ? ruler.getBoundingClientRect().height : 0;
    return {
      lines: tops.length,
      itemCount: items.length,
      barH: r(bb.height),
      barW: r(bb.width),
      usedW: r(rightmost - bb.left),
      outletW: r(bar.parentElement?.getBoundingClientRect().width ?? 0),
      footH: foot ? r(foot.getBoundingClientRect().height) : null,
      canvasH: r(canvasH),
      rulerH: r(rulerH),
      // 60 is `LANE_HEIGHT` in `tsld/render/geometry.ts`; the page function cannot close over a constant.
      rowsVisible: Math.floor(Math.max(0, canvasH - rulerH) / 60),
      clipped,
    };
  };

  /** Any label in the bar clipped by an ellipsis right now (spec §4.6: do the remedy labels truncate?). */
  const truncated = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item] *')]
    .filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1)
    .map(
      (e) =>
        `${e.closest('[data-toolbar-item]')?.getAttribute('data-toolbar-item') ?? '?'}: ${(e.textContent ?? '').trim()}`,
    );

  const before = snapshot();
  const out: Reading = {
    coarse,
    text: (bar.textContent ?? '').replace(/\s+/g, ' ').trim(),
    items: [...bar.querySelectorAll('[data-toolbar-item]')]
      .filter(isVisible)
      .map((e) => e.getAttribute('data-toolbar-item')),
    truncated,
    ...before,
  };
  if (opts.probeText === null) return out;

  const first = bar.querySelector('[data-toolbar-item]');
  if (!first?.parentElement) return { ...out, probe: 'no first item to anchor on' };
  const fontSize = getComputedStyle(first).fontSize;
  const probe = document.createElement('span');
  probe.setAttribute('data-m0-probe', '');
  Object.assign(probe.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: coarse ? '0 12px' : '0 8px',
    minHeight: 'var(--control-h)',
    fontSize,
    whiteSpace: 'normal',
  });
  const icon = document.createElement('span');
  Object.assign(icon.style, {
    width: '16px',
    height: '16px',
    flex: 'none',
    display: 'inline-block',
  });
  const text = document.createElement('span');
  text.textContent = opts.probeText;
  probe.append(icon, text);
  first.parentElement.insertBefore(probe, first);

  const after = snapshot();
  // Natural width: the same node with wrapping off, so a wrap is attributable to the column and not
  // to a guess at the glyph metrics.
  probe.style.whiteSpace = 'nowrap';
  probe.style.width = 'max-content';
  const naturalW = r(probe.getBoundingClientRect().width);
  // The most width the read-out can take before the bar gains a line: bisect a fixed-width probe
  // against the baseline line count. This is the free width, which the bar's own right edge cannot
  // give (it stretches to the outlet).
  const baseLines = before['lines'] as number;
  const linesNow = (): number =>
    cluster(
      [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')]
        .filter(isVisible)
        .map((e) => e.getBoundingClientRect().top),
    ).length;
  probe.style.boxSizing = 'border-box';
  let lo = 0;
  let hi = 1600;
  for (let i = 0; i < 14; i += 1) {
    const mid = (lo + hi) / 2;
    probe.style.width = `${mid}px`;
    if (linesNow() <= baseLines) lo = mid;
    else hi = mid;
  }
  probe.remove();
  return { ...out, probe: { text: opts.probeText, naturalW, maxFitW: r(lo), ...after } };
}

async function selectByName(page: Page, id: string): Promise<void> {
  await diagramList(page).focus();
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
  const seen: string[] = [];
  for (let i = 0; i < 14; i += 1) {
    seen.push(
      String(await selectedActivityId(page)).slice(-4) +
        '@' +
        (await page.evaluate(() =>
          (
            document.activeElement?.getAttribute('aria-label') ??
            document.activeElement?.tagName ??
            ''
          ).slice(0, 14),
        )),
    );
    if ((await selectedActivityId(page)) !== id) await page.keyboard.press('ArrowDown');
    if ((await selectedActivityId(page)) === id) {
      await page.waitForTimeout(300);
      return;
    }
  }
  throw new Error(`could not reach ${id.slice(-4)}: ${seen.join(',')}`);
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

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`conflict-reason M0 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M0 readings, ${pointer} pointer`, async ({ page }) => {
      test.setTimeout(3_600_000);
      const name = `conflict-reason-m0.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = { pointer, cells: [] as Reading[], flags: [] as Reading[] };
      const cells = record.cells as Reading[];

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);

      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto('/sign-up');
      await page.getByLabel('Full name').fill('Reason Tester');
      await page.getByLabel('Email').fill(`reason-${stamp}@example.com`);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /create an account/i }).click();
      await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel('Organisation name').fill(`Reason Co ${stamp}`);
      await page.getByRole('button', { name: /create organisation/i }).click();
      const orgSlug = `reason-co-${stamp}`;
      await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
      await createHierarchy(page);
      await newPlan(page, 'Reason M0');
      const planId = openPlanId(page);
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

      // What the engine actually flagged: the fixture is only as good as this table.
      const flags = await page.evaluate(
        async ({ o, p }: { o: string; p: string }) => {
          const res = await fetch(`/api/v1/organizations/${o}/plans/${p}/activities?limit=100`, {
            credentials: 'include',
          });
          const body = (await res.json()) as {
            data: Array<Record<string, unknown>>;
          };
          return body.data.map((a) => ({
            name: a['name'],
            constraintViolated: a['constraintViolated'],
            visualConflictReason: a['visualConflictReason'],
            levelingWindowExceeded: a['levelingWindowExceeded'],
            hasPlacement: a['visualStart'] !== null,
          }));
        },
        { o: orgSlug, p: planId },
      );
      (record['flags'] as Reading[]).push(...(flags as Reading[]));
      log(`flags ${JSON.stringify(flags)}`);
      writeMeasurement(name, record);

      const flagOf = (n: string): { c: boolean; r: unknown; l: boolean } => {
        const f = flags.find((x) => x.name === n);
        return {
          c: f?.constraintViolated === true,
          r: f?.visualConflictReason ?? null,
          l: f?.levelingWindowExceeded === true,
        };
      };
      const frame = flagOf('Frame');
      const frameText =
        frame.c && frame.r === 'LATER_THAN_BOUND'
          ? `${L.constraint}, placed after its constraint date`
          : frame.c
            ? L.constraint
            : L.later;
      const targets: Target[] = [
        { name: 'Plain', kind: 'unflagged, no placement', probe: null },
        { name: 'Sitework', kind: 'unflagged, with placement', probe: null },
        { name: 'Steel beam', kind: 'constraintViolated, no placement', probe: L.constraint },
        { name: 'Pour slab', kind: 'visualEarlierThanLogic, with placement', probe: L.earlier },
        { name: 'Roof', kind: 'visualLaterThanBound (SNLT), with placement', probe: L.later },
        {
          name: 'Frame',
          kind: `constraint + placement (engine flags: ${JSON.stringify(frame)})`,
          probe: frameText,
        },
        {
          name: 'Plain',
          kind: 'levelingWindowExceeded: PROJECTED onto an unflagged activity (not seedable here)',
          probe: L.leveling,
          projected: true,
        },
        {
          name: 'Sitework',
          kind: 'levelling text, projected, with placement (worst case for the bar)',
          probe: L.leveling,
          projected: true,
        },
        {
          name: 'Frame',
          kind: 'longest two-flag string, projected onto the placed constraint activity',
          probe: `${L.constraint}, can't be levelled within its window`,
          projected: true,
        },
      ];

      for (const cell of CELLS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(500);
        for (const t of targets) {
          await selectByName(page, id(t.name));
          const reading = await page.evaluate(readBar, { probeText: t.probe });
          if (SHOT_CELLS.has(cell.label) && pointer === 'fine' && t.projected !== true) {
            await page.screenshot({
              path: `../../docs/specs/conflict-reason-on-object/photos/m0-${cell.label}-${t.name.replace(/ /g, '-')}.png`,
            });
          }
          cells.push({
            cell: cell.label,
            target: t.name,
            kind: t.kind,
            projected: t.projected === true,
            ...reading,
          });
          log(`${pointer} ${cell.label} ${t.name} ${t.projected ? '(projected) ' : ''}done`);
        }
        // The "before" a sighted user sees after Next conflict, for the flagged types, as text.
        await page.keyboard.press('Escape');
        writeMeasurement(name, record);
      }

      // Before-evidence: what the toolbar and the bar say after Next conflict today.
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.waitForTimeout(400);
      const seen: Reading[] = [];
      const next = page.locator('[data-toolbar-item="next-conflict"]').first();
      for (let i = 0; i < 5; i += 1) {
        await next.click();
        await page.waitForTimeout(450);
        seen.push(
          await page.evaluate(() => ({
            chip:
              document
                .querySelector('[data-toolbar-item="next-conflict-status"]')
                ?.textContent?.trim() ?? null,
            bar: (
              document.querySelector('[role="toolbar"][aria-label^="Actions for"]')?.textContent ??
              ''
            )
              .replace(/\s+/g, ' ')
              .trim(),
            barName:
              document
                .querySelector('[role="toolbar"][aria-label^="Actions for"]')
                ?.getAttribute('aria-label') ?? null,
          })),
        );
      }
      record['afterNextConflictToday'] = seen;
      writeMeasurement(name, record);
      expect(cells.length).toBeGreaterThan(0);
    });
  });
}
