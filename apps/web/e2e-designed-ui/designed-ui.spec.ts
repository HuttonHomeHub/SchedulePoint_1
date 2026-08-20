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
      //
      // **The site MOVED, it was not deleted** (ADR-0097 Landing D1a): the organisation nav left
      // the header for the Project Explorer rail, so this link now paints in the `panel` scope
      // rather than `chrome`. That is a different pair of tokens, so the measurement follows the
      // link rather than being dropped — the defect class is "a nav link's ink against whatever
      // ground its scope resolves", and the ground changed. Caught by the sweep on the first run
      // after the move, which is what step 4c is for.
      const navLink = `nav[aria-label="Organisation"] a[href="/orgs/${orgSlug}/calendars"]`;
      expect(contrast(await computedPair(page, navLink))).toBeGreaterThanOrEqual(TEXT_MIN);

      // D2 — the same link hovered. axe never measures a hover state.
      await page.locator(navLink).hover();
      expect(contrast(await computedPair(page, navLink))).toBeGreaterThanOrEqual(TEXT_MIN);

      // D3 — the current-page state (`aria-current="page"`), likewise unmeasured by axe.
      //
      // **Two sites, and since Graphite M3 they are in the SAME scope — which is a loss recorded
      // rather than a locator updated.** ADR-0098 M4 made the wordmark the route home, carrying
      // `aria-current` on the landing, and this comment called it "the `chrome` scope's only
      // current-state left" against the rail's destination in `panel`. M3 deleted the top bar and
      // moved the wordmark into the rail, so the header still exists but is `lg:hidden` and this
      // locator resolved to a hidden element. The measurement follows the control (ADR-0097 D1a's
      // rule, which this file already applies to D1 one screen up), and both sites are now `panel`.
      //
      // **The `chrome` scope therefore has no current-state site on the screens this suite
      // visits.** Its only remaining one is the breadcrumb's final crumb (`breadcrumbs.tsx:58`),
      // which renders solely inside a plan's identity row — and driving four theme variants through
      // a project and a plan to reach one token pair is real cost for one measurement.
      // `docs/TECH_DEBT.md` #146 carries it rather than a silent gap. Both sites are still measured
      // because they are different components: a link that IS the brand and a link in a list.
      // **Each site is measured where it is actually current**, which this case did not do and got
      // away with for a reason worth keeping: TanStack's `Link` marks itself active on a PREFIX
      // match, so `/orgs/:slug` was "current" on every org route and the wordmark carried
      // `aria-current` everywhere. That is now `activeOptions={{ exact: true }}` (`brand-mark.tsx`)
      // — a real defect, since two links claiming to be the current page is two answers to "where
      // am I" — so reaching the brand's current state means going to the landing.
      //
      // Scoped by the rail's `data-tool-rail` hook. Two weaker selectors were tried first and both
      // resolved to the WRONG element rather than to nothing, which is the failure mode worth
      // naming: `nav[aria-label="Project Explorer"] a[...]` finds the drawer's tree, and the
      // accessible name alone finds two links, because the below-`lg` top bar still renders the
      // same brand behind `display: none`. A selector that resolves and measures a real pair is how
      // a green assertion ends up describing a control nobody can see.
      await page.goto(`/orgs/${orgSlug}`);
      const currentBrand = '[data-tool-rail] a[aria-current="page"]';
      await expect(page.locator(currentBrand)).toBeVisible();
      expect(contrast(await computedPair(page, currentBrand))).toBeGreaterThanOrEqual(TEXT_MIN);
      // And exactly ONE thing claims it. The prefix-match defect above is only visible as a count.
      await expect(page.locator('[data-tool-rail] a[aria-current="page"]')).toHaveCount(1);

      await page.goto(`/orgs/${orgSlug}/calendars`);
      const currentRail = 'nav[aria-label="Organisation"] a[aria-current="page"]';
      await expect(page.locator(currentRail)).toBeVisible();
      expect(contrast(await computedPair(page, currentRail))).toBeGreaterThanOrEqual(TEXT_MIN);

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
