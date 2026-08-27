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

/** Diagnostic: why do View / Filter / Go to date report an empty panel? Probe, do not reason. */
test('diag: what a ToolbarPopover actually puts in the DOM', async ({ page }) => {
  clearMeasurement('diag-popovers');
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const orgSlug = await onboard(page, Date.now());
  await createHierarchy(page);
  await newPlan(page, 'Diag plan');
  await ensurePen(page);
  await seedActivities(page, orgSlug, [{ name: 'Site setup', laneIndex: 0, durationDays: 12 }]);
  await recalculate(page, orgSlug);
  await ensurePen(page);
  await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

  const out: Array<Record<string, unknown>> = [];
  for (const name of ['Go to date', 'View', 'Filter', 'Analysis']) {
    const trigger = page.getByRole('button', { name, exact: false }).first();
    await trigger.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    out.push(
      await page.evaluate((label) => {
        const dialogs = [...document.querySelectorAll('[role="dialog"],[role="menu"]')];
        const expanded = [...document.querySelectorAll('[aria-expanded="true"]')].map((e) =>
          (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 30),
        );
        const panels = dialogs.map((dl) => ({
          role: dl.getAttribute('role'),
          label: dl.getAttribute('aria-label'),
          children: [...dl.querySelectorAll('*')].slice(0, 45).map((c) => {
            const r = c.getAttribute('role');
            const txt = (c.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 28);
            return `${c.tagName}${r ? `[${r}]` : ''}:${txt}`;
          }),
        }));
        return { label, expandedTriggers: expanded, dialogCount: dialogs.length, panels };
      }, name),
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  writeMeasurement('diag-popovers', out);
  expect(out).toHaveLength(4);
});
