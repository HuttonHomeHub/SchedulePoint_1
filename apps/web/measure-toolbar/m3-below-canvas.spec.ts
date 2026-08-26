import { expect, test } from '@playwright/test';

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
 * **Where the workspace's vertical space actually goes — above AND below the canvas.**
 *
 * Every vertical measurement in this repository has asked the same question: how much chrome sits
 * *above* the diagram. `m4-vertical-stack` answers it well. But its own output says the canvas
 * bottom is at 761 px of a 1080 px viewport, and its ancestry chain shows the canvas pane's parent
 * is **834 px tall holding a 551 px pane** — so roughly 283 px sits below the pane inside the same
 * split, with the activities panel COLLAPSED. Nothing in the estate has ever named what that is.
 *
 * Five epics have optimised the band above the canvas 45 px at a time. If there is a quarter of the
 * screen unaccounted for below it, that is the wrong end to have been working on, and this probe is
 * how that stops being a guess.
 *
 * It reports, at each width and in both panel states:
 *   - every block between the canvas pane's bottom and the viewport's bottom, with its own height
 *     and a text snippet, so a reader can name it rather than infer it;
 *   - the canvas pane and the activities region as measured boxes;
 *   - what pressing Expand actually costs.
 *
 * Asserts nothing beyond reaching the screen; it is a harness (ADR-0081 §3).
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1646, height: 1097 },
];

const PLAN_NAME = 'Riverside Quarter — Phase 2 Substructure';

test('M0: what sits below the canvas, panel collapsed and expanded', async ({ page }) => {
  clearMeasurement('m3-below-canvas');
  test.setTimeout(300_000);

  await page.setViewportSize(VIEWPORTS[0]!);
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, PLAN_NAME);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
    { name: 'Blind and reinforce', laneIndex: 2, durationDays: 6 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const read = (): Promise<unknown> =>
    page.evaluate(() => {
      const round = (n: number): number => Math.round(n);
      const scene = document.querySelector('canvas');
      if (!scene) return { error: 'no canvas' };
      const sceneBox = scene.getBoundingClientRect();

      // The canvas PANE — the nearest ancestor that is meaningfully taller than the canvas itself,
      // which is the box the split actually allocates.
      let pane: Element = scene;
      for (let n = scene.parentElement; n; n = n.parentElement) {
        const h = n.getBoundingClientRect().height;
        if (h > sceneBox.height + 100) break;
        pane = n;
      }
      const paneBox = pane.getBoundingClientRect();

      /**
       * Every block whose top sits at or below the pane's bottom, described so a reader can NAME it.
       * Walks breadth-first and stops descending once a block is fully accounted for by one child,
       * so the list is the layout's own rows rather than every div in the subtree.
       */
      const below: Array<Record<string, unknown>> = [];
      const seen = new Set<Element>();
      const walk = (el: Element): void => {
        for (const child of [...el.children]) {
          if (seen.has(child)) continue;
          const b = child.getBoundingClientRect();
          if (b.height === 0 || b.width === 0) continue;
          if (b.top < paneBox.bottom - 2) {
            walk(child);
            continue;
          }
          seen.add(child);
          below.push({
            tag: child.tagName,
            role: child.getAttribute('role') ?? '',
            testid:
              child.getAttribute('data-chrome-slot') ??
              child.getAttribute('data-schedule-state') ??
              '',
            top: round(b.top),
            height: round(b.height),
            text: (child.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
          });
        }
      };
      walk(document.body);
      below.sort((a, b) => (a.top as number) - (b.top as number));

      return {
        viewportHeight: window.innerHeight,
        sceneCanvas: { top: round(sceneBox.top), height: round(sceneBox.height) },
        canvasPane: { top: round(paneBox.top), height: round(paneBox.height) },
        paneBottom: round(paneBox.bottom),
        unaccountedBelow: round(window.innerHeight - paneBox.bottom),
        below,
      };
    });

  const report: Record<string, unknown> = { planName: PLAN_NAME };

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(600);

    const collapsed = await read();

    // Expand the activities panel and pay the price, so the cost is measured rather than estimated
    // from a screenshot. `useState(true)` in `plan-workspace-toolbar.tsx` means COLLAPSED is already
    // the shipped default — this measures what a planner gives up by opening it, not what the
    // product would gain by changing a default.
    const expander = page.getByRole('button', { name: /expand/i }).first();
    let expanded: unknown = { skipped: 'no expand control found' };
    if (await expander.isVisible().catch(() => false)) {
      await expander.click();
      await page.waitForTimeout(600);
      expanded = await read();
      const collapser = page.getByRole('button', { name: /collapse/i }).first();
      if (await collapser.isVisible().catch(() => false)) {
        await collapser.click();
        await page.waitForTimeout(400);
      }
    }

    report[`${viewport.width}`] = { collapsed, expanded };
  }

  const path = writeMeasurement('m3-below-canvas', report);
  // eslint-disable-next-line no-console
  console.log(`\nWROTE ${path}\n`);
});
