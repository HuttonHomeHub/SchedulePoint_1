import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { firstUrlIn, SmtpSink } from '../e2e-account/smtp-sink';

/**
 * The **staff console** journey (ADR-0086, staff-console M3).
 *
 * It lands with M3 rather than at enablement because M3 is the first milestone with a user-facing
 * entry point (ADR-0081 §2) — and this epic has already paid for that rule once: M2 passed 1,589
 * unit tests and could not serve a single request, because every one of them mocks Prisma and the
 * database's own fail-closed CHECK rejected the row the route writes.
 *
 * Four things are only testable here:
 *
 * 1. **A non-staff member sees "Not found", not "access denied".** The API answers every non-staff
 *    caller with the 404 it gives an unmapped route; the screen must say the same, or it confirms
 *    the surface exists and is worth attacking. A mocked fetch cannot be wrong about which status
 *    the real guard chose.
 * 2. **The allowlist's case/whitespace asymmetry works end to end.** The config pins
 *    `' Ops@SchedulePoint.test '`; the account signs up lower-case. Entries are trimmed at parse
 *    time, the session value is lowercased and never trimmed. A unit test asserts each half against
 *    a mock; only this asserts the two meet.
 * 3. **`emailVerified` is genuinely required.** The address is verified by following a real emailed
 *    link — which is also the only honest way to reach the staff path at all, since the guard
 *    demands verification independently of `AUTH_REQUIRE_EMAIL_VERIFICATION` (off here).
 * 4. **A staff account with no organisation is not bounced to `/onboarding`.** `/staff` sits
 *    outside `_authed` for exactly this reason: the shell's home resolver invites a memberless
 *    account to create an organisation, and a dedicated staff account — which `DEPLOYMENT.md`
 *    recommends — is precisely that account. Nothing but a real router run proves it.
 *
 * Chromium only (TECH_DEBT #25a), serial.
 */

const PASSWORD = 'correct-horse-battery';
/** Must equal the config's `STAFF_EMAILS` entry, modulo case and padding — that is the point. */
const STAFF_EMAIL = 'ops@schedulepoint.test';
/**
 * Allowlisted and **never verified**, on purpose.
 *
 * The squatting control — "allowlisted is not enough, the address must be verified" — is the single
 * most important assertion here, and it is not stable on the primary account: the e2e database
 * persists, so from the second run onwards that account is already verified and the branch cannot
 * be reached again. A dedicated address that nothing ever verifies proves it on every run.
 */
const UNVERIFIED_STAFF_EMAIL = 'unverified@schedulepoint.test';

let sink: SmtpSink;

test.beforeAll(async () => {
  sink = new SmtpSink();
  await sink.start(Number(process.env.E2E_SMTP_PORT ?? 3026));
});

test.afterAll(async () => {
  await sink.stop();
});

/**
 * Sign up, or sign in when the address already exists.
 *
 * `STAFF_EMAIL` is **fixed** — it has to match the server's allowlist — while the e2e database
 * persists between runs, so a plain sign-up passes once and fails every time after. Branching on
 * what the screen actually shows keeps the suite re-runnable without a database reset, which is the
 * difference between a gate people run locally and one they only see in CI.
 */
async function signUpOrIn(page: Page, email: string, name: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /create an account/i }).click();

  // Either we are in (onboarding, or straight to an org), or the address was taken.
  const taken = page.getByText(/already|exists|in use/i).first();
  if (await taken.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await page.waitForLoadState('networkidle');
}

