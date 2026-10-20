import AxeBuilder from '@axe-core/playwright';
import { type Page } from '@playwright/test';

import { expect, test } from '../e2e-support/test';

import { firstUrlIn, SmtpSink } from './smtp-sink';

/**
 * Flag-ON journey for the three latent dead ends, **with the server switch actually on**
 * (`AUTH_REQUIRE_EMAIL_VERIFICATION=true`, ADR-0074 M2 + M5-T3).
 *
 * **This is the only place these three are reachable, and that is the whole argument for the
 * suite.** Each is a runtime branch on what the server did — a sign-up that returns no session, a
 * sign-in that answers 403 with a code, an invitation the server refuses — so a bundle alone cannot
 * produce any of them and no unit suite can be sure it guessed the response shape right. They were
 * fixed unflagged for exactly this reason: a `VITE_` constant is baked in long before an operator
 * sets the env var.
 *
 * It runs against its **own API process** with the switch on and its own web dev server pointed at
 * it (see `playwright.account-verify.config.ts`), because the sibling suite's whole point is the
 * switch being off.
 *
 * Chromium only (TECH_DEBT #25a), serial.
 */

const PASSWORD = 'correct-horse-battery';

const SMTP_PORT = Number(process.env.E2E_SMTP_PORT ?? 3026);
const API_PORT = process.env.E2E_VERIFY_API_PORT ?? '3001';
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

/**
 * Open the emailed link and press Confirm (TECH_DEBT #88): the link opens a page, and only the
 * press verifies. Returns on the "confirmed" screen, where the way on is a Sign in link.
 */
