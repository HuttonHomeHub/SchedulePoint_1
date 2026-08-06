import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { firstUrlIn, SmtpSink } from './smtp-sink';

/**
 * Flag-ON **account recovery** journey (`VITE_ACCOUNT_SETTINGS` + `VITE_PASSWORD_RESET`,
 * ADR-0074 M5-T3).
 *
 * Everything here needs a real API, a real database **and a real mail transport**, because the
 * claims are about things no mocked fetch can be wrong about:
 *
 * 1. **The reset link only exists in the mailbox.** The invitation flow returns its accept URL in
 *    the create response, so a journey can read it off the screen. A reset token goes to email and
 *    nowhere else, and since M0 the verification row stores the identifier **hashed**, so it is not
 *    recoverable from the database either — B1 working as designed. Receiving the mail is the only
 *    way to test the flow at all, which is why this suite stands up an SMTP sink.
 * 2. **B2 — a completed reset kills the other sessions.** The whole point of a reset is that
 *    whoever else knew the password no longer has access. That is a server-side session revocation
 *    observed from a *second browser context*; a unit test has one fetch mock and no sessions.
 * 3. **Change-password revokes the others too**, from `/account`, on a live session.
 * 4. **The mail transport works.** `SmtpMailService` is selected only when `MAIL_SMTP_URL` is set,
 *    which no other test does — so a defect in the real adapter, including one swallowed by its
 *    deliberate catch, would otherwise ship unseen.
 *
 * The verification half (sign-up with `AUTH_REQUIRE_EMAIL_VERIFICATION` on → `/verify-email` →
 * resend → verify → sign in, and the invitation-accept refusal) lives in the sibling test below,
 * which runs against a **second API** with the env var on. That is the only place those three
 * latent dead ends are reachable: they are runtime branches on a server switch, so a bundle alone
 * cannot produce them.
 *
 * Chromium only (TECH_DEBT #25a), serial (accounts and sessions are mutated throughout).
 */

const PASSWORD = 'correct-horse-battery';
const NEW_PASSWORD = 'a-completely-different-one';

/** The sink is per-file: the config points `MAIL_SMTP_URL` at this port. */
const SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? 3025);
const sink = new SmtpSink();

test.beforeAll(async () => {
  await sink.start(SMTP_PORT);
});

test.afterAll(async () => {
  await sink.stop();
});

