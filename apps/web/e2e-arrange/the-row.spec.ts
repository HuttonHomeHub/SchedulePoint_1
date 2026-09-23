import { expect, test, type Page } from '@playwright/test';

import {
  canvasInk,
  createPlan,
  ensurePen,
  onboard,
  openProject,
  recalculate,
  seedActivities,
} from './support';

/**
 * **The row under a bar is painted** (NetPoint-layout M1, spec §4.6).
 *
 * The unit suites prove what the painter would draw; only a browser proves the real product draws
 * it: `Dates` really is on when a plan first opens, and the band under a real bar really carries
 * the dates and the centre item. The canvas is `aria-hidden`, so the second half is read from the
 * pixels — and it is asserted as a DIFFERENCE between toggles on and off, because a band under a
 * bar also crosses the data-date line and other constant ink, and "some ink is there" would pass
 * against a painter that drew no text at all.
 */

/** Neutral (text-coloured) ink in the few pixel rows just below the first bar band. */
async function inkUnderTheBar(page: Page): Promise<number> {
  const { rows } = await canvasInk(page);
  const barRow = rows.findIndex((r) => r.bar > 20);
  if (barRow < 0) throw new Error('no bar is painted — there is nothing to read under');
  let bottom = barRow;
  while (bottom + 1 < rows.length && rows[bottom + 1]!.bar > 20) bottom += 1;
  // The below row sits a couple of CSS px under the bar and is one text line tall; 30 device rows
  // covers it at any device pixel ratio the suite runs at without reaching the next lane's name.
  return rows.slice(bottom + 1, bottom + 31).reduce((sum, r) => sum + r.link, 0);
}

async function setView(page: Page, name: 'Dates' | 'Labels', on: boolean): Promise<void> {
  await page.getByRole('button', { name: 'View', exact: true }).click();
  const box = page.getByRole('checkbox', { name });
  if (on) await box.check();
  else await box.uncheck();
  await page.keyboard.press('Escape');
}

test('the dates and the duration are painted under a bar, and Dates is on by default', async ({
  page,
}) => {
  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await openProject(page);
  await createPlan(page, 'The row');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Superstructure', laneIndex: 0, durationDays: 30 }]);
  await recalculate(page, orgSlug);
  await expect(page.locator('canvas').first()).toBeAttached();

  // (1) On by default, on first open (CQ-3).
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Dates' })).toBeChecked();
  await page.keyboard.press('Escape');

  // (2) The band under the bar carries text with both on, and loses it with both off.
  await expect.poll(async () => inkUnderTheBar(page)).toBeGreaterThan(0);
  const on = await inkUnderTheBar(page);
  await setView(page, 'Dates', false);
  await setView(page, 'Labels', false);
  await expect.poll(async () => inkUnderTheBar(page)).toBeLessThan(on);
  const off = await inkUnderTheBar(page);
  // Not a rounding difference: two dates and `30d` are well over a hundred text pixels.
  expect(on - off).toBeGreaterThan(100);
});
