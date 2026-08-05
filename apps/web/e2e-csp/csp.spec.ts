import { expect, test, type Page } from '@playwright/test';

import { deployedCspPolicy } from './csp-policy';

/**
 * The Content-Security-Policy gate (ADR-0074 M1).
 *
 * **Why this exists.** The policy was *derived* by reading `apps/web/src` for what the app loads,
 * and *validated* by a person walking routes with the browser console open. Neither method sees
 * what a **dependency** does at runtime, and neither is repeatable. It found a real violation on
 * the deployed origin — Zod probing for `eval` — which is exactly the class the derivation could
 * not have predicted, because it is not in our source at all.
 *
 * Every other invariant in this repository has a computed gate (ADR-0058). This one had vigilance.
 * So: serve the **real deployed policy** (parsed from `docker-compose.yml`, never restated), walk
 * the built app, and fail on any violation.
 *
 * **Verified to fail on the real defect.** Removing the `@/config/zod-jitless` import from
 * `main.tsx` turns both tests red with `{"directive":"script-src","blockedURI":"eval"}` — the exact
 * shape the product owner read out of the deployed console. A gate that has never been seen red is
 * an assertion about itself.
 *
 * **Report-only, deliberately**, matching the shipped default. Under enforce a violation breaks the
 * page and the failure arrives as some confusing downstream assertion; report-only lets the app run
 * and reports the violation intact, so the diagnostic names the directive and the blocked URI.
 *
 * **What it does not cover.** Only the routes walked below, and only what those routes load. The
 * canvas image export and the printed programme — the two surfaces `img-src blob:` exists for — are
 * reached by their own journeys, not here; `upgrade-insecure-requests` is ignored under report-only
 * by specification, so that one directive stays untested until the enforce flip (TECH_DEBT #8).
 * Saying so is the point: a gate that overstates its coverage is worse than none.
 */
const PASSWORD = 'correct-horse-battery';

interface Violation {
  readonly directive: string;
  readonly blockedURI: string;
  readonly sourceFile: string;
}

declare global {
  interface Window {
    __cspViolations?: Violation[];
  }
}

/**
 * Serve the deployed policy on every document response, and record what it reports.
 *
 * The dev server does not send the header — nginx does, and nginx is only in the production image —
 * so the gate applies it here. The listener is registered by `addInitScript`, which runs before any
 * page script, because a violation raised during the very first module evaluation (which is what
 * Zod's probe was) would otherwise happen before anything could hear it.
 */
async function armCspRecording(page: Page): Promise<void> {
  const policy = deployedCspPolicy();

  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    if (!(headers['content-type'] ?? '').includes('text/html')) {
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({
      response,
      headers: { ...headers, 'content-security-policy-report-only': policy },
    });
  });

  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations?.push({
        directive: event.effectiveDirective,
        blockedURI: event.blockedURI,
        sourceFile: event.sourceFile,
      });
    });
  });
}

async function violations(page: Page): Promise<Violation[]> {
  return (await page.evaluate(() => window.__cspViolations ?? [])) satisfies Violation[];
}

/** Fails with the directive and source file, not just a count — a bare number is undiagnosable. */
function expectClean(found: Violation[], where: string): void {
  expect(found, `CSP violations on ${where}:\n${JSON.stringify(found, null, 2)}`).toEqual([]);
}

test('the signed-out surfaces raise no CSP violation', async ({ page }) => {
  await armCspRecording(page);

  // Sign-in first: it is where the Zod probe fired, because it is the first screen whose form
  // evaluates a schema. That makes it the regression case for the fix, not just one route of many.
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  expectClean(await violations(page), '/sign-in');

  await page.goto('/sign-up');
  await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  expectClean(await violations(page), '/sign-up');

  await page.goto('/forgot-password');
  await expect(page.getByRole('button', { name: 'Send a reset link' })).toBeVisible();
  expectClean(await violations(page), '/forgot-password');
});

test('the authenticated shell raises no CSP violation', async ({ page }) => {
  await armCspRecording(page);
  const email = `csp-${Date.now()}@example.com`;

  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill('CSP Subject');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  expectClean(await violations(page), 'onboarding');

  await page.getByLabel('Organisation name').fill(`CSP Co ${Date.now()}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(/\/orgs\//);
  expectClean(await violations(page), 'the organisation home');
});
