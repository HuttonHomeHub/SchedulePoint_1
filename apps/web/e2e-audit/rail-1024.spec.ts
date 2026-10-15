import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

/**
 * **The left rail holds its seven organisation links, its tree floor and its footer at 1024 × 600**
 * (ADR-0179's floor; `docs/specs/organisation-export/m3-rail-measurement.md`).
 *
 * The rail is a column that scrolls as a whole around a tree with a four-row floor (`min-h-32`).
 * M3 measured it by a throwaway harness; this is that harness's rules, committed, so the next
 * destination added to the list fails here instead of quietly clipping a link or the version footer.
 * Read in a real browser because layout is the claim: jsdom has no geometry. Fine and coarse
 * pointers are both read, because a coarse pointer grows every row (44 px against 28) and is the
 * tighter of the two. An eighth link would push the coarse tree below its floor (measured 131 px
 * against 128, 2026-10-14).
 *
 * Runs in the audit suite because it needs only a signed-in Org Admin and no flag.
 */

const FLOOR_PX = 128;
const LINK_COUNT = 7;

async function signUpWithOrganisation(page: Page, stamp: number): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Rail Admin');
  await page.getByLabel('Email').fill(`rail-admin-${stamp}@example.com`);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: /create an account/i }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel('Organisation name').fill(`Rail Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/rail-co-${stamp}`));
}

for (const pointer of ['fine', 'coarse'] as const) {
  test.describe(`${pointer} pointer`, () => {
    test.use({ viewport: { width: 1024, height: 600 }, hasTouch: pointer === 'coarse' });

    test(`the expanded rail fits seven links, the tree floor and the footer (${pointer})`, async ({
      page,
    }) => {
      await signUpWithOrganisation(page, Date.now());
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
        'the context is the pointer this case names',
      ).toBe(pointer === 'coarse');

      const rail = page.getByRole('navigation', { name: 'Project Explorer' });
      await expect(rail).toBeVisible();
      const links = page.getByRole('navigation', { name: 'Organisation' }).getByRole('link');
      await expect(links, 'the seven organisation destinations').toHaveCount(LINK_COUNT);

      const tree = rail.getByRole('tree', { name: 'Project Explorer' });
      const region = tree.locator('xpath=ancestor::div[contains(@class,"min-h-32")][1]');
      const treeBox = await region.boundingBox();
      if (treeBox === null) throw new Error('the tree region has no box');
      expect(treeBox.height, `tree region height (${pointer})`).toBeGreaterThanOrEqual(FLOOR_PX);

      // The rail's visible window, and every link wholly inside it with the rail unscrolled.
      const window = await rail.boundingBox();
      if (window === null) throw new Error('the rail has no box');
      expect(await rail.evaluate((node) => node.scrollTop), 'the rail is not scrolled').toBe(0);
      const count = await links.count();
      for (let index = 0; index < count; index += 1) {
        const link = links.nth(index);
        const box = await link.boundingBox();
        if (box === null) throw new Error(`organisation link ${index} has no box`);
        const label = (await link.textContent())?.trim() ?? String(index);
        expect(box.y, `${label} starts inside the rail`).toBeGreaterThanOrEqual(window.y);
        expect(box.y + box.height, `${label} ends inside the rail`).toBeLessThanOrEqual(
          window.y + window.height,
        );
      }

      const footer = rail.getByLabel('Application versions');
      await expect(footer).toBeVisible();
      const footerBox = await footer.boundingBox();
      if (footerBox === null) throw new Error('the version footer has no box');
      expect(footerBox.y + footerBox.height, 'the footer is inside the rail').toBeLessThanOrEqual(
        window.y + window.height,
      );
      test.info().annotations.push({ type: 'tree height', description: `${treeBox.height}px` });
    });
  });
}
