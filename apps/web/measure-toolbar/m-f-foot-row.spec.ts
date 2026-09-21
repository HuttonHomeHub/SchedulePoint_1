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
 * **What the unconditional `Clear visual start` costs the canvas** (one-planning-surface M-F-T6).
 *
 * `e2e-workspace-chrome/dock.spec.ts` went red on its equality — a selection now costs the canvas
 * **36 px** at 1646, where ADR-0115 had restored it to **0**. That gate's own docblock says the
 * equality exists so that "if a future milestone genuinely needs to spend canvas on a selection,
 * this number is the conversation". This is the conversation, and it is held with numbers rather
 * than with an estimate: the previous three times this surface's width was argued about, the
 * arithmetic was contradicted by its own measurement.
 *
 * It reports, per viewport: the foot row's height at rest and with a selection, the bar's content
 * width against the space it is given, and every control's own width. Asserts nothing (ADR-0081 §3).
 */
const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1646', width: 1646, height: 1097 },
  { name: '1440', width: 1440, height: 900 },
];

test.describe.configure({ mode: 'serial' });

test('the foot row, at rest and with a selection', async ({ page }) => {
  test.setTimeout(240_000);
  clearMeasurement('m-f-foot-row');

  const stamp = Date.now();
  const orgSlug = await onboard(page, stamp);
  await createHierarchy(page);
  await newPlan(page, `Foot row ${stamp}`);
  await ensurePen(page);
  await seedActivities(page, orgSlug, [
    { name: 'Dig', laneIndex: 0, durationDays: 5 },
    { name: 'Pour', laneIndex: 1, durationDays: 5 },
  ]);
  await recalculate(page, orgSlug);
  await ensurePen(page);

  const readings: unknown[] = [];
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(400);

    const row = page.locator('[data-activities-bar]');
    const idle = (await row.boundingBox())?.height ?? null;

    // Select through the canvas's own listbox, which is the only route that does not depend on
    // where a bar happens to be painted at this viewport.
    await page
      .getByRole('listbox', { name: /Activities/ })
      .first()
      .focus();
    await page.keyboard.press('ArrowDown');
    const bar = page.getByRole('toolbar', { name: /^Actions for / });
    await expect(bar).toBeVisible();
    await page.waitForTimeout(300);

    const selected = (await row.boundingBox())?.height ?? null;
    const controls = await bar.getByRole('button').evaluateAll((nodes) =>
      nodes.map((n) => ({
        name: (n.getAttribute('aria-label') ?? n.textContent ?? '').trim(),
        width: Math.round(n.getBoundingClientRect().width),
      })),
    );
    const barBox = await bar.boundingBox();
    const contentWidth = controls.reduce((sum, c) => sum + c.width, 0);

    readings.push({
      viewport: vp.name,
      rowHeightIdle: idle,
      rowHeightWithSelection: selected,
      costToCanvas: idle !== null && selected !== null ? selected - idle : null,
      barWidthGiven: barBox ? Math.round(barBox.width) : null,
      controlsSum: contentWidth,
      controls,
    });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }

  writeMeasurement('m-f-foot-row', { takenAt: new Date().toISOString(), readings });
});
