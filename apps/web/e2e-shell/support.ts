import { expect, type Page } from '@playwright/test';

/**
 * Journey helpers for the **app shell** suite (`docs/TECH_DEBT.md` #165a).
 *
 * The onboarding helper deliberately STOPS on `/onboarding` rather than walking through it, which
 * is the opposite of every other suite's `onboard()` (`e2e-overview/support.ts:9`,
 * `e2e-gantt/support.ts`). Those treat the screen as a turnstile; here it is the subject — it is
 * the one moment in an account's life when the reader has no organisation at all, and it cannot be
 * reached by pointing a test at an existing tenant.
 */

const PASSWORD = 'correct-horse-battery';

/** Sign up and stop on `/onboarding`, with no organisation created. */
export async function signUpAndStop(page: Page, stamp: number): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('Ada Shell');
  await page.getByLabel('Email').fill(`shell-${stamp}@example.com`);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create an account/i }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
}

/** Create the organisation the sign-up left pending, and land in it. */
export async function createOrganisation(page: Page, stamp: number): Promise<string> {
  const slug = `shell-co-${stamp}`;
  await page.getByLabel('Organisation name').fill(`Shell Co ${stamp}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(new RegExp(`/orgs/${slug}`));
  return slug;
}

/** Open one of the account menu's own destinations. */
export async function openFromAccountMenu(
  page: Page,
  item: 'Your account' | 'My activity',
): Promise<void> {
  await page.getByRole('button', { name: /^Account:/ }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/**
 * **What "the shell offers no organisation navigation" means, asserted rather than described.**
 *
 * Three checks, because each fails on its own and two of them are enumerations that a future
 * control would walk straight past:
 *
 * 1. **No link into an organisation.** Derived from whatever the shell actually renders, so a
 *    seventh destination or a new shortcut added later is covered without anyone remembering to
 *    extend this. This is the check that carries the class.
 * 2. **No Project Explorer trigger**, which is not a link and therefore invisible to (1). It is the
 *    specific control #165a is about.
 * 3. **No Project Explorer panel**, because the trigger and the panel are separately rendered — the
 *    drawer opens from a persisted preference, not only from the button, so withholding one and not
 *    the other is a live possibility rather than a hypothetical.
 */
export async function expectNoOrganisationNavigation(page: Page): Promise<void> {
  await expect(page.locator('a[href*="/orgs/"]')).toHaveCount(0);
  // Neither the column nor either of its two controls. Asserted as three rather than one, because
  // M3-T1 split what used to be one rail button into a fold and a spine, and a rule that withheld
  // the panel while leaving a control that promises it is the dead end #165a is about.
  await expect(page.getByRole('navigation', { name: 'Project Explorer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hide Project Explorer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show Project Explorer' })).toHaveCount(0);
}
