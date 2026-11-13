import { type Locator, type Page } from '@playwright/test';

import {
  announcer,
  apiActivities,
  canvas,
  createHierarchy,
  diagramList,
  newPlan,
  onboard,
  seedActivities,
  selectedActivityId,
  selectionToolbar,
} from '../e2e-copy-paste/support';
import { showGantt } from '../e2e-gantt/support';
import { holdThePen, releaseThePen } from '../e2e-support/pen';
import { expect, test } from '../e2e-support/test';
import { findBar, dragBarBy } from '../e2e-workspace-chrome/support';

import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Diagram keys and selection, M0** (`docs/specs/diagram-keys-and-selection/m0-verification.md`):
 * does the browser do what the spec's premises say it does, before M1 builds on them?
 *
 * **Read-only, and Chromium only.** Nothing under `apps/web/src` changes; the one thing the probe
 * adds to the page is the prototype of M1's focus move (a `pointerup` listener on the scene canvas
 * that calls `listbox.focus({ preventScroll: true })`), injected through `page.evaluate` and
 * labelled as such in every reading it affects. Firefox and WebKit are not installed in this
 * container, so the three-engine part of the plan's M0 is NOT done here (recorded in the record).
 *
 * A harness, not a gate (ADR-0081 section 3): no CI step, no new config; it runs under
 * `measure:toolbar` like its neighbours.
 */

