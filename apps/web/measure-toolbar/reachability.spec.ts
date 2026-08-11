import { expect, test, type Page } from '@playwright/test';

import { writeMeasurement } from './output';

/**
 * **M0b** — the follow-up the first pass forced.
 *
 * `measure.spec.ts` reported items whose box extends past their `overflow-hidden` container's right
 * edge while the `⋯` offered no route to them. "Past the edge" is not the same claim as
 * "unreachable", and the difference decides whether this is a cosmetic overflow or a WCAG 2.1.1 /
 * 2.5.8 failure — so this pass measures the three questions separately, per item:
 *
 * - **geometry** — how far past the container's right edge, and is any of it still inside?
 * - **pointer** — is `document.elementFromPoint` at the control's own centre the control (or a
 *   descendant of it)? If not, no click can ever land on it.
 * - **keyboard** — after `.focus()`, is it `document.activeElement`, and did the container scroll
 *   to reveal it? A browser will scroll an `overflow: hidden` box to show a focused descendant, so
 *   a control can be pointer-dead and keyboard-live at the same time.
 *
 * Nothing here is injected or mocked: it drives the real workspace at the real viewport.
 */

const WIDTHS = [
  { label: '1920 @100%', width: 1920, height: 1080 },
  { label: '1440', width: 1440, height: 960 },
  { label: '960', width: 960, height: 1280 },
];

async function probe(page: Page, ariaLabel: string): Promise<unknown> {
  const bar = page.getByRole('toolbar', { name: ariaLabel });
  return bar.evaluate((el) => {
    const container = el as HTMLElement;
    const box = container.getBoundingClientRect();
    const out: unknown[] = [];
    for (const node of container.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
      const id = node.getAttribute('data-toolbar-item') ?? '';
      const b = node.getBoundingClientRect();
      const overhang = Math.round(b.right - box.right);
      if (overhang <= 1) continue;

      const cx = Math.round(b.left + b.width / 2);
      const cy = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(cx, cy);
      const pointerReaches = hit != null && (node === hit || node.contains(hit));

      // Probe the left-most still-visible sliver too: a partially-clipped control can still be
      // clicked on the part that shows, which is a very different user outcome.
      const visibleLeft = Math.max(b.left, box.left);
      const visibleRight = Math.min(b.right, box.right);
      const visibleWidth = Math.round(Math.max(0, visibleRight - visibleLeft));
      let sliverReaches = false;
      if (visibleWidth > 2) {
        const sliver = document.elementFromPoint(Math.round(visibleLeft + visibleWidth / 2), cy);
        sliverReaches = sliver != null && (node === sliver || node.contains(sliver));
      }

      const focusTarget = node.matches('button, [tabindex]')
        ? node
        : node.querySelector<HTMLElement>('button, [tabindex]');
      const scrollBefore = container.scrollLeft;
      focusTarget?.focus();
      const focused = focusTarget != null && document.activeElement === focusTarget;
      const scrolledToReveal = container.scrollLeft !== scrollBefore;
      container.scrollLeft = scrollBefore;

      out.push({
        id,
        widthPx: Math.round(b.width),
        overhangPx: overhang,
        visibleWidthPx: visibleWidth,
        pointerReachesCentre: pointerReaches,
        pointerReachesVisiblePart: sliverReaches,
        keyboardFocusable: focused,
        containerScrolledToReveal: scrolledToReveal,
      });
    }
    return { containerWidth: container.clientWidth, scrollWidth: container.scrollWidth, out };
  });
}

test('M0b — is a clipped toolbar control actually reachable?', async ({ page }) => {
  const stamp = Date.now();

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Reach Tester');
  await page.getByLabel('Email').fill(`reach-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Reach Co ${stamp}`);
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

  const report: Record<string, unknown> = {};
  for (const { label, width, height } of WIDTHS) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    report[label] = {
      'View and navigate': await probe(page, 'View and navigate'),
      'Build and manage': await probe(page, 'Build and manage'),
    };
  }

  // The user-level question, asked the way a planner would: can Playwright click Summary at 1920?
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(500);
  const summary = page
    .getByRole('toolbar', { name: 'View and navigate' })
    .locator('[data-toolbar-item="summary"]');
  let clickOutcome = 'clicked';
  try {
    await summary.click({ timeout: 4000 });
  } catch (error) {
    clickOutcome = `refused: ${(error as Error).message.split('\n')[0]}`;
  }
  report['click Summary at 1920'] = clickOutcome;

  writeMeasurement('toolbar-m0b', report);
});
