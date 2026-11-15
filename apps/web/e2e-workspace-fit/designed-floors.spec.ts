import { type Browser, type Page } from '@playwright/test';

import { holdThePen } from '../e2e-support/pen';
import { acknowledgeViewportNotice, expect, test } from '../e2e-support/test';
import {
  createHierarchy,
  diagramList,
  linkActivities,
  newPlan,
  onboard,
  recalculate,
  seedActivities,
} from '../e2e-workspace-chrome/support';
import { CANVAS_MIN_HEIGHT } from '../src/components/layout/workspace/use-activity-panel-prefs';
import { WORKSPACE_SCALE_FLOOR } from '../src/components/layout/workspace/workspace-scale';

/**
 * **Every state of the designed window against its floor, fine and coarse** (ADR-0222 M3, the milestone
 * ADR-0179 D10 names for "the floor is made to fit"; `docs/specs/scaled-workspace/m3-measurement.md`).
 *
 * `floor-states.spec.ts` asserts the deck's lines through the states that stress it, with a mouse. This
 * asserts the other half for **both pointers**: with and without a selection (the bar that docks in the
 * foot row), with the activities panel open and shut, in the Diagram and the Gantt, at the designed
 * 1280 x 800 (scale 1) and at 1024 x 600 (the same layout at 0.75), that
 *
 * - the stage is at its floor in layout px: **350** with nothing beside it (ADR-0092), and the panel's own
 *   `CANVAS_MIN_HEIGHT` (240) while the activities panel is open;
 * - the deck sits on two lines (the touch toolbar took four and 0.43 of the height at 1024 x 600, walkthrough
 *   rank 47);
 * - nothing is scaled at the designed size (a finger-sized band once made it 0.995), and the window does not
 *   scroll;
 * - every pressable control is a real 24 x 24 target in layout px, so WCAG 2.5.8 never rests on the spacing
 *   exception (the foot row's Recalculate did, and failed it on CI's fonts).
 *
 * **Coarse at 1024 x 600 with the panel open is the one swap**: the layout there is 17 px under the
 * short-body line (ADR-0222 D3's note on the 0.75 floor), so Expand gives the panel the whole body and the
 * stage is hidden (ADR-0180 D1). The test says so rather than skipping the state.
 */
const FLOOR_PX = 350;
/** A deck taking more than this share of the window's height is the 0.43 of rank 47 coming back. */
const DECK_SHARE_MAX = 0.15;

const WINDOWS = [
  { name: '1280x800', size: { width: 1280, height: 800 }, scale: 1 },
  { name: '1024x600', size: { width: 1024, height: 600 }, scale: WORKSPACE_SCALE_FLOOR },
] as const;

interface Reading {
  scale: number;
  deckLines: number;
  deckShare: number;
  stage: number;
  scrolls: boolean;
  small: string[];
}

async function read(page: Page, view: 'diagram' | 'gantt'): Promise<Reading> {
  return page.evaluate((v) => {
    const main = document.querySelector('main#main');
    const inner = main?.firstElementChild?.firstElementChild as HTMLElement | null | undefined;
    const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
    const scroller = (el: HTMLElement | null): HTMLElement | null => {
      for (let e = el; e && e !== main; e = e.parentElement) {
        const o = getComputedStyle(e).overflowY;
        if (o === 'auto' || o === 'scroll') return e;
      }
      return el;
    };
    const stage =
      v === 'diagram'
        ? document.querySelector<HTMLElement>(
            'section[aria-label="Time-scaled logic diagram"] canvas[data-layer="scene"]',
          )
        : scroller(
            document.querySelector<HTMLElement>(
              '[role="treegrid"][aria-label="Schedule as a bar chart"]',
            ),
          );
    if (!main || !inner || !deck || !stage) throw new Error('the workspace was not found');
    const scale = Number(inner.getAttribute('data-workspace-scale') ?? '1');
    const tops = [...deck.querySelectorAll('[data-toolbar-item]')]
      .map((el) => el.getBoundingClientRect().top)
      .sort((a, b) => a - b);
    let deckLines = 0;
    let last = Number.NEGATIVE_INFINITY;
    for (const t of tops) {
      if (t - last > 4) deckLines += 1;
      last = t;
    }
    const small: string[] = [];
    const pressable = [
      'button',
      'a[href]',
      'input',
      'select',
      'textarea',
      'summary',
      '[tabindex]:not([tabindex="-1"])',
      '[role="button"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="switch"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="option"]',
      '[role="slider"]',
    ].flatMap((q) => [`main#main ${q}`, `section[aria-label="Plan command band"] ${q}`]);
    for (const el of document.querySelectorAll<HTMLElement>(pressable.join(','))) {
      // The diagram's parallel listbox is the screen reader's copy of the canvas, 1 px by design.
      if (el.closest('[aria-label="Activities in the diagram"]')) continue;
      // A divider is a 1 px line with its hit strip as a child (`panel-resizer.tsx`); the strip is the target.
      const r = (el.querySelector('[data-resizer-hit]') ?? el).getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      const w = r.width / scale;
      const h = r.height / scale;
      if (w < 23.9 || h < 23.9) {
        const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim();
        small.push(
          `${el.tagName.toLowerCase()} "${name.slice(0, 30)}" ${w.toFixed(1)}x${h.toFixed(1)}`,
        );
      }
    }
    return {
      scale,
      deckLines,
      deckShare: deck.getBoundingClientRect().height / window.innerHeight,
      stage: Math.round(stage.getBoundingClientRect().height / scale),
      scrolls: main.scrollHeight > main.clientHeight + 1 || main.scrollWidth > main.clientWidth + 1,
      small: [...new Set(small)],
    };
  }, view);
}

