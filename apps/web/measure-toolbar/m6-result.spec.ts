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
 * **M6's falsification condition, run against the shipped promotion.**
 *
 * Written before the change: *promoting one lens toggle must not add a line to the deck at 1920 or
 * 1646. At 1440 it may, and the product owner accepted that.*
 *
 * `m1-deck-load.spec.ts` predicted it from injected clones (one toggle: two lines at 1920 and 1646,
 * three at 1440). This is the same question asked of the real registry item, because a clone is a
 * width and a registration is a control — and the previous milestone in this epic shipped a class
 * that measured correctly and did nothing.
 */
const CASES = [
  { width: 1920, height: 1080, maxLines: 2 },
  { width: 1646, height: 1097, maxLines: 2 },
  { width: 1440, height: 900, maxLines: 3 },
];

test('M6: the promoted lens toggle costs no deck line at 1920 or 1646', async ({ page }) => {
  clearMeasurement('m6-result');
  test.setTimeout(600_000);

  await page.setViewportSize({ width: 1920, height: 1080 });
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, 'Riverside Quarter — Phase 2 Substructure');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Site setup', laneIndex: 0, durationDays: 12 },
    { name: 'Excavate to formation', laneIndex: 1, durationDays: 18 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const results: Array<Record<string, unknown>> = [];
  for (const c of CASES) {
    await page.setViewportSize({ width: c.width, height: c.height });
    await page.reload();
    await page.waitForTimeout(1400);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();
    await page.waitForTimeout(600);

    const read = await page.evaluate(() => {
      const r = (n: number): number => Math.round(n * 10) / 10;
      const deck = document.querySelector('[role="toolbar"][aria-label="Plan commands"]');
      const cv = document.querySelector('canvas');
      if (!deck) throw new Error('deck not found');
      const cards = [...deck.children];
      return {
        deckLines: [...new Set(cards.map((x) => Math.round(x.getBoundingClientRect().y)))].length,
        deckH: r(deck.getBoundingClientRect().height),
        canvasH: cv ? r(cv.getBoundingClientRect().height) : null,
        // The control is a real registration, not a width: assert it is reachable by name.
        onDeck: Boolean(deck.querySelector('[data-toolbar-item="baseline-overlay"]')),
      };
    });
    results.push({ ...c, ...read });

    expect(read.onDeck, `${c.width}: Baseline overlay is a deck item`).toBe(true);
    expect(read.deckLines, `${c.width}: deck lines`).toBeLessThanOrEqual(c.maxLines);
  }

  writeMeasurement('m6-result', results);
});
