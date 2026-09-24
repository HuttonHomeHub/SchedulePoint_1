import { expect, test, type Page } from '@playwright/test';

import {
  createPlan,
  ensurePen,
  onboard,
  openPlanId,
  openProject,
  recalculate,
} from '../e2e-arrange/support';

/**
 * **NetPoint grammar M5 — the milestone is a downward triangle, on the real canvas** (spec §4.2 G8).
 *
 * A plan holding one finish milestone. The Today line is switched off, because it is the only other
 * saturated mark on such a canvas. The milestone is then the saturated blob, and its shape is read
 * from its rows: the widest row (the base) must sit above the narrowest (the apex), and be several
 * times wider. The diamond it replaced is narrow at both ends and widest in the middle, so it cannot
 * pass.
 */

async function seedMilestone(page: Page, orgSlug: string): Promise<void> {
  const planId = openPlanId(page);
  const error = await page.evaluate(
    async ({ org, id }) => {
      const response = await fetch(`/api/v1/organizations/${org}/plans/${id}/activities`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Handover', type: 'FINISH_MILESTONE', laneIndex: 1 }),
      });
      return response.ok ? null : `${String(response.status)} ${await response.text()}`;
    },
    { org: orgSlug, id: planId },
  );
  if (error !== null) throw new Error(`seeding the milestone was rejected: ${error}`);
}

test.describe('NetPoint grammar — milestones', () => {
  test.setTimeout(240_000);

  test('a milestone draws as a downward triangle, and the legend keys it', async ({ page }) => {
    const stamp = Date.now();
    const orgSlug = await onboard(page, stamp);
    await openProject(page);
    await createPlan(page, 'Milestones');
    await ensurePen(page);
    await seedMilestone(page, orgSlug);
    await recalculate(page, orgSlug);
    await expect(page.locator('canvas').first()).toBeAttached({ timeout: 20_000 });

    const view = page.getByRole('button', { name: 'View', exact: true });
    await view.click();
    await page.getByRole('checkbox', { name: 'Today line', exact: true }).uncheck();
    await page.keyboard.press('Escape');

    const shape = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')];
      const canvas = canvases.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
      const ctx = canvas.getContext('2d')!;
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      const widths: { y: number; w: number }[] = [];
      for (let y = 0; y < height; y += 1) {
        let w = 0;
        for (let x = 0; x < width; x += 1) {
          const i = (y * width + x) * 4;
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          if ((data[i + 3] ?? 0) > 200 && Math.max(r, g, b) - Math.min(r, g, b) > 60) w += 1;
        }
        if (w > 0) widths.push({ y, w });
      }
      return widths;
    });
    expect(shape.length, 'no saturated mark on the canvas').toBeGreaterThan(4);
    const widest = shape.reduce((a, b) => (b.w > a.w ? b : a));
    const narrowest = shape.reduce((a, b) => (b.w < a.w ? b : a));
    expect(
      widest.y,
      'the widest row (the base) is not above the narrowest (the apex)',
    ).toBeLessThan(narrowest.y);
    expect(widest.w).toBeGreaterThanOrEqual(3 * narrowest.w);
    // The base is the first row of the mark, not its middle: a diamond is widest halfway down.
    expect(widest.y - shape[0]!.y).toBeLessThanOrEqual(3);

    await page.locator('[data-toolbar-item="legend"]').click();
    const legend = page.getByRole('list', { name: 'Legend' });
    await expect(legend.getByText('Milestone', { exact: true })).toBeVisible();
  });
});
