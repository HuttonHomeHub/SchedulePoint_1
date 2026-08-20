import type { Locator, Page } from '@playwright/test';

/**
 * The **activity editor**, wherever the shell is currently hosting it.
 *
 * ADR-0099 moved it out of a modal dialog and into the trailing context drawer at `lg`+; below that
 * the dialog is still the right chrome and is still what renders (`m6-activity-context.md` T5 —
 * the modal is not a legacy path). A journey that names one of those two is asserting the **chrome**
 * when what it means is the editor, and nine suites went red at once proving it.
 *
 * Filtered by the tab list rather than by the role alone, and that is not defensive tidying: the
 * drawer is a `complementary` whether it is showing the editor or the Project Explorer, and the
 * Explorer is what it shows by default — so an unfiltered `.or()` resolves to two elements on almost
 * every screen and fails strict mode rather than failing informatively.
 *
 * Shared from `e2e-support/` for the reason `toolbar.ts` beside it is: a Playwright `testDir` is its
 * own compilation root, so the alternative is nine copies of one rule about where the editor lives.
 * What is deliberately NOT shared is anything that touches the database — the fixtures stay per
 * suite, because two serial suites mutating one tenant is how they start failing each other.
 */
export function activityEditor(page: Page): Locator {
  return page
    .getByRole('dialog')
    .or(page.getByRole('complementary'))
    .filter({ has: page.getByRole('tablist', { name: 'Activity sections' }) });
}