async function openState(
  page: Page,
  planUrl: string,
  size: { width: number; height: number },
  view: 'diagram' | 'gantt',
  selection: boolean,
  panel: boolean,
): Promise<void> {
  await page.setViewportSize(size);
  await page.goto(planUrl);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible({
    timeout: 30_000,
  });
  await holdThePen(page);
  for (const item of ['minimap', 'comments']) {
    const el = page.locator(`[data-toolbar-item="${item}"]`).first();
    if ((await el.getAttribute('aria-pressed')) === 'true') await el.click();
  }
  const diagram = page.locator('[data-toolbar-item="view-tsld"]').first();
  if ((await diagram.getAttribute('aria-pressed')) === 'false') await diagram.click();
  // The selection is made before the panel opens: a swapped panel hides the diagram and its listbox.
  if (selection) {
    await diagramList(page).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    // Enter opens the editor over the selection; the selection and its bar stay behind it.
    const editor = page.getByRole('dialog');
    if (await editor.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape');
      await expect(editor).toBeHidden();
    }
    await expect(page.locator('[data-selection-bar]').first()).toBeVisible();
  }
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  const collapse = page.getByRole('button', { name: 'Collapse activities panel' });
  await expect(expand.or(collapse).first()).toBeVisible();
  if (panel) {
    if (await expand.isVisible()) await expand.click();
    await expect(collapse).toBeVisible();
  } else if (await collapse.isVisible()) {
    await collapse.click();
    await expect(expand).toBeVisible();
  }
  if (view === 'gantt') await page.locator('[data-toolbar-item="view-gantt"]').first().click();
  await page.waitForTimeout(700);
}

async function plan(browser: Browser, coarse: boolean, stamp: number) {
  const context = await browser.newContext({
    viewport: { width: 1646, height: 1097 },
    hasTouch: coarse,
  });
  await acknowledgeViewportNotice(context);
  const page = await context.newPage();
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, 'Designed floors');
  await holdThePen(page);
  const seeded = await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    { name: 'Pour slab', laneIndex: 2, durationDays: 6 },
  ]);
  await linkActivities(page, orgSlug, seeded[0]!.id, seeded[1]!.id);
  await recalculate(page, orgSlug);
  return { context, page, planUrl: page.url() };
}

test.describe('Every state of the designed window against its floor', () => {
  for (const coarse of [false, true]) {
    for (const [index, w] of WINDOWS.entries()) {
      test(`${coarse ? 'coarse' : 'fine'} pointer at ${w.name}`, async ({ browser }) => {
        test.setTimeout(300_000);
        const { context, page, planUrl } = await plan(
          browser,
          coarse,
          Date.now() + (coarse ? 7701 : 7700) + index * 3,
        );
        for (const view of ['diagram', 'gantt'] as const) {
          for (const selection of [false, true]) {
            for (const panel of [false, true]) {
              const state = `${w.name} ${coarse ? 'coarse' : 'fine'} ${view}${selection ? ' + selection' : ''}${panel ? ' + panel' : ''}`;
              await openState(page, planUrl, w.size, view, selection, panel);
              const r = await read(page, view);
              expect(r.scale, `${state}: scale`).toBe(w.scale);
              expect(
                r.deckLines,
                `${state}: the deck sits on ${r.deckLines} lines`,
              ).toBeLessThanOrEqual(2);
              expect(
                r.deckShare,
                `${state}: the deck takes ${r.deckShare.toFixed(2)} of the height`,
              ).toBeLessThanOrEqual(DECK_SHARE_MAX);
              expect(r.scrolls, `${state}: the window scrolls`).toBe(false);
              expect(r.small, `${state}: controls under 24 px`).toEqual([]);
              const swapped = coarse && panel && w.name === '1024x600';
              if (swapped) {
                expect(r.stage, `${state}: the panel owns the body (ADR-0180 D1)`).toBe(0);
              } else {
                const floor = panel ? CANVAS_MIN_HEIGHT : FLOOR_PX;
                expect(
                  r.stage,
                  `${state}: stage ${r.stage}px against ${floor}`,
                ).toBeGreaterThanOrEqual(floor);
              }
            }
          }
        }
        await context.close();
      });
    }
  }
});