async function signUp(page: Page, email: string, name: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create an account/i }).click();
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('a locked-out member recovers their account, and the old session dies', async ({
  browser,
}) => {
  const stamp = Date.now();
  const email = `reset-${stamp}@example.com`;
  sink.clear();

  // ---------------------------------------------------------------- an account, and two sessions
  const ownContext = await browser.newContext();
  const own = await ownContext.newPage();
  await signUp(own, email, 'Reset Subject');
  await expect(own.getByRole('heading', { name: /create your organisation/i })).toBeVisible();

  // A second, separate session for the same account — this is the one B2 has to kill. It has to be
  // a real browser context with its own cookie jar, or it is not a session at all.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signIn(other, email, PASSWORD);
  await expect(other.getByRole('heading', { name: /create your organisation/i })).toBeVisible();

  // ---------------------------------------------------------------- ask for a link, from signed out
  const strangerContext = await browser.newContext();
  const stranger = await strangerContext.newPage();

  await stranger.goto('/sign-in');
  // The link and the routes are gated on ONE constant; if that ever splits, this click 404s.
  await stranger.getByRole('link', { name: /forgot your password/i }).click();
  await expect(stranger).toHaveURL(/\/forgot-password/);

  await new AxeBuilder({ page: stranger })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
    .then((r) => expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([]));

  await stranger.getByLabel('Email', { exact: true }).fill(email);
  await stranger.getByRole('button', { name: 'Send a reset link' }).click();
  await expect(stranger.getByText(/if that address has an account/i)).toBeVisible();

  // ---------------------------------------------------------------- the unknown address is identical
  const unknownStamp = `nobody-${stamp}@example.com`;
  await stranger.goto('/forgot-password');
  await stranger.getByLabel('Email', { exact: true }).fill(unknownStamp);
  await stranger.getByRole('button', { name: 'Send a reset link' }).click();
  // Byte-for-byte the same sentence. Anything else here is the enumeration oracle back.
  await expect(stranger.getByText(/if that address has an account/i)).toBeVisible();

  // ---------------------------------------------------------------- follow the real link
  const mail = await sink.waitFor(email, /\/reset-password\//);
  const resetUrl = firstUrlIn(mail.body);
  expect(resetUrl).toContain('/api/auth/reset-password/');
  // Nothing was sent to the address that has no account.
  expect(sink.all().some((m) => m.to.includes(unknownStamp))).toBe(false);

  await stranger.goto(resetUrl);
  await expect(stranger.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  // The token is stripped on arrival: it must not be sitting in the address bar (and so in
  // history, and in the referrer of anything this page later loads).
  await expect(stranger).toHaveURL(/\/reset-password(\?.*)?$/);
  expect(new URL(stranger.url()).searchParams.get('token')).toBeNull();

  await new AxeBuilder({ page: stranger })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
    .then((r) => expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([]));

  await stranger.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await stranger.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await stranger.getByRole('button', { name: 'Set new password' }).click();
  // The **announced** region has to carry the outcome, not only its consequence (ADR-0077 M6-T2):
  // focus moves in here, and a screen reader reads the focused element rather than the `<h1>`
  // beside it. This assertion used to pass on the heading's wording appearing anywhere on the page.
  await expect(stranger.getByRole('status')).toContainText(
    'Your password has been changed, and every other session has been signed out.',
  );

  // Success ends at a link, not inside the app — the reset issues no session.
  await expect(stranger.getByRole('link', { name: 'Sign in' })).toBeVisible();

  // ---------------------------------------------------------------- B2: the other session is dead
  await other.goto('/');
  await expect(other).toHaveURL(/\/sign-in/);
  await expect(other.getByRole('button', { name: 'Sign in' })).toBeVisible();

  // ---------------------------------------------------------------- and the new password works
  await signIn(stranger, email, NEW_PASSWORD);
  await expect(stranger.getByRole('heading', { name: /create your organisation/i })).toBeVisible();

  // The old one does not.
  const staleContext = await browser.newContext();
  const stale = await staleContext.newPage();
  await signIn(stale, email, PASSWORD);
  await expect(stale.getByRole('alert')).toBeVisible();
  await expect(stale).toHaveURL(/\/sign-in/);

  // ---------------------------------------------------------------- a spent link says so
  await stranger.goto(resetUrl);
  await expect(
    stranger.getByRole('heading', { name: 'That link is no longer valid' }),
  ).toBeVisible();
  await expect(stranger.getByRole('link', { name: 'Send a new link' })).toBeVisible();

  await ownContext.close();
  await otherContext.close();
  await strangerContext.close();
  await staleContext.close();
});

test('a signed-in member changes their password from /account', async ({ browser }) => {
  const stamp = Date.now();
  const email = `account-${stamp}@example.com`;
  sink.clear();

  const firstContext = await browser.newContext();
  const first = await firstContext.newPage();
  await signUp(first, email, 'Account Subject');
  await expect(first.getByRole('heading', { name: /create your organisation/i })).toBeVisible();

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await signIn(second, email, PASSWORD);
  await expect(second.getByRole('heading', { name: /create your organisation/i })).toBeVisible();

  // Reached the way a person reaches it — through the account menu, not a typed URL.
  await first.getByRole('button', { name: /Account:/ }).click();
  await first.getByRole('menuitem', { name: 'Your account' }).click();
  await expect(first).toHaveURL(/\/account/);
  await expect(first.getByRole('heading', { name: 'Your account' })).toBeVisible();

  await new AxeBuilder({ page: first })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
    .then((r) => expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([]));

  // The consequence is stated before the submit, not after it.
  await expect(first.getByText(/signs you out everywhere else/i)).toBeVisible();

  // A wrong current password lands on that field, not in a banner above three inputs.
  await first.getByLabel('Current password').fill('not-the-right-one');
  await first.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await first.getByLabel('Confirm new password').fill(NEW_PASSWORD);
  await first.getByRole('button', { name: 'Change password' }).click();
  await expect(first.getByLabel('Current password')).toHaveAttribute('aria-invalid', 'true');

  await first.getByLabel('Current password').fill(PASSWORD);
  await first.getByRole('button', { name: 'Change password' }).click();
  await expect(first.getByRole('status')).toContainText('Password changed');

  // The other session is gone; this one survives.
  await second.goto('/');
  await expect(second).toHaveURL(/\/sign-in/);
  await first.goto('/');
  await expect(first.getByRole('heading', { name: /create your organisation/i })).toBeVisible();

  await firstContext.close();
  await secondContext.close();
});
