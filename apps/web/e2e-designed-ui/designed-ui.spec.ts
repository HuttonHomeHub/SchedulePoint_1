import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  computedPair,
  contrast,
  createClient,
  onboard,
  setTheme,
  type ThemeChoice,
} from './support';

/**
 * **Theme-parametrised accessibility** (ADR-0055 §5, spec §4.7 D1).
 *
 * The Corporate theme shipped with six verified contrast defects past a human review, a
 * component review and a green axe suite. The axe suite was not wrong — it had simply never
 * been asked to look at anything but the default theme, in its default surface. This suite
 * closes that: every picker option, plus `system` under dark emulation, over the shell that
 * carries the header chrome and the Project Explorer panel.
 *
 * The six defect sites are also asserted BY NAME. "axe is clean" would have passed on the
 * invisible outline button — an unreadable control is not an axe rule — and axe measures no
 * hover or `aria-current` state at all, so those are read back through `getComputedStyle`.
 */

/** The four options a user can actually pick, plus how the browser should be emulated. */
const THEMES: ReadonlyArray<{ choice: ThemeChoice; colorScheme: 'light' | 'dark' }> = [
  { choice: 'light', colorScheme: 'light' },
  { choice: 'dark', colorScheme: 'dark' },
  { choice: 'corporate', colorScheme: 'light' },
  // `system` is a distinct code path (it resolves at runtime), and it is the DEFAULT — so the
  // one theme most users see is the one no suite had ever scanned under dark emulation.
  { choice: 'system', colorScheme: 'dark' },
];

const TEXT_MIN = 4.5;

for (const { choice, colorScheme } of THEMES) {
  test.describe(`theme: ${choice} (prefers-color-scheme: ${colorScheme})`, () => {
    test(`the app shell has no WCAG 2 A/AA violations`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await setTheme(page, choice);
      const stamp = Date.now();
      await onboard(page, stamp);
      await createClient(page, `Contrast Client ${stamp}`);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    test(`the six named defect sites are legible`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await setTheme(page, choice);
      const stamp = Date.now() + 1;
      const orgSlug = await onboard(page, stamp);
      await createClient(page, `Contrast Client ${stamp}`);

      // D1 — a nav link at rest. The header's `text-muted-foreground` used to resolve to the
      // page grey; on navy it was 1.26:1.
      const navLink = `header nav a[href="/orgs/${orgSlug}/calendars"]`;
      expect(contrast(await computedPair(page, navLink))).toBeGreaterThanOrEqual(TEXT_MIN);

      // D2 — the same link hovered. axe never measures a hover state.
      await page.locator(navLink).hover();
      expect(contrast(await computedPair(page, navLink))).toBeGreaterThanOrEqual(TEXT_MIN);

      // D3 — the current-page link (`aria-current="page"`), likewise unmeasured by axe.
      const current = 'header nav a[aria-current="page"]';
      await expect(page.locator(current)).toBeVisible();
      expect(contrast(await computedPair(page, current))).toBeGreaterThanOrEqual(TEXT_MIN);

      // D4 — the account area. The always-visible email (2.8:1 on navy) and the `outline`
      // Sign-out button (1.01:1 — an invisible control) are GONE: both moved into the account
      // chip's portalled menu, which paints on the page's `--popover`. What remains on the band
      // is the chip itself, so that is what has to clear the bar — and the menu's contents are
      // covered by the whole-page axe scan above once it is open.
      // Measured on the INITIALS PILL, not on the button that wraps it. The trigger is a
      // transparent flex row — the ink and the fill both live on the pill inside it — so reading
      // `backgroundColor` off the button yields `rgba(0,0,0,0)` and a ratio against nothing.
      // `computedPair` also walks ancestors for the first painted backdrop, which the hand-rolled
      // read this replaces did not.
      const chip = 'header button[aria-label^="Account"] span';
      expect(contrast(await computedPair(page, chip))).toBeGreaterThanOrEqual(TEXT_MIN);

      // D5 — the rail's secondary text. Same root cause as D1, on the other surface.
      const railFooter = 'nav[aria-label="Project Explorer"] .text-muted-foreground';
      if (await page.locator(railFooter).first().isVisible()) {
        expect(contrast(await computedPair(page, railFooter))).toBeGreaterThanOrEqual(TEXT_MIN);
      }

      // D6 — a tree row's ink on the panel fill.
      const treeRow = 'nav[aria-label="Project Explorer"] [role="treeitem"]';
      await expect(page.locator(treeRow).first()).toBeVisible();
      expect(contrast(await computedPair(page, treeRow))).toBeGreaterThanOrEqual(TEXT_MIN);
    });
  });
}