type Reading = Record<string, unknown>;
const readings: Reading = {};

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[diagram-keys m0 ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

/** What holds focus: a short description plus where it sits relative to the workspace root. */
async function active(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const el = document.activeElement;
    // The workspace root is the parent of the plan's sr-only `<h1>` (no id or role of its own).
    const root = document.querySelector('h1.sr-only')?.parentElement ?? null;
    if (el === null) return { element: 'null' };
    return {
      element: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`,
      role: el.getAttribute('role'),
      label: el.getAttribute('aria-label'),
      text: (el.textContent ?? '').trim().slice(0, 40),
      inToolbar: el.closest('[role="toolbar"]')?.getAttribute('aria-label') ?? null,
      inGrid: el.closest('[role="treegrid"],[role="grid"]') !== null,
      isBody: el === document.body,
      isMain: el.tagName === 'MAIN',
      insideWorkspaceRoot: root !== null && root.contains(el) && root !== el,
      containsWorkspaceRoot: root !== null && el.contains(root),
    };
  });
}

const selectedCount = (page: Page): Promise<number> =>
  diagramList(page).locator('[role="option"][aria-selected="true"]').count();

/** Prototype of M1's D1: focus the list when a press on the scene canvas is released. */
async function installFocusOnRelease(
  page: Page,
  event: 'pointerup' | 'click' = 'pointerup',
): Promise<void> {
  await page.evaluate((eventName) => {
    const scene = document.querySelector<HTMLCanvasElement>(
      'section[aria-label="Time-scaled logic diagram"] canvas[data-layer="scene"]',
    );
    const list = document.querySelector<HTMLElement>(
      '[role="listbox"][aria-label="Activities in the diagram"]',
    );
    if (!scene || !list) throw new Error('canvas or list missing');
    const w = window as unknown as { __m0Handler?: (e: Event) => void; __m0Event?: string };
    if (w.__m0Handler && w.__m0Event) document.removeEventListener(w.__m0Event, w.__m0Handler);
    // On `document`, bubble phase: React's handlers sit on the app root, below it, so this runs
    // AFTER the canvas's own onPointerUp/onClick for the same event, which is the order M1 builds
    // (the move is the last thing the release handler does).
    w.__m0Handler = (e) => {
      if (e.target === scene) list.focus({ preventScroll: true });
    };
    w.__m0Event = eventName;
    document.addEventListener(eventName, w.__m0Handler);
  }, event);
}

async function showDiagramAgain(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Diagram', exact: true }).click();
  await expect(canvas(page)).toBeVisible();
}

async function mainScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('main')?.scrollTop ?? -1);
}

async function emptyGround(page: Page): Promise<{ x: number; y: number }> {
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error('no canvas box');
  // Low and left of centre: below every seeded lane, clear of the viewport cluster and minimap that
  // sit in the bottom-right corner (the first run clicked the cluster and read its focus).
  return { x: box.x + box.width * 0.45, y: box.y + box.height - 30 };
}

test.setTimeout(300_000);

test('diagram keys M0: what the browser does with focus, keys and gestures', async ({
  page,
  browser,
}) => {
  clearMeasurement('diagram-keys-m0');
  await page.setViewportSize({ width: 1024, height: 600 });
  const stamp = Date.now();
  const org = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, 'Keys');
  await holdThePen(page);
  const seeded = await seedActivities(page, org, [
    { name: 'Alpha', durationDays: 4 },
    { name: 'Bravo', durationDays: 4 },
    { name: 'Charlie', durationDays: 4 },
  ]);
  const id = (n: string): string => seeded.find((a) => a.name === n)?.id ?? '';
  await expect(canvas(page)).toBeVisible();
  const planUrl = page.url();

  const posA = await findBar(page, id('Alpha'));
  const posB = await findBar(page, id('Bravo'));
  const box = (await canvas(page).boundingBox())!;

  // ---- P1.2: where focus is after a press ------------------------------------------------------
  await canvas(page).click({ position: posA });
  readings['P1.2 after click on a bar'] = await active(page);
  log(`click: ${JSON.stringify(readings['P1.2 after click on a bar'])}`);

  await dragBarBy(page, posA, 200);
  readings['P1.2 after a drag of a bar'] = await active(page);
  log(`drag: ${JSON.stringify(readings['P1.2 after a drag of a bar'])}`);
  // Let the write settle and put Alpha back under the first click point for the later steps.
  await expect
    .poll(async () => (await apiActivities(page, org)).find((a) => a.id === id('Alpha'))?.version, {
      timeout: 15_000,
    })
    .toBeGreaterThan(1);

  const ground = await emptyGround(page);
  await page.mouse.click(ground.x, ground.y);
  readings['P1.2 after a click on empty scene ground'] = await active(page);

  const foot = page.locator('[data-activities-bar]').first();
  const footBox = await foot.boundingBox();
  if (footBox) {
    await page.mouse.click(footBox.x + footBox.width - 8, footBox.y + footBox.height / 2);
    readings['P1.2 after a press on empty foot-row space'] = await active(page);
  } else {
    readings['P1.2 after a press on empty foot-row space'] = 'no [data-activities-bar] found';
  }
  log(`foot: ${JSON.stringify(readings['P1.2 after a press on empty foot-row space'])}`);

  // ---- P1.1 / P1.3: the keys are dead after a pointer press today -------------------------------
  const before = await apiActivities(page, org);
  const alphaBefore = before.find((a) => a.id === id('Alpha'));
  await findBar(page, id('Alpha')); // leaves Alpha selected by a mouse click
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1_200);
  const afterUndo = (await apiActivities(page, org)).find((a) => a.id === id('Alpha'));
  readings['P1.3 Ctrl+Z after a mouse click (today)'] = {
    versionBefore: alphaBefore?.version,
    versionAfter: afterUndo?.version,
    undone: afterUndo?.version !== alphaBefore?.version,
  };
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(1_200);
  readings['P1.3 Ctrl+C, Ctrl+V after a mouse click (today)'] = {
    countBefore: before.length,
    countAfter: (await apiActivities(page, org)).length,
  };
  await page.keyboard.press('Escape');
  readings['P1.4 Escape after a mouse click (today)'] = {
    selectedOptionsAfter: await selectedCount(page),
    announcer: (await announcer(page).textContent()) ?? '',
  };
  log(
    `P1.3/P1.4: ${JSON.stringify([readings['P1.3 Ctrl+Z after a mouse click (today)'], readings['P1.4 Escape after a mouse click (today)']])}`,
  );

  // ---- Step 2: the prototype of focus-on-release --------------------------------------------------
  await installFocusOnRelease(page);
  const scrollBefore = await mainScrollTop(page);
  await canvas(page).click({ position: posB });
  const afterClick = await active(page);
  await page.waitForTimeout(400);
  const afterClickLater = await active(page);
  readings['step2 prototype: focus after a mouse click on a bar'] = {
    atClick: afterClick,
    after400ms: afterClickLater,
    mainScrollBefore: scrollBefore,
    mainScrollAfter: await mainScrollTop(page),
    selected: await selectedActivityId(page),
  };
  log(
    `prototype click: ${JSON.stringify(readings['step2 prototype: focus after a mouse click on a bar'])}`,
  );

  // keys with the prototype in place: Escape clears, Ctrl+Z / Ctrl+C reach the root
  await page.keyboard.press('Escape');
  readings['step2 prototype: Escape after the focus move'] = {
    selectedOptionsAfter: await selectedCount(page),
    announcer: (await announcer(page).textContent()) ?? '',
    active: await active(page),
  };

  // The list's own onFocus default: nothing selected, empty-ground press, then focus.
  const g1 = await emptyGround(page);
  await page.mouse.click(g1.x, g1.y);
  await page.waitForTimeout(300);
  readings['step2 prototype: empty-ground click with nothing selected (risk 1)'] = {
    selected: await selectedActivityId(page),
    selectedOptions: await selectedCount(page),
    active: await active(page),
  };
  // And with a selection first: select Bravo, then click empty ground.
  await canvas(page).click({ position: posB });
  await page.waitForTimeout(400);
  const g2 = await emptyGround(page);
  await page.mouse.click(g2.x, g2.y);
  await page.waitForTimeout(300);
  readings['step2 prototype: empty-ground click after a selection'] = {
    selected: await selectedActivityId(page),
    selectedOptions: await selectedCount(page),
    active: await active(page),
  };
  log(
    `risk1: ${JSON.stringify([readings['step2 prototype: empty-ground click with nothing selected (risk 1)'], readings['step2 prototype: empty-ground click after a selection']])}`,
  );

  // drag with the prototype: focus after a drag's release
  const dragStart = await findBar(page, id('Charlie'));
  await dragBarBy(page, dragStart, 200);
  readings['step2 prototype: focus after a drag'] = await active(page);

  // ---- Step 3: dblclick reaches the scene canvas (mouse) ----------------------------------------
  await page.evaluate(() => {
    const scene = document.querySelector('canvas[data-layer="scene"]');
    const w = window as unknown as { __dbl: number };
    w.__dbl = 0;
    scene?.addEventListener('dblclick', () => (w.__dbl += 1));
  });
  await page.mouse.dblclick(box.x + posB.x, box.y + posB.y);
  readings['step3 mouse dblclick reaches the scene canvas'] = await page.evaluate(
    () => (window as unknown as { __dbl: number }).__dbl,
  );

  // ---- Step 4: Ctrl-click with and without the pen -------------------------------------------------
  // A taller window: at 1024 x 600 a selection shrinks and scrolls the canvas, so a point found
  // before the first click no longer hits the second bar (the walkthrough's note, HANDOFF.md).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  const ground2 = await emptyGround(page);
  const ctrlClickReading = async (label: string): Promise<void> => {
    // Positions re-found in the state under test (the pen changes the chrome), and the reading
    // names WHICH bar ends up selected: Bravo alone is a replace, Alpha alone is a missed click.
    const posA2 = await findBar(page, id('Alpha'));
    const posB2 = await findBar(page, id('Bravo'));
    await page.mouse.click(ground2.x, ground2.y); // clear
    await canvas(page).click({ position: posA2 });
    await canvas(page).click({ position: posB2, modifiers: ['Control'] });
    await page.waitForTimeout(300);
    const selectedNow = await selectedActivityId(page);
    readings[label] = {
      selectedOptions: await selectedCount(page),
      primary: ['Alpha', 'Bravo', 'Charlie'].find((n) => id(n) === selectedNow) ?? selectedNow,
      pluralBarVisible: await page.getByText(/2 activities selected/i).isVisible(),
    };
    log(`${label}: ${JSON.stringify(readings[label])}`);
  };
  const shiftClickReading = async (label: string): Promise<void> => {
    const posA3 = await findBar(page, id('Alpha'));
    const posB3 = await findBar(page, id('Bravo'));
    await page.mouse.click(ground2.x, ground2.y);
    await canvas(page).click({ position: posA3 });
    await canvas(page).click({ position: posB3, modifiers: ['Shift'] });
    await page.waitForTimeout(300);
    const selectedNow = await selectedActivityId(page);
    readings[label] = {
      selectedOptions: await selectedCount(page),
      primary: ['Alpha', 'Bravo', 'Charlie'].find((n) => id(n) === selectedNow) ?? selectedNow,
    };
    log(`${label}: ${JSON.stringify(readings[label])}`);
  };
  await ctrlClickReading('step4 Ctrl-click, pen held');
  await shiftClickReading('step4 Shift-click, pen held');
  await releaseThePen(page);
  await ctrlClickReading('step4 Ctrl-click, no pen');
  await shiftClickReading('step4 Shift-click, no pen');
  await holdThePen(page);

  // ---- Step 5: Delete (key) and the Delete button -------------------------------------------------
  await findBar(page, id('Alpha'));
  await diagramList(page).focus();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(500);
  readings['step5 Delete key on a single selection (today)'] = {
    dialogOpen:
      (await page.getByRole('alertdialog').count()) + (await page.getByRole('dialog').count()),
    activityCount: (await apiActivities(page, org)).length,
  };
  await selectionToolbar(page, 'Alpha')
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  readings['step5 the Delete button opens a confirmation'] = {
    alertdialog: await page.getByRole('alertdialog').isVisible(),
    text:
      (await page
        .getByRole('alertdialog')
        .textContent()
        .catch(() => null)) ?? null,
  };
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /cancel/i })
    .click();

  // ---- Step 6: a click on a Gantt bar ------------------------------------------------------------
  await showGantt(page);
  const ganttBar: Locator = page
    .locator(`[data-activity-id="${id('Alpha')}"] span[style*="cursor: grab"]`)
    .first();
  await ganttBar.click();
  readings['step6 focus after a click on a Gantt bar'] = await active(page);
  log(`gantt: ${JSON.stringify(readings['step6 focus after a click on a Gantt bar'])}`);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  readings['step6 note'] =
    'insideWorkspaceRoot=true means the React root handler hears Ctrl+Z; containsWorkspaceRoot=true means only the widened fallback can.';

  await showDiagramAgain(page);
  // ---- Mouse: does `click` fire after a drag, and does a click-time focus stick? ---------------------
  const counters = async (
    pg: Page,
  ): Promise<{ pointerup: number; click: number; dblclick: number }> =>
    pg.evaluate(() => {
      const w = window as unknown as {
        __c: { pointerup: number; click: number; dblclick: number };
      };
      return { ...w.__c };
    });
  const armCounters = async (pg: Page): Promise<void> => {
    await pg.evaluate(() => {
      const scene = document.querySelector('canvas[data-layer="scene"]');
      const w = window as unknown as {
        __c: { pointerup: number; click: number; dblclick: number };
        __cArmed?: boolean;
      };
      w.__c = { pointerup: 0, click: 0, dblclick: 0 };
      if (w.__cArmed) return;
      w.__cArmed = true;
      scene?.addEventListener('pointerup', () => (w.__c.pointerup += 1));
      scene?.addEventListener('click', () => (w.__c.click += 1));
      scene?.addEventListener('dblclick', () => (w.__c.dblclick += 1));
    });
  };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(500);
  await installFocusOnRelease(page, 'click');
  await armCounters(page);
  const posC = await findBar(page, id('Charlie'));
  await armCounters(page);
  const gA = await emptyGround(page);
  await page.mouse.click(gA.x, gA.y);
  await page.waitForTimeout(300);
  await armCounters(page);
  await dragBarBy(page, posC, 120);
  await page.waitForTimeout(500);
  readings['mouse: a drag of a bar, click-time prototype'] = {
    events: await counters(page),
    active: await active(page),
  };
  await armCounters(page);
  const gB = await emptyGround(page);
  await page.mouse.move(gB.x, gB.y);
  await page.mouse.down();
  await page.mouse.move(gB.x - 80, gB.y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  readings['mouse: a pan (empty-ground drag), click-time prototype'] = {
    events: await counters(page),
    active: await active(page),
  };

  // ---- Touch: a tap, and a double tap, on the scene canvas ----------------------------------------
  const state = await page.context().storageState();
  const touch = await browser.newContext({
    storageState: state,
    hasTouch: true,
    viewport: { width: 1280, height: 800 },
  });
  const tp = await touch.newPage();
  try {
    await tp.goto(planUrl);
    await expect(canvas(tp)).toBeVisible({ timeout: 30_000 });
    await expect(diagramList(tp)).toBeAttached();
    await tp.waitForTimeout(1_000);
    await armCounters(tp);
    const tbox = (await canvas(tp).boundingBox())!;
    const tground = { x: tbox.x + tbox.width * 0.45, y: tbox.y + tbox.height - 30 };
    const tposB = await findBar(tp, id('Bravo'));
    await tp.mouse.click(tground.x, tground.y); // clear, leave focus on main
    for (const variant of ['pointerup', 'click'] as const) {
      await installFocusOnRelease(tp, variant);
      await armCounters(tp);
      await tp.touchscreen.tap(tbox.x + tposB.x, tbox.y + tposB.y);
      await tp.waitForTimeout(500);
      readings[`touch: one tap on a bar, prototype on ${variant}`] = {
        selectedOptions: await diagramList(tp)
          .locator('[role="option"][aria-selected="true"]')
          .count(),
        active: await active(tp),
        events: await counters(tp),
      };
      log(
        `touch ${variant}: ${JSON.stringify(readings[`touch: one tap on a bar, prototype on ${variant}`])}`,
      );
      await tp.mouse.click(tground.x, tground.y);
    }
    await armCounters(tp);
    await tp.touchscreen.tap(tbox.x + tposB.x, tbox.y + tposB.y);
    await tp.waitForTimeout(60);
    await tp.touchscreen.tap(tbox.x + tposB.x, tbox.y + tposB.y);
    await tp.waitForTimeout(500);
    readings['touch: two taps 60 ms apart'] = {
      events: await counters(tp),
      active: await active(tp),
    };
    log(`touch double: ${JSON.stringify(readings['touch: two taps 60 ms apart'])}`);
  } finally {
    await touch.close();
  }

  const path = writeMeasurement('diagram-keys-m0', {
    viewport: '1024x600',
    engine: 'chromium',
    readings,
  });
  log(`wrote ${path}`);
});
