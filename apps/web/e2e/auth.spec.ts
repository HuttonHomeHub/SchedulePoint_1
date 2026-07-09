import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The walking-skeleton journey: an unauthenticated visitor is guarded to
 * sign-in, can create an account, lands on the app shell, and can sign out.
 * Includes an automated accessibility check on the sign-in screen.
 *
 * Requires the API (with a database) running and reachable via the dev proxy.
 */
test.describe('Authentication journey', () => {
  test('guards unauthenticated visits to sign-in (accessible)', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('a new user can sign up, onboard an organisation, and sign out', async ({ page }) => {
    // Unique per run: the API + database persist across e2e runs.
    const stamp = Date.now();
    const email = `e2e-${stamp}@example.com`;
    const orgName = `E2E Builders ${stamp}`;
    const orgSlug = `e2e-builders-${stamp}`;

    await page.goto('/sign-up');
    await page.getByLabel('Full name').fill('E2E Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: /create account/i }).click();

    // With no organisations yet, onboarding is shown.
    await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
    await page.getByLabel('Organisation name').fill(orgName);
    await page.getByRole('button', { name: /create organisation/i }).click();

    // Lands in the new organisation, which is now the active org in the switcher.
    await expect(page).toHaveURL(new RegExp(`/orgs/${orgSlug}`));
    await expect(page.getByRole('heading', { name: orgName })).toBeVisible();
    await expect(page.getByLabel('Active organisation')).toHaveValue(orgSlug);

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
