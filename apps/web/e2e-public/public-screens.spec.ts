import { expect, test } from '@playwright/test';

import {
  cardHeight,
  contentHeight,
  expectPublicLayout,
  expectTheme,
  invitePath,
  onboard,
  pinTheme,
  signOut,
  THEMES,
  URL_STATES,
  VIEWPORTS,
} from './support';

/**
 * **The public screens, measured** (ADR-0077 M6-T1).
 *
 * The precedent is `docs/TECH_DEBT.md` **#98** and it is the whole reason this file exists: a
 * specialist read the guest view's CSS, reasoned correctly from it that the page would pass WCAG
 * 1.4.10, **suggested a test to confirm it**, and the test failed on its first run —
 * `documentElement.scrollWidth` was 436 against a 320 px viewport. The gap between "this CSS should
 * reflow" and "this page reflows" is the gap this suite closes for the six routes a stranger meets.
 *
 * Nothing here drives a feature. Every assertion is a number the browser produced.
 */

test.describe('every URL-reachable public state holds its layout', () => {
  for (const theme of THEMES) {
    for (const viewport of VIEWPORTS) {
      test(`${theme} — ${viewport.name}`, async ({ page }) => {
        await pinTheme(page, theme);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        for (const state of URL_STATES) {
          const label = `${theme} ${viewport.name} ${state.path}`;
          await page.goto(state.path);
          // Wait on the heading rather than on `networkidle`: `/accept-invite?token=…` renders a
          // spinner first and resolves into one of five screens, and measuring the spinner would
          // measure a state no reader ever lands on.
          await expect(
            page.getByRole('heading', { level: 1, name: state.heading, exact: true }),
            `${label}: heading`,
          ).toBeVisible();
          await expectTheme(page, theme);
          await expectPublicLayout(page, label, { primary: state.primary, width: viewport.width });
        }
      });
    }
  }
});

test.describe('the states carrying an unbounded server-supplied string', () => {
  /**
   * 100 characters, the longest organisation name the API accepts short of its 120-char ceiling
   * (`create-organization.dto.ts:11`). This is the only place on any public screen where a string
   * somebody else chose sets the width of the largest element on the page — the invitation heading
   * is `Join {organizationName}` inside an `<h1>`.
   *
   * **The stamp is in the middle of the name, not appended, and that is the fix for a real defect
   * in this test.** It first shipped with the name as a `const`, which made the test pass exactly
   * **six** times against any one database and fail on the seventh, for a reason that looks nothing
   * like its cause: `organizations.service.ts` derives a slug from the name and retries collisions
   * with `-2`, `-3` … up to `MAX_SLUG_ATTEMPTS = 6`, so the seventh create is refused and the
   * onboarding heading simply never goes away. CI never sees it (a fresh database every run), which
   * makes it precisely the kind of trap that punishes the local-first workflow `CLAUDE.md` §19.7
   * asks for. The stamp goes at character 40 so it lands inside the **slug's** own truncation
   * window; appended, it would be cut off before the slug was derived and change nothing.
   */
  function longOrgName(stamp: number): string {
    const unique = stamp.toString(36).toUpperCase();
    const base =
      'Northgate Regeneration Framework Delivery Partnership (Phase Two Enabling Works) Limited Liability C';
    return `${base.slice(0, 40)}${unique}${base.slice(40 + unique.length)}`;
  }

  test('a 100-character organisation name wraps rather than overflowing', async ({ page }) => {
    const LONG_ORG = longOrgName(Date.now());
    expect(LONG_ORG).toHaveLength(100);
    const stamp = Date.now();
    const owner = `public-owner-${stamp}@example.com`;
    const invitee = `public-invitee-${stamp}@example.com`;

    await page.setViewportSize({ width: 1440, height: 900 });
    await onboard(page, owner, LONG_ORG);
    const orgSlug = new URL(page.url()).pathname.split('/')[2];
    expect(orgSlug, 'organisation slug from the URL').toBeTruthy();

    // Created through the API with the browser's own session cookie rather than through the members
    // dialog: this test is about a *string length* reaching an `<h1>`, and routing it through four
    // screens of UI would make an unrelated change to the invite dialog fail a layout gate.
    const created = await page.request.post(
      `http://localhost:3000/api/v1/organizations/${orgSlug}/invitations`,
      { data: { email: invitee, role: 'PLANNER' } },
    );
    expect(created.ok(), `invite create: ${created.status()}`).toBe(true);
    const body = (await created.json()) as { data: { acceptUrl: string } };
    const path = invitePath(body.data.acceptUrl);

    // State: signed in as somebody else. The org name is in the description here, not the heading,
    // but the card is the tallest of the three and 320px is where it clips if it is going to.
    for (const viewport of [VIEWPORTS[0], VIEWPORTS[5]]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'Wrong account' })).toBeVisible();
      await expectPublicLayout(page, `wrong-account ${viewport.name}`, {
        primary: 'Sign out',
        width: viewport.width,
      });
    }

    // State: signed out. `Join <100 characters>` is the heading.
    await page.context().clearCookies();
    for (const viewport of [VIEWPORTS[0], VIEWPORTS[5]]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: `Join ${LONG_ORG}` })).toBeVisible();
      await expectPublicLayout(page, `invite-signed-out ${viewport.name}`, {
        primary: 'Sign in',
        width: viewport.width,
      });
    }

    // State: signed in as the invited address — the accept screen, same heading, different action.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/sign-up');
    await page.getByLabel('Full name').fill('Invited Reader');
    await page.getByLabel('Email').fill(invitee);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible();

    for (const viewport of [VIEWPORTS[0], VIEWPORTS[5]]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: `Join ${LONG_ORG}` })).toBeVisible();
      await expectPublicLayout(page, `invite-accept ${viewport.name}`, {
        primary: 'Accept and join',
        width: viewport.width,
      });
    }
  });
});

