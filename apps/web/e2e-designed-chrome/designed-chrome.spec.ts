import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createClient, createPlan, createProject, onboard, setTheme } from './support';

/**
 * **The designed chrome band, flag ON** (ADR-0055 S2). Three claims, none of which a unit test
 * can make honestly because all three are about the rendered document:
 *
 * 1. the header row and the plan's toolbar rows are **one** surface, not three stacked strips;
 * 2. the tab order follows the new DOM order — brand → nav → account → toolbar → rail → workspace;
 * 3. axe finds nothing on the band, in the theme the band was designed for.
 */

test.describe('the chrome band', () => {
  test('renders the header and the toolbar rows as one chrome surface', async ({ page }) => {
    await setTheme(page, 'corporate');
    const stamp = Date.now();
    await onboard(page, stamp);
    await createClient(page, `Band Client ${stamp}`);
    await createProject(page, `Band Project ${stamp}`);
    await createPlan(page, `Band Plan ${stamp}`);

    // **Located by what it CONTAINS, not by document order.** `.first()` worked while the band was
    // the only chrome surface; the light corporate theme moved the tool rail from `panel` to
    // `chrome` (the rail stays navy, the Project Explorer went light), and the rail precedes the
    // band in the DOM — so `.first()` silently started selecting the wrong element. The header is
    // what makes this the band.
    const band = page
      .locator('[data-surface="chrome"]')
      .filter({ has: page.locator('header') })
      .first();
    await expect(band).toBeVisible();
    // The header is inside the band…
    await expect(band.locator('header')).toHaveCount(1);
    // …and so are both toolbar rows, which live in the workspace's React tree and only reach
    // here through the portal.
    // One strip since Graphite M5 — the two rows this asserted are merged, so asserting it twice
    // would be asserting the same element twice and reading as coverage of a split that is gone.
    await expect(band.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

    // The rail and the workspace are BELOW the band, not inside it.
    await expect(band.locator('nav[aria-label="Project Explorer"]')).toHaveCount(0);
    await expect(band.locator('main')).toHaveCount(0);
  });

  test('is one row before a plan opens and grows to carry the toolbar', async ({ page }) => {
    await setTheme(page, 'corporate');
    const stamp = Date.now() + 1;
    await onboard(page, stamp);
    // **Located by what it CONTAINS, not by document order.** `.first()` worked while the band was
    // the only chrome surface; the light corporate theme moved the tool rail from `panel` to
    // `chrome` (the rail stays navy, the Project Explorer went light), and the rail precedes the
    // band in the DOM — so `.first()` silently started selecting the wrong element. The header is
    // what makes this the band.
    const band = page
      .locator('[data-surface="chrome"]')
      .filter({ has: page.locator('header') })
      .first();
    const bare = (await band.boundingBox())?.height ?? 0;
    expect(bare).toBeGreaterThan(0);

    await createClient(page, `Band Client ${stamp}`);
    await createProject(page, `Band Project ${stamp}`);
    await createPlan(page, `Band Plan ${stamp}`);
    await expect(band.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

    // Height is content-driven: a fixed band would either waste a strip on every non-plan
    // screen or clip the toolbar.
    const withPlan = (await band.boundingBox())?.height ?? 0;
    expect(withPlan).toBeGreaterThan(bare);
  });

  test('tab order runs brand → nav → account → toolbar → workspace', async ({ page }) => {
    await setTheme(page, 'corporate');
    const stamp = Date.now() + 2;
    await onboard(page, stamp);
    await createClient(page, `Band Client ${stamp}`);
    await createProject(page, `Band Project ${stamp}`);
    await createPlan(page, `Band Plan ${stamp}`);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

    /** Tab until `predicate` matches, or give up — reports what it reached for a readable failure. */
    async function tabUntil(label: string, predicate: RegExp, limit = 30): Promise<void> {
      const seen: string[] = [];
      for (let i = 0; i < limit; i += 1) {
        await page.keyboard.press('Tab');
        const description = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el) return '';
          return `${el.tagName}:${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 24) ?? ''}`;
        });
        seen.push(description);
        if (predicate.test(description)) return;
      }
      throw new Error(`never reached ${label}; tabbed through ${seen.join(' → ')}`);
    }

    await page.locator('body').click({ position: { x: 1, y: 1 } });
    // The nav comes after the brand, and the account chip after the nav — the band's DOM order.
    await tabUntil('the Calendars nav link', /Calendars/);
    await tabUntil('the account chip', /Account/);
    // The toolbar is next, because it is now the second row of the same band rather than a
    // separate strip below the rail.
    await tabUntil('the toolbar', /BUTTON:/);
  });

  test('the band has no WCAG 2 A/AA violations', async ({ page }) => {
    await setTheme(page, 'corporate');
    const stamp = Date.now() + 3;
    await onboard(page, stamp);
    await createClient(page, `Band Client ${stamp}`);
    await createProject(page, `Band Project ${stamp}`);
    await createPlan(page, `Band Plan ${stamp}`);
    await expect(page.getByRole('toolbar', { name: 'Plan commands' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[data-surface="chrome"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