test('a staff member reaches the console; a member cannot tell it exists', async ({ browser }) => {
  const stamp = Date.now();
  const memberEmail = `staff-outsider-${stamp}@example.com`;

  // ---------------------------------------------------------------- An ordinary member
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await signUpOrIn(member, memberEmail, 'Ordinary Member');

  await member.goto('/staff');
  // The whole surface argument, driven against the real guard: "Not found", never "access denied",
  // never a sign-in bounce that implies signing in as somebody else would help.
  await expect(member.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await expect(member.getByText(/denied|permission|not authorised|staff/i)).toHaveCount(0);
  await memberContext.close();

  // -------------------------------------------------- Allowlisted, but unverified: still refused
  // The squatting control. `AUTH_REQUIRE_EMAIL_VERIFICATION` is OFF in this config — exactly the
  // configuration in which an allowlisted address that nobody has proved ownership of would
  // otherwise become staff — and the refusal is byte-identical to a stranger's.
  const squatterContext = await browser.newContext();
  const squatter = await squatterContext.newPage();
  await signUpOrIn(squatter, UNVERIFIED_STAFF_EMAIL, 'Unverified Ops');
  await squatter.goto('/staff');
  await expect(squatter.getByRole('heading', { name: 'Not found' })).toBeVisible();
  await squatterContext.close();

  // ---------------------------------------------------------------- The staff member
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await signUpOrIn(staff, STAFF_EMAIL, 'Ops Person');

  // Verify the address if this run created the account. On a re-run it is already verified, and
  // no mail is sent — so waiting for one unconditionally would fail on every run after the first.
  // The unverified branch is proved above on a dedicated account rather than here, which is what
  // makes both halves stable.
  await staff.goto('/staff');
  // Wait for EITHER outcome before branching, with a generous budget. A bare `isVisible({timeout})`
  // probe raced Vite's first compile of this lazily-loaded route on a cold dev server and reported
  // "not the console" for a page that had not finished rendering anything at all — which then sent
  // the run down the verification branch and failed waiting for mail nobody was going to send.
  // Asserting that one of the two headings is present first makes the branch a real observation.
  await expect(staff.getByRole('heading', { name: /^(Staff console|Not found)$/ })).toBeVisible({
    timeout: 30_000,
  });
  const alreadyIn = await staff
    .getByRole('heading', { name: 'Staff console' })
    .isVisible()
    .catch(() => false);

  if (!alreadyIn) {
    await staff.goto('/account');
    const resend = staff.getByRole('button', { name: /resend|send.*verification/i }).first();
    if (await resend.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await resend.click();
    }
    const mail = await sink.waitFor(STAFF_EMAIL, /verify-email/);
    const verifyUrl = firstUrlIn(mail.body);
    expect(verifyUrl, 'a verification link must have been sent').toBeTruthy();
    await staff.goto(verifyUrl);
    await staff.waitForLoadState('networkidle');

    // **Sign in again, because verifying does not leave you signed in.** Observed, not assumed: the
    // account was `email_verified = t` in the database and `/staff` still answered "Not found",
    // which is what an unauthenticated request looks like through this screen. It is also the
    // realistic path — a verification link is usually opened from a mail client, not the tab that
    // asked for it.
    await staff.goto('/sign-in');
    await staff.getByLabel('Email').fill(STAFF_EMAIL);
    await staff.getByLabel('Password').fill(PASSWORD);
    await staff.getByRole('button', { name: /sign in/i }).click();
    await staff.waitForLoadState('networkidle');
  }

  // **Sign in again, because verifying does not leave you signed in.** Following the link lands on
  // a fresh navigation whose session does not survive into the console — observed, not assumed: the
  // account is `email_verified = t` in the database at this point and `/staff` still answered "Not
  // found", which is what an unauthenticated request looks like through this screen. It is also the
  // realistic path, since a verification link is usually opened from a mail client rather than the
  // tab that asked for it.
  await staff.goto('/sign-in');
  await staff.getByLabel('Email').fill(STAFF_EMAIL);
  await staff.getByLabel('Password').fill(PASSWORD);
  await staff.getByRole('button', { name: /sign in/i }).click();
  await staff.waitForLoadState('networkidle');

  // ---------------------------------------------------------------- The console itself
  await staff.goto('/staff');
  await expect(staff.getByRole('heading', { name: 'Staff console' })).toBeVisible();
  // The address that matched, rendered NORMALISED — the config pinned ' Ops@SchedulePoint.test '
  // with padding and mixed case, so seeing the lower-case form proves both halves of the asymmetry.
  await expect(staff.getByText(STAFF_EMAIL)).toBeVisible();
  await expect(staff.getByRole('heading', { name: 'Mail' })).toBeVisible();

  // 4. NOT bounced to onboarding. This account has no organisation — which is the recommended
  // configuration — and `/staff` sits outside `_authed` precisely so the shell's home resolver
  // never sees it.
  await expect(staff).toHaveURL(/\/staff$/);
  await expect(staff.getByRole('heading', { name: /create your organisation/i })).toHaveCount(0);

  // The console is a real screen and gets the same accessibility bar as every other one.
  const results = await new AxeBuilder({ page: staff })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  await staffContext.close();
});