test.describe('the throttled sign-in', () => {
  /**
   * **The only end-to-end proof available for the 429 branch.** Better Auth's limiter is
   * `enabled: options.isProduction` (`apps/api/src/common/auth/better-auth.ts:270-274`), so no test
   * server can produce a real one — which is exactly why the unhandled 429 was live in production
   * and invisible in development until ADR-0077 M1 (spec §0.1 B4). Fulfilling the response is not a
   * shortcut around a reachable state; it is the state's only route.
   *
   * `X-Retry-After` is sent and deliberately **not** asserted in the copy: `@better-fetch/fetch`
   * builds its error from body + status + statusText and discards response headers
   * (`@better-fetch/fetch/dist/index.js:733-739`), so the number is unreachable to the client and
   * the message says "in a minute" rather than inventing a figure.
   */
  test('a 429 renders the throttled message rather than a raw server string', async ({ page }) => {
    await page.route('**/api/auth/sign-in/email', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'X-Retry-After': '10' },
        body: JSON.stringify({ message: 'Too many requests. Please try again later.' }),
      }),
    );

    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('throttled@example.com');
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Too many attempts. Wait a moment and try again.');
    // The server's own sentence must not be what the reader sees — that is the defect, not the fix.
    await expect(alert).not.toContainText('Too many requests. Please try again later.');
    await expectPublicLayout(page, 'sign-in 429 @320', { primary: 'Sign in', width: 320 });
  });
});

