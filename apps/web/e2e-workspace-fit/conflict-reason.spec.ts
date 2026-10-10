import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, type Page } from '@playwright/test';

import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  createHierarchy,
  diagramList,
  ensurePen,
  linkActivities,
  newPlan,
  onboard,
  placeViaApi,
  placements,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';

/**
 * **The reason line costs the controls nothing, and what it costs the canvas is bounded**
 * (conflict-reason-on-object, ADR-0186).
 *
 * The reason sits on its own line above the selection bar's controls (`m0-measurement.md`: an
 * inline item cost a line at 1912 x 1080, which the owner declined). So the claims here are three:
 *
 * 1. **The controls never reflow.** The toolbar's height with the line shown equals its height with
 *    the line hidden, in every cell, on both pointers. This is the structural claim: a regression
 *    that moves the reason back inline makes the toolbar wrap and fails here.
 * 2. **The line is bounded.** One line (≤ 24 px) at 1912 x 1080, and at most two (≤ 44 px) at the
 *    1024 x 600 floor, where the two-flag text is wider than the 347 px column and wraps. The foot
 *    row grows by no more than that.
 * 3. **Every control the bar draws is pointer-reachable and the bar passes axe**, flagged.
 *
 * It asserts a bound, not the equality `dock.spec.ts` asserts for an unconflicted selection: an
 * unconflicted selection costs the canvas nothing and still does, and that spec is unedited.
 *
 * **Its own context per pointer, and not `test.use({ hasTouch })`** — see `command-surface.spec.ts`:
 * the `matchMedia` assertion runs first, because a mis-built context makes every number below about
 * the wrong pointer and green.
 */
const CELLS = [
  { label: '1024x600', width: 1024, height: 600 },
  { label: '1912x1080', width: 1912, height: 1080 },
] as const;

