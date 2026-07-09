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

  test('a new user can sign up, reach the app shell, and sign out', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;

    await page.goto('/sign-up');
    await page.getByLabel('Full name').fill('E2E Tester');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await expect(page.getByText('No organisations yet')).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
