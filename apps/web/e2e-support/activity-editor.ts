import type { Locator, Page } from '@playwright/test';

/**
 * The **activity editor**, which is a modal dialog (ADR-0101).
 *
 * It was one before Graphite M6, the drawer for one release, and a dialog again once the widths
 * were put beside each other: ADR-0061 sized this form at `xl` (896 px) with a section rail
 * *because 448 px was already unusable*, and the drawer caps at 420 px. This helper survived both
 * moves unchanged, which is the argument for having it — a journey that names the chrome is
 * asserting the chrome when what it means is the editor, and nine suites went red at once proving
 * that the first time.
 *
 * Still filtered by the tab list rather than trusting the role alone. That is not defensive
 * tidying: `dialog` is a role several things in this product take, and the filter names the one
 * fact that has been true of the editor in every chrome it has ever had — it is the thing with the
 * activity's own sections in it.
 *
 * Shared from `e2e-support/` for the reason `toolbar.ts` beside it is: a Playwright `testDir` is its
 * own compilation root, so the alternative is nine copies of one rule about where the editor lives.
 * What is deliberately NOT shared is anything that touches the database — the fixtures stay per
 * suite, because two serial suites mutating one tenant is how they start failing each other.
 */
export function activityEditor(page: Page): Locator {
  return page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tablist', { name: 'Activity sections' }) });
}
