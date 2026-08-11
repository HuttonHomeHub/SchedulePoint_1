import { writeFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

/**
 * **M0c** — the correction the feature-analyst forced, and the one that makes the numbers honest.
 *
 * `measure.spec.ts` and `reachability.spec.ts` both measure an **empty** plan: neither adds an
 * activity, so `ctx.hasDiagram` is false and three Row-1 items self-hide —
 * `finish-chip` (`isVisible: (ctx) => ctx.hasDiagram`, `tsld-toolbar-items.tsx:2360`, up to 160 px
 * of `max-w-[10rem]`), `next-conflict-status` and `search-status`. Their inline census confirms it:
 * `finish-chip` appears in neither the bar nor the `⋯` at any width.
 *
 * So **every figure those two passes report is a lower bound**, and the row a planner actually
 * looks at is wider than the row that was measured. This pass adds an activity, takes the pen so
 * the schedule computes, and re-measures — which is the number that should be quoted.
 *
 * It bypasses nothing: real sign-up, real plan, real pen, real recalculation.
 */

const WIDTHS = [
  { label: '2133 (1920 @ 90%)', width: 2133, height: 1080 },
  { label: '1920 @100%', width: 1920, height: 1080 },
  { label: '1440 (Surface Pro landscape)', width: 1440, height: 960 },
  { label: '960 (Surface Pro portrait)', width: 960, height: 1280 },
];

async function readRow(page: Page, ariaLabel: string): Promise<unknown> {
  const bar = page.getByRole('toolbar', { name: ariaLabel });
  const dom = await bar.evaluate((el) => {
    const container = el as HTMLElement;
    const box = container.getBoundingClientRect();
    const inline: string[] = [];
    const zeroVisible: string[] = [];
    const partlyClipped: string[] = [];
    let overflowPresent = false;
    let overflowVisibleWidth: number | null = null;
    for (const node of container.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
      const id = node.getAttribute('data-toolbar-item') ?? '';
      const b = node.getBoundingClientRect();
      const visible = Math.round(
        Math.max(0, Math.min(b.right, box.right) - Math.max(b.left, box.left)),
      );
      if (id === '__overflow__') {
        overflowPresent = true;
        overflowVisibleWidth = visible;
        continue;
      }
      inline.push(id);
      if (visible <= 0) zeroVisible.push(id);
      // WCAG 2.2 §2.5.8 sizes a pointer target by the part that is actually there, so a partly
      // clipped control is reported with the width that survives — "partly clipped" alone cannot
      // tell a cosmetic trim from a target below the 24 px minimum.
      else if (visible < Math.round(b.width) - 1) partlyClipped.push(`${id}:${visible}px`);
    }
    return {
      containerWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      overshoot: container.scrollWidth - container.clientWidth,
      inlineCount: inline.length,
      inline,
      zeroVisible,
      partlyClipped,
      overflowPresent,
      overflowVisibleWidth,
    };
  });

  let overflow: string[] = [];
  if (dom.overflowPresent && (dom.overflowVisibleWidth ?? 0) > 2) {
    await bar.getByRole('button', { name: 'More toolbar actions' }).click();
    const menu = page.getByRole('menu', { name: 'More toolbar actions' });
    await expect(menu).toBeVisible();
    overflow = await menu.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((n) =>
        (n.innerText ?? '').trim(),
      ),
    );
    await page.keyboard.press('Escape');
  }
  return { row: ariaLabel, ...dom, overflow };
}

test('M0c — measure a plan that has a computed diagram', async ({ page }) => {
  const stamp = Date.now();

  await page.setViewportSize({ width: 2133, height: 1080 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Loaded Tester');
  await page.getByLabel('Email').fill(`loaded-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Loaded Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();

  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('main').getByRole('button', { name: 'New client' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Northgate');
  await page.getByRole('dialog').getByRole('button', { name: 'Create client' }).click();
  await page.getByRole('link', { name: 'Northgate' }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Riverside');
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Riverside' }).click();
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Logic');
  await page
    .getByRole('dialog')
    .getByLabel(/Planned start/)
    .fill('2026-01-05');
  await page.getByRole('dialog').getByRole('button', { name: 'Create plan' }).click();
  await page.getByRole('link', { name: 'Logic' }).click();
  await expect(page.getByRole('toolbar', { name: 'View and navigate' })).toBeVisible();

  // The pen, then two activities, so the schedule computes and `hasDiagram` turns true.
  await page.getByRole('button', { name: 'Start editing' }).click();
  await expect(page.getByRole('button', { name: 'Stop editing' })).toBeVisible();
  const expand = page.getByRole('button', { name: 'Expand activities panel' });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  for (const name of ['Excavate', 'Pour slab']) {
    await page.getByRole('button', { name: 'New activity' }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Create activity' }).click();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
  }

  // The Finish read-out is the signal that `hasDiagram` flipped — it is `isVisible`-gated on it.
  const finish = page
    .getByRole('toolbar', { name: 'View and navigate' })
    .locator('[data-toolbar-item="finish-chip"]');
  await expect(finish).toHaveCount(1, { timeout: 30_000 });

  const report: Record<string, unknown> = {};
  for (const { label, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    report[label] = {
      'View and navigate': await readRow(page, 'View and navigate'),
      'Build and manage': await readRow(page, 'Build and manage'),
    };
  }

  writeFileSync(
    process.env.MEASURE_OUT ?? '/tmp/toolbar-m0c.json',
    JSON.stringify(report, null, 2),
  );
});