async function followAndConfirm(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole('heading', { name: 'Confirm your email address' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm my email address' }).click();
  await expect(page.getByRole('heading', { name: 'Email address confirmed' })).toBeVisible();
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze()
    .then((r) => expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([]));
}

async function expectSignInRefused(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Confirm your email address first')).toBeVisible();
}

test('sign-up with verification enforced explains itself instead of bouncing', async ({
  browser,
}) => {
  const stamp = Date.now();
  const email = `verify-${stamp}@example.com`;
  sink.clear();

  const context = await browser.newContext();
  const page = await context.newPage();

  await signUp(page, email, 'Verify Subject');

  // The defect this replaces: the old client saw no `error`, reported success, pushed `/`, and the
  // `_authed` guard bounced the brand-new member to `/sign-in` with nothing said about why.
  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  // The address rides along so the resend does not have to ask for it again.
  expect(new URL(page.url()).searchParams.get('email')).toBe(email);

  await expectNoAxeViolations(page);

  // ---------------------------------------------------------------- sign-in explains, with a way out
  const signInContext = await browser.newContext();
  const signInPage = await signInContext.newPage();
  await signInPage.goto('/sign-in');
  await signInPage.getByLabel('Email', { exact: true }).fill(email);
  await signInPage.getByLabel('Password').fill(PASSWORD);
  await signInPage.getByRole('button', { name: 'Sign in' }).click();

  await expect(signInPage.getByText('Confirm your email address first')).toBeVisible();
  const resend = signInPage.getByRole('button', { name: /send another verification email/i });
  await expect(resend).toBeVisible();

  sink.clear();
  await resend.click();
  await expect(signInPage.getByText(/an email is on its way/i)).toBeVisible();

  // ---------------------------------------------------------------- follow the link, then sign in
  const mail = await sink.waitFor(email, /\/verify-email#/);
  await followAndConfirm(signInPage, firstUrlIn(mail.body));

  await signInPage.getByRole('link', { name: 'Sign in' }).click();
  await signInPage.getByLabel('Email', { exact: true }).fill(email);
  await signInPage.getByLabel('Password').fill(PASSWORD);
  await signInPage.getByRole('button', { name: 'Sign in' }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(signInPage.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });

  await context.close();
  await signInContext.close();
});

test('an unverified invitee is told what to do, not handed an Accept that will fail', async ({
  browser,
}) => {
  const stamp = Date.now();
  const adminEmail = `inviter-${stamp}@example.com`;
  const inviteeEmail = `invitee-${stamp}@example.com`;
  const orgName = `Verify Co ${stamp}`;
  sink.clear();

  // The inviter has to be verified first, or they cannot get far enough to invite anybody.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await signUp(admin, adminEmail, 'Verify Inviter');
  const adminMail = await sink.waitFor(adminEmail, /\/verify-email#/);
  await followAndConfirm(admin, firstUrlIn(adminMail.body));
  await admin.getByRole('link', { name: 'Sign in' }).click();
  await admin.getByLabel('Email', { exact: true }).fill(adminEmail);
  await admin.getByLabel('Password').fill(PASSWORD);
  await admin.getByRole('button', { name: 'Sign in' }).click();

  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).

  await expect(admin.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });
  await admin.getByLabel('Organisation name').fill(orgName);
  await admin.getByRole('button', { name: /create organisation/i }).click();
  await expect(admin).toHaveURL(/\/orgs\//);

  await admin
    .getByRole('navigation', { name: 'Organisation' })
    .getByRole('link', { name: 'Members', exact: true })
    .click();
  await admin.getByRole('button', { name: 'Invite member' }).click();
  const invite = admin.getByRole('dialog');
  await invite.getByLabel('Email', { exact: true }).fill(inviteeEmail);
  await invite.getByLabel('Role', { exact: true }).selectOption('PLANNER');
  await invite.getByRole('button', { name: /send invitation/i }).click();
  const acceptUrl = await admin.getByLabel('Invitation link').inputValue();

  // ---------------------------------------------------------------- the invitee, deliberately unverified
  const inviteeContext = await browser.newContext();
  const invitee = await inviteeContext.newPage();
  await signUp(invitee, inviteeEmail, 'Verify Invitee');
  await expect(invitee).toHaveURL(/\/verify-email/);

  // They have to be signed in for the card to know who they are, and signing in is refused while
  // unverified — so this is the path a real invitee takes: verify is the only way forward, and the
  // card must say so rather than offering an Accept the server will refuse.
  const inviteeMail = await sink.waitFor(inviteeEmail, /\/verify-email#/);
  await followAndConfirm(invitee, firstUrlIn(inviteeMail.body));
  await invitee.getByRole('link', { name: 'Sign in' }).click();
  await invitee.getByLabel('Email', { exact: true }).fill(inviteeEmail);
  await invitee.getByLabel('Password').fill(PASSWORD);
  await invitee.getByRole('button', { name: 'Sign in' }).click();
  // 15 s, not 5 s: a cold chunk fetch sits inside this wait (docs/TECH_DEBT.md #182, #435).
  await expect(invitee.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });

  // Now verified, the accept works — which is the other half of the assertion: the refusal state
  // must not be reachable once the condition it names is satisfied.
  await invitee.goto(acceptUrl);
  await expect(invitee.getByRole('button', { name: /accept and join/i })).toBeVisible();
  await expect(invitee.getByText('Confirm your email address first')).toHaveCount(0);
  await invitee.getByRole('button', { name: /accept and join/i }).click();
  await expect(invitee).toHaveURL(/\/orgs\//);

  await adminContext.close();
  await inviteeContext.close();
});

test('fetching the emailed link, or the old API link, verifies nothing; only the press does', async ({
  browser,
  request,
}) => {
  const email = `scanner-${Date.now()}@example.com`;
  sink.clear();

  const context = await browser.newContext();
  const page = await context.newPage();
  await signUp(page, email, 'Scanner Subject');
  const mail = await sink.waitFor(email, /\/verify-email#/);
  const emailedUrl = firstUrlIn(mail.body);
  const token = new URLSearchParams(new URL(emailedUrl).hash.slice(1)).get('token');
  expect(token, 'the token travels in the fragment').toBeTruthy();

  // What a mail scanner does: fetch the link. The fragment is never sent, so this is the page shell.
  expect((await request.get(emailedUrl)).ok()).toBe(true);
  // And the shape emails carried before this change, aimed straight at the API: GET and HEAD must
  // redirect to the page and verify nothing.
  const legacy = `http://localhost:${API_PORT}/api/auth/verify-email?token=${encodeURIComponent(token ?? '')}`;
  for (const method of ['get', 'head'] as const) {
    const res = await request[method](legacy, { maxRedirects: 0 });
    expect(res.status(), `${method} of the legacy link`).toBe(303);
    expect(res.headers()['location']).toContain('/verify-email#token=');
  }
  const refusedContext = await browser.newContext();
  await expectSignInRefused(await refusedContext.newPage(), email);
  await refusedContext.close();

  // The page shows its button and, on arrival, has sent nothing.
  await page.goto(emailedUrl);
  await expect(page.getByRole('heading', { name: 'Confirm your email address' })).toBeVisible();
  await expectNoAxeViolations(page);
  // The token is stripped from the address bar once captured.
  await expect(page).toHaveURL(/\/verify-email$/);

  await page.getByRole('button', { name: 'Confirm my email address' }).click();
  await expect(page.getByRole('heading', { name: 'Email address confirmed' })).toBeVisible();
  await expectNoAxeViolations(page);

  await page.getByRole('link', { name: 'Sign in' }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /create your organisation/i })).toBeVisible({
    timeout: 15_000,
  });

  await context.close();
});

test('a link that is not a token says so after the press, and offers a fresh one', async ({
  page,
}) => {
  await page.goto('/verify-email#token=garbage');
  await page.getByRole('button', { name: 'Confirm my email address' }).click();

  await expect(page.getByRole('heading', { name: 'That link did not work' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: /send another verification email/i }),
  ).toBeVisible();
  await expectNoAxeViolations(page);
});