test.describe('one fact, one place on the screen (ADR-0077 §9)', () => {
  /**
   * The product owner's report, driven in a real browser: *"I see password insufficient on signup
   * is displayed in two places."*
   *
   * It is worth a journey rather than only a unit test because the count is what a **person**
   * counts. jsdom will happily report two nodes carrying the same string as two nodes; only a
   * rendered page shows that the reader was being told the same thing twice in two different
   * weights, and only a rendered page proves the tinted box is genuinely gone rather than merely
   * unqueried by whatever selector a unit test happened to use.
   */
  test('a short sign-up password is stated exactly once', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByLabel('Full name').fill('Jo Planner');
    await page.getByLabel('Email').fill('jo@example.com');
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();

    const message = page.getByText('Password must be at least 12 characters');
    await expect(message).toHaveCount(1);
    // One problem, so no summary either: React Hook Form has already put focus on the field, which
    // is the case WCAG 4.1.3 exempts. A box saying "1 problem" would be the duplication restored.
    await expect(page.getByText(/problems — check the highlighted fields below\./)).toHaveCount(0);
    await expect(page.getByLabel('Password')).toBeFocused();
  });

  test('three empty fields earn one count, and each message still once', async ({ page }) => {
    await page.goto('/sign-up');
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();

    await expect(page.getByText('3 problems — check the highlighted fields below.')).toHaveCount(1);
    for (const sentence of [
      'Name is required',
      'Enter a valid email address',
      'Password must be at least 12 characters',
    ]) {
      await expect(page.getByText(sentence)).toHaveCount(1);
    }
  });

  /**
   * Signing out was the one deliberate action in the product that said nothing when it worked: the
   * reader pressed a menu item and arrived at a sign-in form, which is also exactly what an expired
   * session looks like. The old app flashed "You have been logged out" here.
   *
   * Driven end to end because the confirmation crosses a navigation — the action happens on one
   * screen and the message renders on another, carried by a search param. A unit test can assert
   * the param is passed; only this can assert it survives and paints.
   */
  test('signing out arrives at /sign-in with a confirmation', async ({ page }) => {
    const stamp = Date.now();
    await onboard(page, `signed-out-${stamp}@example.com`, `Signed Out ${stamp}`);
    await signOut(page);

    await expect(page.getByRole('status')).toContainText('You have been signed out.');
  });

  /**
   * **The `docs/TECH_DEBT.md` #96 M0 probe: what the sign-out leaves in the address bar.**
   *
   * `account-chip.tsx:182` navigates with `search: { signedOut: 'true' }` — a four-character
   * string. This reads the **raw** query the router actually wrote, because `searchParams.get(...)`
   * decodes and decoding hides the quoting, which is the whole subject.
   *
   * **The banner is asserted FIRST, and that ordering is the plan's, for a recorded reason.** This
   * file's `signOut()` helper shipped once with a locator that matched nothing and nobody noticed,
   * because nothing had ever called it (ADR-0077 M8). Reading a URL after a sign-out that did not
   * happen would report a passing measurement of the wrong screen; asserting the confirmation first
   * makes that failure a sign-out failure.
   *
   * Its verdict rule was committed before it ran, on its own
   * (`docs/specs/router-search-params/m0-measurement.md`): no `%22` in either probe's URL and
   * symptom (b) is withdrawn and the epic re-scoped.
   *
   * It is a test of its own rather than two assertions inside the one above, for the reason the
   * library probe established the hard way: a probe sharing a journey perturbs it.
   */
  test('#96 — the sign-out confirmation is carried as written (was: re-quoted)', async ({
    page,
  }) => {
    const stamp = Date.now();
    await onboard(page, `probe-signed-out-${stamp}@example.com`, `Probe ${stamp}`);
    await signOut(page);
    // First, and deliberately: a helper that did not sign out must fail here, not below.
    await expect(page.getByRole('status')).toContainText('You have been signed out.');

    const raw = new URL(page.url()).search;
    // eslint-disable-next-line no-console -- the probe's output IS the measurement (#96 M0-T2)
    console.log(`[#96 M0 probe] sign-out raw query: ${raw}`);

    // **Re-baselined at M4** (ADR-0106's rule: audit a re-baseline line by line, never take it with
    // `-u`). M0 measured `?signedOut=%22true%22` — twenty-one characters carried for four — and this
    // line asserted exactly that, so the codec flip could not land without coming here and saying it
    // had changed the URL. It did, and the sweep reported it with the message written for it. The
    // old value stays in the comment; a measurement is worth more with its before than without.
    expect(raw, 'the sign-out flag is no longer carried as written — #96 M4 regressed').toBe(
      '?signedOut=true',
    );
  });
});

