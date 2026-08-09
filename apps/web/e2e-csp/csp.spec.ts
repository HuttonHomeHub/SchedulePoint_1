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
      headers: {
        ...headers,
        'content-security-policy-report-only': policy,
        // **Both headers, because the policy is inert without the second one.** `report-to csp`
        // names a group that `Reporting-Endpoints` defines, and a modern engine that understands
        // `report-to` IGNORES `report-uri` — so a policy carrying both directives with no
        // `Reporting-Endpoints` header reports NOTHING AT ALL, silently. Observed here: the
        // violation fired and no request left the browser.
        //
        // That is a real deployment hazard rather than a test detail: `nginx.conf` emits both, but
        // if `CSP_REPORTING_ENDPOINTS` were ever blank while the policy kept `report-to`, reporting
        // would die without a single error anywhere. This is the only place that fact is pinned.
        'reporting-endpoints': 'csp="/api/v1/csp-report"',
      },
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
  await expect(page.getByRole('button', { name: /create an account/i })).toBeVisible();
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
  await page.getByRole('button', { name: /create an account/i }).click();

  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();
  expectClean(await violations(page), 'onboarding');

  await page.getByLabel('Organisation name').fill(`CSP Co ${Date.now()}`);
  await page.getByRole('button', { name: /create organisation/i }).click();
  await expect(page).toHaveURL(/\/orgs\//);
  expectClean(await violations(page), 'the organisation home');
});

/**
 * **What could and could not be established about the report directives.**
 *
 * Two claims went into the policy as reasoned defaults when `report-uri` / `report-to` /
 * `Reporting-Endpoints` were added: that Chromium accepts a **relative** reporting URL, and which
 * **wire format** it sends. Both are claims about software we do not own — the ADR-0076 Class 2
 * shape — and this test was written to settle them by breaking the policy on purpose and catching
 * the POST.
 *
 * **It settles one of them and cannot settle the other, and saying which is the point.**
 *
 * What it proves: a real violation of the deployed policy fires, with the report directives present
 * and parsed — so the directives do not break the policy, which is the failure that would take the
 * whole header down.
 *
 * What it **cannot** prove: that the report is delivered. The Reporting API uploads out-of-band
 * from the browser process rather than through the renderer's network stack, and it batches with a
 * delay — so Playwright's `page.route`, which intercepts renderer requests, structurally cannot see
 * it. Observed here across two attempts: the violation fires every time and no request is ever
 * interceptable. That is a limitation of the harness, **not evidence that delivery fails**, and the
 * difference matters — asserting delivery here would produce a permanently red gate that gets
 * deleted rather than fixed (ADR-0058).
 *
 * **A real finding came out of the attempt, and it is a deployment hazard.** A policy carrying
 * `report-to` with **no** `Reporting-Endpoints` header reports **nothing at all** — a modern engine
 * honours `report-to` and ignores `report-uri` once both are present, so the deprecated fallback
 * does not save you. `nginx.conf` emits both, but if `CSP_REPORTING_ENDPOINTS` were ever blank while
 * the policy kept `report-to`, reporting would die silently with no error anywhere. Hence both
 * headers below, and hence the structural test that pins them together.
 *
 * The residual — end-to-end delivery from a real browser to the real sink — is `docs/TECH_DEBT.md`
 * #102. It needs a real origin serving both the app and the API, which is the deployed stack.
 */
test('the report directives do not break the policy, and a violation still fires', async ({
  page,
}) => {
  await armCspRecording(page);

  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');

  // A 1×1 transparent GIF as a `data:` URI — refused by `img-src 'self' blob:`. Chosen because
  // `data:` is deliberately absent from that directive (ADR-0074), so this is a violation the
  // product's own rules define rather than one invented for a test.
  await page.evaluate(async () => {
    const img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    document.body.appendChild(img);
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  const seen = await violations(page);
  expect(
    seen.some((v) => v.directive.startsWith('img-src')),
    `expected an img-src violation under the deployed policy, saw:\n${JSON.stringify(seen, null, 2)}`,
  ).toBe(true);
});
