import { expect, test, type Page } from '@playwright/test';

import {
  createHierarchy,
  ensurePen,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { clearMeasurement, writeMeasurement } from './output';

/**
 * **M0-T4 — the bottom bands, the dock's 0 px guarantee, and the layouts with no handle row.**
 *
 * Three things M2 rests on, none of which had been observed.
 *
 * **1. Both bands, by hook.** The superseded probe located the status bar by the copy `Data date`
 * plus a height heuristic — locating chrome by its words, which `activity-bottom-panel.tsx:165-172`
 * records as having bitten three times, in that file's own neighbour. Here: `[data-activities-bar]`
 * and `[data-chrome-slot="status"]`, with `[data-schedule-state]` reported separately because it is
 * the **facts cluster** and not the band, which the first repaired run established and which is
 * exactly the confusion a copy-based locator produces.
 *
 * **2. ADR-0092's 0 px dock guarantee, re-measured.** That decision's headline is that arming a
 * tool or selecting an activity costs the canvas **nothing**, and it held *because the handle row's
 * middle was empty*. M2 proposes to put the plan's facts in that middle. So the guarantee is a
 * premise M2 invalidates unless it is re-established, and it is measured here in the state M2 would
 * create as well as today's.
 *
 * **3. The layouts that mount NO handle row.** `plan-workspace-toolbar.tsx:1583` passes
 * `hostsDock={false}` for a pane that is `display: none` on the narrow layout, so on those widths
 * there is no handle row for the facts to merge into. A literal merge would therefore **delete the
 * plan's facts** on exactly the screens with least room to lose them — ADR-0081's defect, which is
 * why this task's brief says it must be observed and not inferred.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const WIDE = { width: 1646, height: 1097 };
const WIDTHS = [
  { width: 1920, height: 1080 },
  WIDE,
  { width: 1440, height: 960 },
  { width: 1280, height: 800 },
  // **Genuinely below the single-pane breakpoint.** MD_QUERY is 48rem and `isWide` is true AT it
  // (`plan-workspace-toolbar.tsx:98,343`), so the first version's "narrow" widths of 768 and 900
  // were both WIDE and this probe never reached the layout it was written to observe. They were
  // picked without reading the breakpoint, which is the same failure as measuring the wrong
  // element one file over.
  { width: 700, height: 800 },
  { width: 600, height: 800 },
];

const BANDS = `
  const round = (n) => Math.round(n);
  const box = (el) => (el ? { w: round(el.getBoundingClientRect().width), h: round(el.getBoundingClientRect().height) } : null);
  const read = () => {
    const canvas = document.querySelector('canvas');
    const bar = document.querySelector('[data-activities-bar]');
    const statusSlot = document.querySelector('[data-chrome-slot="status"]');
    const facts = document.querySelector('[data-schedule-state]');
    return {
      canvasHeight: box(canvas) ? box(canvas).h : null,
      canvasTop: canvas ? round(canvas.getBoundingClientRect().top) : null,
      activitiesBar: box(bar),
      // Mounted is not shown: querySelector finds a display-none node, and the narrow layout
      // renders the activities pane hidden by default — so a presence check reports a handle row
      // no planner can see. The first version of this probe shipped exactly that.
      activitiesBarMounted: bar !== null,
      activitiesBarVisible: bar !== null && bar.getClientRects().length > 0,
      statusSlot: box(statusSlot),
      factsCluster: box(facts),
      factsText: facts ? (facts.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 90) : null,
    };
  };
`;

async function readBands(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(`(() => { ${BANDS} return read(); })()`) as Promise<Record<string, unknown>>;
}

test('M0-T4: bottom bands by hook, the dock cost, and the layouts with no handle row', async ({
  page,
}) => {
  clearMeasurement('m0-bands');
  test.setTimeout(300_000);

  await page.setViewportSize(WIDE);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    { name: 'Blind and reinforce', laneIndex: 2, durationDays: 16 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const report: Record<string, unknown> = {};

  // ── 1. Both bands by hook, at every width, including two below the single-pane breakpoint.
  const byWidth: Record<string, unknown> = {};
  for (const viewport of WIDTHS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);
    byWidth[`${viewport.width}`] = await readBands(page);
  }
  report.byWidth = byWidth;

  // ── 2. The dock's cost, at the width this product is judged at.
  await page.setViewportSize(WIDE);
  await page.waitForTimeout(600);

  const dockCost: Record<string, unknown> = {};
  dockCost.empty = await readBands(page);

  // Arm a tool. By `data-toolbar-item`, never by copy — ADR-0091 M7's rule after three journeys
  // broke on a label change.
  // link-tool, not link (tsld-toolbar-items.tsx:2516). The first version used the wrong id and the
  // probe reported `skipped` — which is why the gap is visible rather than silently absent.
  const linkTool = page.locator('[data-toolbar-item="link-tool"]').first();
  if ((await linkTool.count()) > 0) {
    await linkTool.click({ timeout: 10_000 });
    await page.waitForTimeout(400);
    dockCost.toolArmed = await readBands(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  } else {
    dockCost.toolArmed = { skipped: 'no [data-toolbar-item="link-tool"] on this surface' };
  }

  // Select one activity through the canvas's own parallel listbox (ADR-0026 D7) — **by keyboard,
  // never by click**. That layer exists for keyboard and AT and is painted BEHIND the canvas, so a
  // pointer click is intercepted: the first version of this probe called `.click()` and Playwright
  // retried for four and a half minutes against the canvas and the activities bar before the test
  // timed out. The layer is not a clickable list that happens to be hidden; driving it by pointer
  // is using it for something it is not.
  const options = page
    .getByRole('listbox', { name: 'Activities in the diagram' })
    .getByRole('option');
  if ((await options.count()) > 0) {
    await options.first().focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    dockCost.oneSelected = await readBands(page);
  } else {
    dockCost.oneSelected = { skipped: 'no activity options in the diagram listbox' };
  }
  report.dockCost = dockCost;

  // ── 3. Where is the handle row absent, and do the facts survive there today?
  const narrow: Record<string, unknown> = {};
  // The SAME widths as the narrow entries above. These were 900 and 768 while the array above had
  // already been corrected to 700 and 600, so the artefact on disk contradicted itself: one section
  // reporting no handle row below the breakpoint, another reporting one present at widths that are
  // not below it. A measurement file that disagrees with itself is worse than one that is missing.
  for (const viewport of [
    { width: 700, height: 800 },
    { width: 600, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(700);
    const bands = await readBands(page);
    narrow[`${viewport.width}`] = {
      ...bands,
      // The question M2 turns on, stated as a fact rather than an inference: if the handle row is
      // absent AND the facts are present, the shell status row is the fallback M2 must keep.
      handleRowAbsentButFactsPresent:
        bands.activitiesBarVisible === false && bands.factsCluster !== null,
    };
  }
  report.narrowLayouts = narrow;

  const path = writeMeasurement('m0-bands', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
