import { type Locator, type Page } from '@playwright/test';

import { holdThePen } from '../e2e-support/pen';
import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  canvas,
  createHierarchy,
  diagramList,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
  selectedActivityId,
} from '../e2e-workspace-chrome/support';
import { LANE_HEIGHT } from '../src/features/tsld/render/geometry';

/**
 * **A selected activity's bar takes the whole foot row on a short window, and the bar it clicked stays
 * where it was** (diagram-keys-and-selection M6, ADR-0219; `m5-measurement.md` shape S-B).
 *
 * Written before the change and red against it: at 1024 x 600 the plan facts sat beside the bar, so
 * eleven labelled actions took four lines and a click on a low bar slid it 132 px up the diagram.
 *
 * **Invariants, never a pixel figure** (`docs/HANDOFF.md`, environment notes). Every cost is read
 * against the same bar with the facts left beside it, in the same run, at the same size: the
 * comparison arm removes the one rule under test from the foot row's class list, which is the only
 * thing that differs between the arms. Where a bar is, is read with the canvas's own hit test, the
 * technique the M5 measurement used: a bar's place before is the first bar's hit range plus whole
 * lanes, and its place after is a sweep down the same column.
 */
const SHORT = { width: 1024, height: 600 } as const;
const LANES = 12;
/** The class that is the rule under test: removing it from the row restores the facts beside the bar. */
const RULE_PREFIX = 'short:has-[[data-selection-bar]]:';

interface Frame {
  top: number;
  visible: number;
  height: number;
  width: number;
}

/** The scene's box, and how much of it the reader can see: it ends at the foot row or the window. */
async function frame(page: Page): Promise<Frame> {
  return page.evaluate(() => {
    const scene = document.querySelector(
      'section[aria-label="Time-scaled logic diagram"] canvas[data-layer="scene"]',
    );
    const b = scene?.getBoundingClientRect();
    const footTop = document.querySelector('[data-activities-bar]')?.getBoundingClientRect().top;
    const bottom = Math.min(b?.bottom ?? 0, footTop ?? Infinity, window.innerHeight);
    return {
      top: b?.top ?? 0,
      visible: Math.max(0, bottom - (b?.top ?? 0)),
      height: b?.height ?? 0,
      width: b?.width ?? 0,
    };
  });
}

/** Wait until the dock has stopped changing: the scene's height has held for three reads. */
async function settle(page: Page): Promise<void> {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < 40 && stable < 3; i += 1) {
    await page.waitForTimeout(100);
    const h = (await frame(page)).height;
    stable = h === last ? stable + 1 : 0;
    last = h;
  }
}

/** The y values in one column at which a click selects `id`. Clicks select, so this ends on `id`. */
async function sweepColumn(
  page: Page,
  x: number,
  id: string,
  from: number,
  to: number,
): Promise<number[]> {
  const hits: number[] = [];
  for (let y = from; y <= to; y += 4) {
    await canvas(page).click({ position: { x, y } });
    if ((await selectedActivityId(page)) === id) hits.push(y);
  }
  return hits;
}

async function clearSelection(page: Page): Promise<void> {
  await diagramList(page).focus();
  await page.keyboard.press('Escape');
  await expect(diagramList(page).locator('[role="option"][aria-selected="true"]')).toHaveCount(0);
  await settle(page);
}

/** The plan facts' list, as the box it paints: a sighted reader sees a box wider than a pixel. */
async function factsBox(page: Page): Promise<{ w: number; h: number; text: string }> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-activities-bar] [data-plan-fact-list]');
    const b = el?.getBoundingClientRect();
    return { w: b?.width ?? -1, h: b?.height ?? -1, text: el?.textContent ?? '' };
  });
}

async function footHeight(page: Page): Promise<number> {
  return page.evaluate(
    () => document.querySelector('[data-activities-bar]')?.getBoundingClientRect().height ?? 0,
  );
}

async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(canvas(page)).toBeVisible({ timeout: 30_000 });
  await holdThePen(page);
  await page.waitForTimeout(600);
  await settle(page);
}

