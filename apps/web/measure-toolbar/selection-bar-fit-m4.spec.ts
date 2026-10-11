import { expect, test, type Page } from '@playwright/test';

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
 * **Selection bar fit, M4: the Float paths label, and the group hairline** (`docs/specs/
 * selection-bar-fit/m4-measurement.md`). Two questions the reviewers left open, read from the
 * shipped DOM: (1) what the visible "Float paths" label costs in lines and foot-row height, and
 * (2) whether a group's hairline can start a wrapped line. Run once per tree and compare the two JSON
 * files: the shipped tree with `SBF_TAG=nolabel`, and a tree with the `float-paths` item's
 * `labelVisibility` temporarily edited to `'always'` with `SBF_TAG=label` (the default). A harness, not a gate (ADR-0081 §3).
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
const TAG = process.env['SBF_TAG'] ?? 'label';

type Reading = Record<string, unknown>;

function readBar(): Reading {
  const r = (n: number): number => Math.round(n * 10) / 10;
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
  bar.scrollIntoView({ block: 'center' });
  const items = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter(
    (e) => e.getBoundingClientRect().width > 1.5,
  );
  const tops = cluster(items.map((e) => e.getBoundingClientRect().top));
  const bb = bar.getBoundingClientRect();
  const fp = bar.querySelector<HTMLElement>('[data-toolbar-item="float-paths"]');
  const groups = [...bar.children].filter((e): e is HTMLElement => e instanceof HTMLElement);
  const hairlines = groups.slice(1).map((g) => {
    const gb = g.getBoundingClientRect();
    const cs = getComputedStyle(g);
    const inGroup = [...g.querySelectorAll<HTMLElement>('[data-toolbar-item]')].filter(
      (e) => e.getBoundingClientRect().width > 1.5,
    );
    const firstLineTop = Math.min(...inGroup.map((e) => e.getBoundingClientRect().top));
    const onFirstLine = inGroup.filter(
      (e) => Math.abs(e.getBoundingClientRect().top - firstLineTop) < 4,
    ).length;
    return {
      borderLeft: cs.borderLeftWidth,
      startsLine: gb.left - bb.left <= 8,
      leftOffset: r(gb.left - bb.left),
      boxH: r(gb.height),
      controlsOnItsFirstLine: onFirstLine,
      controls: inGroup.length,
      first: inGroup[0]?.getAttribute('data-toolbar-item') ?? null,
    };
  });
  const lastLineTop = tops[tops.length - 1] ?? 0;
  const lastLine = items
    .filter((e) => Math.abs(e.getBoundingClientRect().top - lastLineTop) < 4)
    .map((e) => e.getAttribute('data-toolbar-item'));
  const canvasH = canvas ? canvas.getBoundingClientRect().height : 0;
  return {
    coarse: matchMedia('(pointer: coarse)').matches,
    lines: tops.length,
    order: items.map((e) => e.getAttribute('data-toolbar-item')),
    barH: r(bb.height),
    footH: foot ? r(foot.getBoundingClientRect().height) : null,
    footScrollW: foot ? foot.scrollWidth : null,
    footW: foot ? r(foot.getBoundingClientRect().width) : null,
    canvasH: r(canvasH),
    floatPathsW: fp ? r(fp.getBoundingClientRect().width) : null,
    floatPathsText: fp ? (fp.textContent ?? '').trim() : null,
    floatPathsLine: fp
      ? tops.findIndex((t) => Math.abs(t - fp.getBoundingClientRect().top) < 4)
      : null,
    lastLine,
    hairlines,
    firstTabStop: items.find((e) => e.tabIndex === 0)?.getAttribute('data-toolbar-item') ?? null,
  };
}

async function selectByName(page: Page, id: string): Promise<void> {
  await page.keyboard.press('Escape');
  await diagramList(page).focus();
  await page.waitForTimeout(150);
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 14; i += 1) {
    if ((await selectedActivityId(page)) !== id) await page.keyboard.press('ArrowDown');
    if ((await selectedActivityId(page)) === id) {
      await page.waitForTimeout(300);
      return;
    }
  }
  throw new Error(`could not reach ${id.slice(-4)}`);
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

const TARGETS = ['Plain', 'Sitework', 'Steel beam', 'Pour slab', 'Frame'] as const;

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`selection-bar-fit M4 (${pointer})`, () => {
    test.use({ actionTimeout: 8_000 });
    if (pointer === 'coarse') test.use({ hasTouch: true });

    test(`M4 readings, ${pointer} pointer, ${TAG}`, async ({ page }) => {
      test.setTimeout(1_800_000);
      const name = `selection-bar-fit-m4.${TAG}.${pointer}`;
      clearMeasurement(name);
      const stamp = Date.now() + (pointer === 'coarse' ? 1 : 0);
      const record: Reading = {
        pointer,
        tag: TAG,
        diagram: [] as Reading[],
        gantt: [] as Reading[],
      };
      const diagram = record['diagram'] as Reading[];
      const gantt = record['gantt'] as Reading[];

      await page.addInitScript((key: string) => {
        window.localStorage.setItem(key, '1');
      }, VIEWPORT_NOTICE_ACK_KEY);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.goto('/sign-up');
      await page.getByLabel('Full name').fill('Fit Tester');
      await page.getByLabel('Email').fill(`fit4-${stamp}@example.com`);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /create an account/i }).click();
      await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
        timeout: 15_000,
      });
      await page.getByLabel('Organisation name').fill(`Fit4 Co ${stamp}`);
      await page.getByRole('button', { name: /create organisation/i }).click();
      const orgSlug = `fit4-co-${stamp}`;
      await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
      await createHierarchy(page);
      await newPlan(page, 'Fit M4');
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
      await patchActivity(page, orgSlug, 'Sitework', { visualStart: '2026-02-02' });
      await recalculate(page, orgSlug);
      await ensurePen(page);

      for (const cell of CELLS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(500);
        for (const t of TARGETS) {
          await selectByName(page, id(t));
          const reading = await page.evaluate(readBar);
          diagram.push({ cell: cell.label, target: t, ...reading });
          if (t === 'Frame' && ['1024x600', '1912x948'].includes(cell.label)) {
            await page.screenshot({
              path: `../../docs/specs/selection-bar-fit/photos/m4-diagram-${TAG}-${pointer}-${cell.label}-Frame.png`,
            });
          }
        }
        await page.keyboard.press('Escape');
        writeMeasurement(name, record);
      }

      await page.setViewportSize({ width: 1912, height: 948 });
      await showGantt(page);
      for (const cell of CELLS) {
        await page.setViewportSize({ width: cell.w, height: cell.h });
        await page.waitForTimeout(500);
        for (const t of ['Plain', 'Steel beam', 'Frame'] as const) {
          await ganttRow(page, t).click();
          await page.waitForTimeout(400);
          const reading = await page.evaluate(readBar);
          gantt.push({ cell: cell.label, target: t, ...reading });
          if (t === 'Frame' && ['1024x600', '1912x948'].includes(cell.label)) {
            await page.screenshot({
              path: `../../docs/specs/selection-bar-fit/photos/m4-gantt-${TAG}-${pointer}-${cell.label}-Frame.png`,
            });
          }
        }
        writeMeasurement(name, record);
      }
      expect(diagram.length).toBeGreaterThan(0);
    });
  });
}
