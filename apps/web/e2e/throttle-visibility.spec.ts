import type { Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

/**
 * The guard proves itself against the defect it names (ADR-0110, ADR-0175): a journey that meets an
 * API 429 fails, by name, even though nothing else in it is wrong.
 *
 * The 429 is synthesised by fulfilling the route, because the real limiter needs 100 requests to one
 * handler inside a minute. The request is an in-page `fetch` rather than a navigation so exactly one
 * response is refused and the count in the message is not at the mercy of the app's own retries.
 *
 * **How a failure is asserted.** The fixture throws at teardown, after the body has returned, so the
 * body cannot see its own failure. The `test.fail()` twins therefore pass only if the teardown
 * throws, and go red if it does not — which is the "fixture removed, journey red" evidence ADR-0110
 * asks for, produced every run rather than once by hand. The message text is asserted separately, in
 * tests that opt out so the throw does not pre-empt the assertion.
 */

const REFUSED = {
  status: 429,
  contentType: 'application/json',
  body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
};

async function fetchMe(page: Page): Promise<number> {
  return page.evaluate(async () => (await fetch('/api/v1/me')).status);
}

test.describe('A 429 in a journey fails by name', () => {
  test.describe('when it was not provoked', () => {
    test.fail();

    test('the page context', async ({ page }) => {
      await page.goto('/sign-in');
      await page.route('**/api/v1/me', (route) => route.fulfill(REFUSED));
      expect(await fetchMe(page)).toBe(429);
    });

    test('a second context opened with browser.newContext()', async ({ browser }) => {
      const other = await browser.newContext();
      const page = await other.newPage();
      await page.goto('/sign-in');
      await page.route('**/api/v1/me', (route) => route.fulfill(REFUSED));
      expect(await fetchMe(page)).toBe(429);
      await other.close();
    });
  });

  test.describe('the message and the opt-out', () => {
    test.use({ allowRateLimited: true });

    test('names the throttler, the method, the path and the count', async ({
      page,
      rateLimits,
    }) => {
      await page.goto('/sign-in');
      await page.route('**/api/v1/me', (route) => route.fulfill(REFUSED));
      expect(await fetchMe(page)).toBe(429);
      expect(await fetchMe(page)).toBe(429);

      await expect.poll(async () => (await rateLimits.hits()).length).toBe(2);
      const failure = await rateLimits.failure();
      expect(failure?.message).toContain('429 RATE_LIMITED');
      expect(failure?.message).toContain('ThrottlerGuard');
      expect(failure?.message).toContain('GET /api/v1/me');
      expect(failure?.message).toContain('GET /api/v1/me x2');
    });

    test('a second context is watched', async ({ browser, rateLimits }) => {
      const other = await browser.newContext();
      const page = await other.newPage();
      await page.goto('/sign-in');
      await page.route('**/api/v1/me', (route) => route.fulfill(REFUSED));
      expect(await fetchMe(page)).toBe(429);
      await expect.poll(async () => (await rateLimits.hits()).length).toBe(1);
      await other.close();
    });

    test('opting out does not fail the test', async ({ page, rateLimits }) => {
      await page.goto('/sign-in');
      await page.route('**/api/v1/me', (route) => route.fulfill(REFUSED));
      expect(await fetchMe(page)).toBe(429);
      await expect.poll(async () => (await rateLimits.hits()).length).toBe(1);
    });
  });

  test('a test that met no 429 has nothing to report', async ({ page, rateLimits }) => {
    await page.goto('/sign-in');
    expect(await fetchMe(page)).toBe(401);
    expect(await rateLimits.hits()).toEqual([]);
    expect(await rateLimits.failure()).toBeUndefined();
  });
});
