import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createOrganisation,
  expectNoOrganisationNavigation,
  openFromAccountMenu,
  signUpAndStop,
} from './support';

/**
 * **The shell offers no organisation navigation on the routes that have no organisation**
 * (`docs/TECH_DEBT.md` #165a).
 *
 * Three of the thirteen authenticated routes are not organisation-scoped — `/onboarding`,
 * `/account` and `/me/activity` — and the shell rendered the Project Explorer on all three,
 * ~298 px of drawer at 1646 saying "Select an organisation to browse." On `/onboarding` that sat
 * beside a card asking the reader to create their first organisation: there is nothing to select,
 * by definition, on the first screen a new member ever sees.
 *
 * **What only a browser can see here, and it is not a subtlety.** `app-shell.test.tsx` mocks
 * `useParams: () => ({})`, so the entire pre-existing shell suite ran in the org-less state and its
 * first assertion was that the Project Explorer navigation IS present. The suite that would have
 * caught this pinned it as correct behaviour. A journey takes the param from the router, which is
 * the only place the distinction between "this route has no organisation" and "this test supplied
 * no params" exists at all.
 *
 * The account is built up across the file, so serial. Chromium only (TECH_DEBT #25a).
 */
test.describe.configure({ mode: 'serial' });

test('the shell withholds the Project Explorer on the three routes that have no organisation', async ({
  page,
}) => {
  const stamp = Date.now();

  // ---------------------------------------------- 1. /onboarding — the reader has NO organisation
  await signUpAndStop(page, stamp);
  await expect(page).toHaveURL(/\/onboarding/);
  await expectNoOrganisationNavigation(page);
  // The screen's own content is untouched: this is a removal from the shell, not from the route.
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  // **The route out is still offered.** Withholding navigation that cannot navigate must not also
  // withhold the navigation that can — the account menu is how a reader with no organisation
  // reaches their own two screens, and it is the only way off this one.
  await expect(page.getByRole('button', { name: /^Account:/ })).toBeVisible();

  // ---------------------------------------- 2 & 3. /account and /me/activity, still with no org
  await openFromAccountMenu(page, 'Your account');
  await expect(page).toHaveURL(/\/account/);
  await expectNoOrganisationNavigation(page);
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();

  await openFromAccountMenu(page, 'My activity');
  await expect(page).toHaveURL(/\/me\/activity/);
  await expectNoOrganisationNavigation(page);
  await expect(page.getByRole('heading', { name: 'My activity' })).toBeVisible();
});

test('an organisation-scoped route still gets the whole navigator', async ({ page }) => {
  const stamp = Date.now();
  await signUpAndStop(page, stamp);
  const slug = await createOrganisation(page, stamp);

  // The positive case is asserted for the reason ADR-0093's duplication gate needed its second
  // assertion: a suite that only proves the absence passes equally well against a shell that
  // withholds the Explorer everywhere, and could not then tell "the defect is fixed" from "the
  // capability is gone".
  await expect(page.getByRole('button', { name: 'Project Explorer' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Project Explorer' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Organisation' }).getByRole('link', { name: 'Clients' }),
  ).toBeVisible();

  // ------------------------------------- The route is the discriminator, not the reader's account
  // This reader now HAS an organisation, and `/account` is still not scoped to one. The Explorer
  // stays withheld — and the switcher, which is the reader's actual route back, stays.
  await openFromAccountMenu(page, 'Your account');
  await expectNoOrganisationNavigation(page);
  await expect(page.getByLabel('Active organisation')).toBeVisible();
});

/**
 * **The persisted drawer preference must survive a trip through an org-less screen.**
 *
 * `useResizablePanelPrefs` stores `collapsed` in `localStorage`, and the shell's own close paths
 * write it (`app-shell.tsx` `selectSubject` / `closeDrawerPanel`). A fix that suppressed the
 * Explorer by COLLAPSING the drawer rather than by not rendering it would pass every assertion
 * above and quietly rewrite a reader's preference every time they opened their account settings —
 * the panel would then be shut when they came back to their plan, with nothing on screen saying
 * why. Both directions are asserted, because a rule that only preserves "open" is satisfied by a
 * shell that never closes anything.
 */
test('a trip through an org-less screen leaves the drawer preference alone, either way', async ({
  page,
}) => {
  const stamp = Date.now();
  await signUpAndStop(page, stamp);
  await createOrganisation(page, stamp);

  const explorer = page.getByRole('button', { name: 'Project Explorer' });
  const panel = page.getByRole('navigation', { name: 'Project Explorer' });

  // --- open stays open
  await expect(panel).toBeVisible();
  await openFromAccountMenu(page, 'Your account');
  await page.goBack();
  await expect(panel).toBeVisible();

  // --- closed stays closed
  await explorer.click();
  await expect(panel).toHaveCount(0);
  await openFromAccountMenu(page, 'Your account');
  await page.goBack();
  await expect(explorer).toBeVisible();
  await expect(panel).toHaveCount(0);
});

/**
 * The three screens keep a clean accessibility tree with the shell's navigation gone. Worth its own
 * pass rather than folding into the first test: removing a landmark is exactly the kind of change
 * that leaves a dangling `aria-labelledby` or an empty `nav`, and neither is visible to a locator.
 */
test('the org-less screens have no accessibility violations', async ({ page }) => {
  const stamp = Date.now();
  await signUpAndStop(page, stamp);

  for (const [name, open] of [
    ['/onboarding', async () => {}],
    ['/account', async () => openFromAccountMenu(page, 'Your account')],
    ['/me/activity', async () => openFromAccountMenu(page, 'My activity')],
  ] as const) {
    await open();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations, `${name}: ${JSON.stringify(results.violations, null, 2)}`).toEqual(
      [],
    );
  }
});
