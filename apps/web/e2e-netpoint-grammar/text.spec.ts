import { expect, test, type Page } from '@playwright/test';

import {
  createPlan,
  ensurePen,
  onboard,
  openPlanId,
  openProject,
  recalculate,
} from '../e2e-arrange/support';
import { pickZoomPreset } from '../e2e-search-nav/support';

/**
 * **NetPoint grammar M4 — the canvas's text, on the real canvas** (spec §4.2 G7, G11).
 *
 * - The canvas prints a name without its code unless `View ▾ ▸ Markers ▸ Activity codes` is on, and
 *   the parallel listbox's accessible name is `name, code` either way: the switch changes the
 *   picture, never what a screen reader is told (the M0-T4 ruling R7).
 * - Dates are withheld at the overview tier: at the Week preset there is text under the bar, at
 *   Year there is none.
 *
 * Text on a canvas cannot be read back, so it is found as ink: dark, unsaturated pixels in the row
 * above the bar (the name) or below it (the dates), located from the bar's own rows. The data-date
 * line is switched off first, because it is a dark vertical that runs through both rows.
 */

async function seedCoded(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  const error = await page.evaluate(
    async ({ org, id }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Excavate',
          code: 'C100',
          type: 'TASK',
          durationDays: 20,
          laneIndex: 1,
        }),
      });
      return response.ok ? null : `${String(response.status)} ${await response.text()}`;
    },
    { org: orgSlug, id: planId },
  );
  if (error !== null) throw new Error(`seeding the coded activity was rejected: ${error}`);
}

/** Dark text ink in the row above and the row below the one bar on the scene. */
async function inkAroundBar(page: Page): Promise<{ above: number; below: number }> {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
    const ctx = canvas.getContext('2d')!;
    const { width, height } = canvas;
    const data = ctx.getImageData(0, 0, width, height).data;
    const dpr = window.devicePixelRatio || 1;
    const at = (x: number, y: number): number[] => {
      const i = (y * width + x) * 4;
      return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0];
    };
    // The bar: the rows with the most saturated ink (a rung or the bar green).
    const saturated = (p: number[]): boolean =>
      (p[3] ?? 0) > 200 && Math.max(p[0]!, p[1]!, p[2]!) - Math.min(p[0]!, p[1]!, p[2]!) > 60;
    const rows: number[] = [];
    for (let y = 0; y < height; y += 1) {
      let n = 0;
      for (let x = 0; x < width; x += 1) if (saturated(at(x, y))) n += 1;
      rows.push(n);
    }
    const peak = Math.max(...rows);
    const barRows = rows.map((n, y) => (n > peak * 0.6 ? y : -1)).filter((y) => y >= 0);
    const top = Math.min(...barRows);
    const bottom = Math.max(...barRows);
    const dark = (p: number[]): boolean =>
      (p[3] ?? 0) > 200 &&
      p[0]! + p[1]! + p[2]! < 450 &&
      Math.max(p[0]!, p[1]!, p[2]!) - Math.min(p[0]!, p[1]!, p[2]!) < 40;
    const count = (y0: number, y1: number): number => {
      let n = 0;
      for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y += 1) {
        for (let x = 0; x < width; x += 1) if (dark(at(x, y))) n += 1;
      }
      return n;
    };
    // The name row sits just above the bar and the date row just below it, one text line each.
    return {
      above: count(Math.round(top - 17 * dpr), Math.round(top - 2 * dpr)),
      below: count(Math.round(bottom + 2 * dpr), Math.round(bottom + 17 * dpr)),
    };
  });
}

async function viewCheckbox(page: Page, name: string, checked: boolean): Promise<void> {
  const view = page.getByRole('button', { name: 'View', exact: true });
  if ((await view.getAttribute('aria-expanded')) !== 'true') await view.click();
  const box = page.getByRole('checkbox', { name, exact: true });
  if (checked) await box.check();
  else await box.uncheck();
  await page.keyboard.press('Escape');
}

test.describe('NetPoint grammar — text', () => {
  test.setTimeout(240_000);

  test('codes are a picture choice; the accessible name is "name, code" either way', async ({
    page,
  }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Codes');
    await ensurePen(page);
    await seedCoded(page, orgSlug);
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });
    await viewCheckbox(page, 'Data date line', false);

    const diagram = page.getByRole('region', { name: 'Time-scaled logic diagram' });
    const option = diagram.getByRole('option', { name: /^Excavate, C100/ });
    await expect(option).toHaveCount(1);
    const before = await inkAroundBar(page);

    await viewCheckbox(page, 'Activity codes', true);
    // The name the screen reader is given does not move with the switch.
    await expect(diagram.getByRole('option', { name: /^Excavate, C100/ })).toHaveCount(1);
    // The picture does: the code adds ink to the name row.
    await expect
      .poll(async () => (await inkAroundBar(page)).above, {
        message: 'switching Activity codes on added no ink to the name row',
      })
      .toBeGreaterThan(before.above + 20);
  });

  test('dates are drawn at Week and withheld at Year (the overview tier)', async ({ page }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Tiers');
    await ensurePen(page);
    await seedCoded(page, orgSlug);
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });
    await viewCheckbox(page, 'Data date line', false);

    await pickZoomPreset(page, 'Week');
    await expect
      .poll(async () => (await inkAroundBar(page)).below, {
        message: 'no date text under the bar at Week',
      })
      .toBeGreaterThan(20);
    await pickZoomPreset(page, 'Year');
    await expect
      .poll(async () => (await inkAroundBar(page)).below, {
        message: 'date text under the bar at Year, where the overview tier withholds it',
      })
      .toBe(0);
  });
});