async function build(
  page: Page,
  stamp: number,
): Promise<{ orgSlug: string; ids: Record<string, string> }> {
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, 'Reason fit');
  await ensurePen(page);
  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Excavate', laneIndex: 0 },
    { name: 'Pour slab', laneIndex: 1 },
    { name: 'Steel beam', laneIndex: 2 },
    { name: 'Frame', laneIndex: 3 },
    { name: 'Plain', laneIndex: 4 },
  ]);
  const ids = Object.fromEntries(seeded.map((s) => [s.name, s.id]));
  const [excavate, pour] = seeded;
  if (!excavate || !pour) throw new Error('seed too short');
  await linkActivities(page, orgSlug, excavate.id, pour.id);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await placeViaApi(page, orgSlug, 'Pour slab', '2026-01-05');
  const patch = async (name: string, body: Record<string, unknown>): Promise<void> => {
    const row = (await placements(page, orgSlug)).find((p) => p.name === name);
    if (!row) throw new Error(`no ${name}`);
    const failure = await page.evaluate(
      async ({
        org,
        id,
        version,
        patchBody,
      }: {
        org: string;
        id: string;
        version: number;
        patchBody: object;
      }) => {
        const res = await fetch(`/api/v1/organizations/${org}/activities/${id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...patchBody, version }),
        });
        return res.ok ? null : `${String(res.status)} ${await res.text()}`;
      },
      { org: orgSlug, id: row.id, version: row.version, patchBody: body },
    );
    if (failure !== null) throw new Error(`patch ${name}: ${failure}`);
  };
  await patch('Steel beam', { constraintType: 'MANDATORY_START', constraintDate: '2025-12-22' });
  // A mandatory start with a placement raises BOTH the constraint and the later-than-bound flag.
  await patch('Frame', {
    constraintType: 'MANDATORY_START',
    constraintDate: '2025-12-22',
    visualStart: '2026-01-20',
  });
  await recalculate(page, orgSlug);
  await ensurePen(page);
  return { orgSlug, ids };
}

async function select(page: Page, id: string): Promise<void> {
  const list = diagramList(page);
  await list.focus();
  for (let i = 0; i < 9; i += 1) await page.keyboard.press('ArrowUp');
  for (let i = 0; i < 12; i += 1) {
    const active = await list.getAttribute('aria-activedescendant');
    if (active?.endsWith(`-opt-${id}`)) return;
    await page.keyboard.press('ArrowDown');
  }
  throw new Error(`could not select ${id}`);
}

interface Reading {
  hasLine: boolean;
  text: string;
  lineH: number;
  toolbarH: number;
  toolbarHHidden: number;
  footH: number;
  footHHidden: number;
  unreachable: string[];
}

async function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('[role="toolbar"][aria-label^="Actions for"]');
    if (!bar) throw new Error('no selection bar');
    const line = document.querySelector<HTMLElement>('[data-conflict-reason]');
    const foot = document.querySelector<HTMLElement>('[data-activities-bar]');
    const h = (el: Element | null): number => el?.getBoundingClientRect().height ?? 0;
    const shown = { toolbar: h(bar), foot: h(foot) };
    const lineH = h(line);
    if (line) line.style.display = 'none';
    const hidden = { toolbar: h(bar), foot: h(foot) };
    if (line) line.style.display = '';
    const unreachable: string[] = [];
    for (const el of bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
      const b = el.getBoundingClientRect();
      if (b.width <= 1.5 || b.height <= 1.5) continue;
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const ok =
        cx >= 0 &&
        cy >= 0 &&
        cx <= innerWidth &&
        cy <= innerHeight &&
        top !== null &&
        el.contains(top);
      if (!ok) unreachable.push(el.getAttribute('data-toolbar-item') ?? '?');
    }
    return {
      hasLine: line !== null,
      text: (line?.textContent ?? '').trim(),
      lineH: lineH,
      toolbarH: shown.toolbar,
      toolbarHHidden: hidden.toolbar,
      footH: shown.foot,
      footHHidden: hidden.foot,
      unreachable,
    };
  });
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`The conflict reason line at the floor and on the owner's screen (${pointer})`, () => {
    let context: BrowserContext;
    let page: Page;
    let ids: Record<string, string>;

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(240_000);
      context = await browser.newContext({
        viewport: { width: 1646, height: 1097 },
        hasTouch: pointer === 'coarse',
      });
      await acknowledgeViewportNotice(context);
      page = await context.newPage();
      ({ ids } = await build(page, Date.now() + (pointer === 'coarse' ? 11 : 10)));
    });

    test.afterAll(async () => {
      await context.close();
    });

    test('the controls never reflow, the line is bounded, every control is reachable', async () => {
      test.setTimeout(240_000);
      const actual = await page.evaluate(() =>
        window.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine',
      );
      expect(actual, 'the context did not report the pointer this describe is about').toBe(pointer);

      for (const cell of CELLS) {
        await page.setViewportSize({ width: cell.width, height: cell.height });
        await page.waitForTimeout(500);
        for (const name of ['Steel beam', 'Pour slab', 'Frame']) {
          await select(page, ids[name] ?? '');
          await page.waitForTimeout(250);
          const r = await read(page);
          const where = `${pointer} ${cell.label} ${name}`;
          expect(r.hasLine, `${where}: the reason line is there`).toBe(true);
          expect(
            r.toolbarH,
            `${where}: the toolbar is ${r.toolbarH}px shown and ${r.toolbarHHidden}px with the line hidden — the controls reflowed`,
          ).toBe(r.toolbarHHidden);
          const bound = cell.width >= 1900 ? 24 : 44;
          expect(r.lineH, `${where}: the line is ${r.lineH}px: ${r.text}`).toBeLessThanOrEqual(
            bound,
          );
          expect(
            r.footH - r.footHHidden,
            `${where}: the foot row grew ${r.footH - r.footHHidden}px for a ${r.lineH}px line`,
          ).toBeLessThanOrEqual(r.lineH);
          expect(r.unreachable, `${where}: controls a pointer cannot reach`).toEqual([]);
        }
      }
    });

    test('the flagged bar passes axe, line and controls together', async () => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1646, height: 1097 });
      await page.waitForTimeout(400);
      await select(page, ids['Frame'] ?? '');
      await expect(page.locator('[data-conflict-reason]')).toBeVisible();
      const results = await new AxeBuilder({ page })
        .include('[data-dock-wide]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  });
}
