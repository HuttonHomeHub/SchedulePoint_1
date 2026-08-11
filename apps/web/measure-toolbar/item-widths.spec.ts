import { expect, test, type Page } from '@playwright/test';

import { writeMeasurement } from './output';

/**
 * **M2-T0** — the per-item widths the consolidation must be sized against.
 *
 * `m0-measurement.md` carries row-level totals and three item widths. Nothing in this repository
 * records how wide `go-to-date` or `search` actually is, and M2 proposes to cut 46 commands to ~24
 * on the strength of exactly that. Sizing a consolidation by arithmetic is the mistake this whole
 * epic exists to correct, so the plan makes this the first task of the milestone.
 *
 * It reports each item's rendered width, whether it is labelled, and which group it sits in — on a
 * populated plan, with labels in whatever state the shipped budget puts them. It deliberately does
 * **not** report whether an item can demote; see the note at the push site for why that must be
 * joined from the registry rather than read off the markup.
 *
 * Measured 2026-08-11: Row 1 at 2304 is 25 items totalling 1911 px, of which **1198 px is pinned**
 * — corroborating `design.md`'s ~1177 px estimate, one of the few figures in that document that
 * survived contact with a browser.
 *
 * Asserts nothing; it is a harness (ADR-0081 §3).
 */

const WIDTHS = [2304, 1920, 1440];

async function itemWidths(page: Page, ariaLabel: string): Promise<unknown> {
  return page.getByRole('toolbar', { name: ariaLabel }).evaluate((el) => {
    const container = el as HTMLElement;
    const items: { id: string; group: string; width: number; labelled: boolean }[] = [];
    for (const node of container.querySelectorAll<HTMLElement>('[data-toolbar-item]')) {
      const id = node.getAttribute('data-toolbar-item') ?? '';
      if (id === '__overflow__') continue;
      const group = node.closest('[role="group"]')?.getAttribute('aria-label') ?? '';
      // **No `pinned` flag, deliberately.** The first version derived it from the DOM — "not a
      // `<button>`" — and that is wrong: `data-toolbar-item` sits on the item's *focusable control*,
      // and a `render` item's control is usually a button too. It reported Row 1's pinned subtotal
      // as 390 px against a true ~1198 px, which would have under-sized the whole M2 consolidation
      // by 800 px in the direction that makes it look easy. Whether an item can demote is a fact
      // about the **registry** (`typeof item.render === 'function'`), so it is joined there rather
      // than guessed from markup.
      items.push({
        id,
        group,
        width: Math.round(node.getBoundingClientRect().width),
        labelled: (node.innerText ?? '').trim().length > 0,
      });
    }
    return {
      containerWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      total: items.reduce((sum, i) => sum + i.width, 0),
      items,
    };
  });
}

test('M2-T0 — per-item widths on a populated plan', async ({ page }) => {
  const stamp = Date.now();

  await page.setViewportSize({ width: 2304, height: 1080 });
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Widths Tester');
  await page.getByLabel('Email').fill(`widths-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  await page.getByLabel('Organisation name').fill(`Widths Co ${stamp}`);
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
  await expect(
    page
      .getByRole('toolbar', { name: 'View and navigate' })
      .locator('[data-toolbar-item="finish-chip"]'),
  ).toHaveCount(1, { timeout: 30_000 });

  const report: Record<string, unknown> = {};
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1080 });
    await page.waitForTimeout(600);
    report[String(width)] = {
      'View and navigate': await itemWidths(page, 'View and navigate'),
      'Build and manage': await itemWidths(page, 'Build and manage'),
    };
  }

  writeMeasurement('m2-item-widths', report);
});