test('on a short window the selection bar takes the whole row, and the clicked bar stays put', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await acknowledgeViewportNotice(page.context());
  await page.setViewportSize(SHORT);
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, `Short bar ${stamp}`);
  await holdThePen(page);
  const seeded = await seedActivities(
    page,
    orgSlug,
    Array.from({ length: LANES }, (_, i) => ({
      name: `Task ${String(i + 1).padStart(2, '0')}`,
      laneIndex: i,
      durationDays: 3,
    })),
  );
  await recalculate(page, orgSlug);
  await reopen(page);

  const idle = await frame(page);
  const idleFoot = await footHeight(page);
  const idleFacts = await factsBox(page);
  expect(idleFacts.w, 'the facts are painted at rest').toBeGreaterThan(100);

  // ---- where lane 0's bar is: a column and the hit range there --------------------------------
  let column: { x: number; ys: number[] } | null = null;
  for (const x of [60, 90, 40, 120, 160, 200, 260, 320]) {
    const ys = await sweepColumn(page, x, seeded[0]!.id, 20, 200);
    if (ys.length > 0) {
      column = { x, ys };
      break;
    }
  }
  if (!column) throw new Error('no column hit the first bar');
  const lo0 = column.ys[0]!;
  const hi0 = column.ys[column.ys.length - 1]!;
  // The deepest lane whose whole hit range is inside the diagram at rest.
  let deepest = 0;
  while (hi0 + (deepest + 1) * LANE_HEIGHT <= idle.visible - 4) deepest += 1;
  expect(deepest, 'the fixture has a low lane to select').toBeGreaterThan(2);

  for (const lane of [2, deepest]) {
    await test.step(`lane ${String(lane)}: a click on the bar leaves it where it was, or moves it by the least`, async () => {
      await reopen(page);
      const before = await frame(page);
      const lo = lo0 + lane * LANE_HEIGHT;
      const hi = hi0 + lane * LANE_HEIGHT;
      const mid = column.ys[Math.floor(column.ys.length / 2)]! + lane * LANE_HEIGHT;
      const target = seeded[lane]!.id;
      await canvas(page).click({ position: { x: column.x, y: mid } });
      expect(await selectedActivityId(page), 'the click hit the bar it aimed at').toBe(target);
      await expect(page.getByRole('toolbar', { name: /^Actions for / })).toBeVisible();
      await settle(page);
      const after = await frame(page);
      expect(after.top, 'the canvas did not move under the bar').toBe(before.top);

      const ys = await sweepColumn(page, column.x, target, 12, Math.max(after.visible - 8, 20));
      expect(ys.length, 'the selected bar is still on screen').toBeGreaterThan(0);
      const movedBy = ys[Math.floor(ys.length / 2)]! - (lo + hi) / 2;
      const hidden = Math.max(0, hi + 4 - after.visible);
      if (hidden === 0) {
        expect(
          Math.abs(movedBy),
          `a bar still wholly visible moved ${String(movedBy)} px (hit ${String(lo)}-${String(hi)}, visible ${String(after.visible)}, idle ${String(before.visible)}, height ${String(after.height)})`,
        ).toBeLessThanOrEqual(4);
      } else {
        // Truly hidden by the shrink: it moves up by about what was hidden, never by a margin on top.
        expect(-movedBy, 'moved up by more than the shrink hid').toBeLessThanOrEqual(hidden + 8);
        expect(movedBy).toBeLessThanOrEqual(0);
      }
    });
  }

  await test.step('every action is visible and in reach, the facts have stepped aside, and they return', async () => {
    await reopen(page);
    const target = seeded[2]!.id;
    const mid = column.ys[Math.floor(column.ys.length / 2)]! + 2 * LANE_HEIGHT;
    await canvas(page).click({ position: { x: column.x, y: mid } });
    expect(await selectedActivityId(page)).toBe(target);
    const bar = page.getByRole('toolbar', { name: /^Actions for / });
    await expect(bar).toBeVisible();
    await settle(page);

    const buttons: Locator = bar.locator('button');
    const count = await buttons.count();
    expect(count, 'the bar has its actions').toBeGreaterThanOrEqual(8);
    for (let i = 0; i < count; i += 1) {
      const button = buttons.nth(i);
      await expect(button).toBeVisible();
      await expect(button).toBeInViewport({ ratio: 1 });
    }
    // Every label is painted: nothing is an icon here that was a word beside the facts.
    for (const name of ['Logic', 'Notes', 'Progress', 'Resources', 'Edit', 'Duplicate', 'Delete']) {
      await expect(bar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const fit = await page.evaluate(() => {
      const foot = document.querySelector('[data-activities-bar]');
      const box = foot?.getBoundingClientRect();
      const strip = document.querySelector('[role="toolbar"][aria-label^="Actions for"]');
      const outside = [...(strip?.querySelectorAll('button') ?? [])].filter((el) => {
        const b = el.getBoundingClientRect();
        return (
          !box ||
          b.top < box.top - 0.5 ||
          b.bottom > box.bottom + 0.5 ||
          b.right > box.right + 0.5 ||
          b.right > window.innerWidth + 0.5
        );
      }).length;
      return {
        outside,
        pageX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        footX: foot ? foot.scrollWidth - foot.clientWidth : 0,
      };
    });
    expect(fit.outside, 'a control lies outside the foot row').toBe(0);
    expect(fit.pageX, 'the page scrolls sideways').toBeLessThanOrEqual(0);
    expect(fit.footX, 'the foot row scrolls sideways').toBeLessThanOrEqual(0);

    // The facts stepped aside: painted nowhere (a one-pixel box is how they stay readable by a
    // screen reader), still in the document with their text, and back after the selection clears.
    const while_ = await factsBox(page);
    expect(while_.w, 'the facts are painted beside the bar').toBeLessThanOrEqual(1);
    expect(while_.h).toBeLessThanOrEqual(1);
    expect(while_.text, 'the facts stay in the accessibility tree').toMatch(/Data date/);
    await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();

    const selectedFoot = await footHeight(page);
    const selectedScene = (await frame(page)).height;

    await clearSelection(page);
    const back = await factsBox(page);
    expect(back.w, 'the facts return when the selection clears').toBeGreaterThan(100);
    expect(await footHeight(page), 'the foot row is what it was').toBe(idleFoot);
    expect((await frame(page)).height).toBe(idle.height);

    // ---- the same bar with the facts left beside it, in this run ------------------------------
    await reopen(page);
    await page.evaluate((prefix) => {
      const row = document.querySelector<HTMLElement>('[data-activities-bar]');
      if (!row) throw new Error('no foot row');
      row.className = row.className
        .split(/\s+/)
        .filter((c) => !c.startsWith(prefix))
        .join(' ');
    }, RULE_PREFIX);
    await canvas(page).click({ position: { x: column.x, y: mid } });
    expect(await selectedActivityId(page)).toBe(target);
    await expect(bar).toBeVisible();
    await settle(page);
    const besideFoot = await footHeight(page);
    const besideScene = (await frame(page)).height;
    expect(
      (await factsBox(page)).w,
      'the comparison arm has the facts beside the bar',
    ).toBeGreaterThan(100);
    expect(selectedFoot, 'the bar took fewer lines than beside the facts').toBeLessThan(besideFoot);
    expect(
      selectedScene,
      'the diagram keeps more height with the facts stepped aside',
    ).toBeGreaterThan(besideScene);
  });

  await test.step('a control on the bar acts', async () => {
    await reopen(page);
    const mid = column.ys[Math.floor(column.ys.length / 2)]! + 2 * LANE_HEIGHT;
    await canvas(page).click({ position: { x: column.x, y: mid } });
    const bar = page.getByRole('toolbar', { name: /^Actions for / });
    await expect(bar).toBeVisible();
    await settle(page);
    const options = diagramList(page).getByRole('option');
    const countBefore = await options.count();
    await bar.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(options).toHaveCount(countBefore + 1);
  });
});