test.describe('the card does not resize between screens', () => {
  /**
   * The product owner's one keeper from the M4 design, and the reason `md:h-[40rem]` exists.
   *
   * In the old app the card was 466px on Forgot Password and 694px on Register, so moving between
   * two screens resized the box under the reader's cursor and the form jumped. This asserts the
   * **rendered** height rather than the class, because a fixed height is easy to write and easy to
   * defeat — one `h-auto` on a child, one state whose content overflows the 40rem and pushes the
   * grid open, and the class is still there while the box moves again.
   *
   * `md` and up only. Below it the card is content-sized on purpose: a fixed height on a 320px
   * phone clips the tallest state instead, which the sweep above measures.
   */
  test('every state is exactly the same height at md and up', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const measured: { path: string; height: number }[] = [];

    for (const state of URL_STATES) {
      await page.goto(state.path);
      await expect(
        page.getByRole('heading', { level: 1, name: state.heading, exact: true }),
      ).toBeVisible();
      const height = await cardHeight(page);
      expect(height, `${state.path}: card box`).not.toBeNull();
      measured.push({ path: state.path, height: height ?? 0 });
    }

    const heights = [...new Set(measured.map((row) => Math.round(row.height)))];
    expect(
      heights,
      `card heights differ between states:\n${measured
        .map((row) => `${Math.round(row.height)}px  ${row.path}`)
        .join('\n')}`,
    ).toHaveLength(1);
    // 40rem at the default 16px root. Pinned, so a later "make it a bit taller" is a decision
    // somebody takes rather than a number that drifts.
    expect(heights[0]).toBe(640);
  });
});

test.describe('the tallest state', () => {
  /**
   * Measured, not assumed (#98's precedent of **recording the figure**). The plan guessed
   * `/verify-email` pending; this reports what the browser says at the reflow floor, and the number
   * lands in `docs/TECH_DEBT.md` rather than in somebody's memory.
   */
  test('is recorded at the 320×568 reflow floor', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const heights: { path: string; height: number; band: number }[] = [];

    for (const state of URL_STATES) {
      await page.goto(state.path);
      await expect(
        page.getByRole('heading', { level: 1, name: state.heading, exact: true }),
      ).toBeVisible();
      const band = (await page.locator('aside').boundingBox())?.height ?? 0;
      heights.push({ path: state.path, height: await contentHeight(page), band });
    }

    heights.sort((a, b) => b.height - a.height);
    const table = heights
      .map((row) => `${row.height}px page / ${Math.round(row.band)}px band  ${row.path}`)
      .join('\n');
    testInfo.annotations.push({ type: 'tallest-state', description: table });
    // eslint-disable-next-line no-console -- the measurement IS the deliverable of this test.
    console.log(`\nRendered height at 320×568, tallest first:\n${table}\n`);

    // No upper bound is asserted. A cap would be a number nobody derived, and the invariant that
    // matters — the page scrolls to its primary action rather than clipping it — is already
    // asserted for every state by `expectPublicLayout`.
    expect(heights[0]!.height).toBeGreaterThan(0);
  });
});

/**
 * **What this suite does not cover, said out loud.**
 *
 * - **Contrast.** The computed token matrix (`styles/token-contrast.test.ts`) owns every ratio
 *   across 3 themes × 4 scopes × 2 flag states. A browser suite sampling a few pixels would be a
 *   weaker second opinion pretending to be a stronger one.
 * - **Firefox and WebKit.** Chromium-first (`CLAUDE.md` §17, TECH_DEBT #25a), like all 26 siblings.
 * - **Real mail.** No message is sent or read here; `e2e-account` owns the SMTP round trip.
 * - **Ten of the thirty-three landable states are driven by URL; three more by a real invitation
 *   against a real API; one is synthesised by fulfilling a 429.** The remaining nineteen are
 *   *outcome* states behind a successful mutation ("Check your email", "Password changed", the
 *   pending and error branches of each form) and are asserted in each route's own unit suite, where
 *   the mutation is already mocked and every branch is reachable. What is measured **here** is
 *   geometry, and geometry belongs to the shell those nineteen share: the same `AuthShell`, the
 *   same card, the same panel. The distinction matters because "33 states verified in a browser"
 *   would be false, and this file is the only place the reader can find out.
 */
