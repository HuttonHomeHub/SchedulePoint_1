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
 * **Accessibility across every stored theme preference** (ADR-0055 §5, rescoped by ADR-0097).
 *
 * The Corporate theme shipped with six verified contrast defects past a human review, a
 * component review and a green axe suite. The axe suite was not wrong — it had simply never
 * been asked to look at anything but the default theme, in its default surface.
 *
 * **The product now has one theme, and this sweep is kept rather than collapsed to a single
 * scan**, because what it proves has changed into something no unit test can reach: a reader
 * still carrying `dark` or `system` from before the collapse must get the SAME shell as
 * everyone else. The boot script stamps nothing and the provider stamps nothing, so a flash is
 * unrepresentable — but that claim spans a parser-blocking `<script src>`, the real bundle and
 * an actual first paint, and jsdom has none of the three. `system` keeps its dark emulation for
 * the same reason: `prefers-color-scheme` no longer selects anything, and the way to know that
 * is to ask a browser that really prefers dark.
 *
 * The six defect sites are also asserted BY NAME. "axe is clean" would have passed on the
 * invisible outline button — an unreadable control is not an axe rule — and axe measures no
 * hover or `aria-current` state at all, so those are read back through `getComputedStyle`.
 */

/** Every value a reader's storage may hold, plus how the browser should be emulated. */
const THEMES: ReadonlyArray<{ choice: ThemeChoice; colorScheme: 'light' | 'dark' }> = [
  { choice: 'light', colorScheme: 'light' },
  { choice: 'dark', colorScheme: 'dark' },
  { choice: 'corporate', colorScheme: 'light' },
  // `system` under DARK emulation is the sharpest case: it was the old default, so it is what
  // most readers still have stored, and it is the one combination that would resurrect a dark
  // paint if any branch survived anywhere in the chain.
  { choice: 'system', colorScheme: 'dark' },
];

const TEXT_MIN = 4.5;

/**
 * **The one assertion no unit test can make: every stored preference paints the same.**
 *
 * The scans below prove each shell is accessible; they would each pass equally if the four
 * stored values still selected four different palettes, because "accessible" is not "identical".
 * This case is the other half — it reads the resolved ground and the resolved ink off a real
 * first paint and requires them to agree across all four, which is exactly what "the boot script
 * and the provider cannot disagree" means when written as something checkable.
 *
 * It has to be a browser: the claim spans a parser-blocking `<script src>`, the real bundle and
 * an actual paint, and jsdom has none of the three. It reads `<html>` rather than a component,
 * because a surviving branch would stamp a class there and every scope below would follow.
 */
test('every stored preference resolves to the same painted theme', async ({ browser }) => {
  const seen: Array<{ choice: string; ground: string; ink: string; classes: string }> = [];

  for (const entry of THEMES) {
    // A FRESH CONTEXT per value, not one page reused four times. `setTheme` works through
    // `page.addInitScript`, which ACCUMULATES: reusing a page would leave four seed scripts
    // running in registration order, so each iteration would be correct only because the
    // last-registered one happens to win. A test whose correctness rests on that is one that
    // will mislead somebody the day the order changes.
    const context = await browser.newContext({ colorScheme: entry.colorScheme });
    try {
      const page = await context.newPage();
      await setTheme(page, entry.choice);
      await page.goto('/sign-in');
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

      const paint = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          ground: style.getPropertyValue('--background').trim(),
          ink: style.getPropertyValue('--foreground').trim(),
          classes: document.documentElement.className,
        };
      });
      seen.push({ choice: entry.choice, ...paint });
    } finally {
      await context.close();
    }
  }

  const first = seen[0]!;
  for (const entry of seen) {
    expect(entry.ground, `${entry.choice} resolved a different --background`).toBe(first.ground);
    expect(entry.ink, `${entry.choice} resolved a different --foreground`).toBe(first.ink);
    // No class at all — not "the same class". A stamped class is the mechanism a flash needs,
    // so its absence is the guarantee rather than a detail of how it is achieved.
    // Two assertions, and the first one is the general one. `<html>` carries `h-full` from
    // `index.html` — a layout class, nothing to do with themes — so "no class at all" was the
    // wrong bar and this case found that by failing before it found anything else. Equality
    // across the four catches ANY stamped class whatever it is called; the named check below
    // catches the specific pair a returning branch would use, which equality alone would miss
    // if every value stamped the same wrong class.
    expect(entry.classes, `${entry.choice} carries different classes on <html>`).toBe(
      first.classes,
    );
    const themeClass = entry.classes.split(/\s+/).find((c) => c === 'dark' || c === 'corporate');
    expect(themeClass, `${entry.choice} stamped a theme class on <html>`).toBeUndefined();
  }
});

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
