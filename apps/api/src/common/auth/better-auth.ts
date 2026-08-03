import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import type { PrismaService } from '../../prisma/prisma.service';

/**
 * DI token for the configured Better Auth instance (ADR-0003, ADR-0016).
 *
 * The instance is created once from `PrismaService` + validated config and is
 * the single source of truth for authentication. It is kept behind this token
 * (and the {@link AuthContextService} seam) so the rest of the app never imports
 * the auth library directly and tests can swap it.
 */
export const AUTH_INSTANCE = 'AUTH_INSTANCE';

export interface CreateAuthOptions {
  secret: string;
  baseURL: string;
  /** Origins allowed to call auth endpoints (CSRF / redirect allow-list). */
  trustedOrigins: string[];
  /**
   * Trusted proxy IPs/CIDRs used to resolve the real client IP from
   * `X-Forwarded-For` for rate limiting. Empty in dev (direct access); required
   * in production so the header cannot be spoofed to bypass the limiter.
   */
  trustedProxies: string[];
  isProduction: boolean;
  /**
   * Require a verified email before an account is usable. When on it is the real
   * mailbox-ownership proof the invitation-accept check relies on (ADR-0016 §5).
   * The loop it depends on now exists, so this is a switch that can be turned on
   * rather than one that would strand every new account.
   */
  requireEmailVerification: boolean;
  /**
   * Deliver the verification link (Theme B2). A callback rather than the `MailService` itself, so
   * this factory stays a pure function of its options and never learns about Nest DI or a transport
   * — the same reason the rest of the app talks to the port instead of the auth library.
   *
   * Rejecting fails the sign-up, which the SMTP adapter does deliberately; see
   * `SmtpMailService.sendEmailVerification` for why this one message is not swallowed.
   */
  sendVerificationEmail: (input: { to: string; verifyUrl: string }) => Promise<void>;
}

/**
 * Build the Better Auth instance. Email + password only in v1; sessions are
 * cookie-based (secure, http-only, same-site) per docs/SECURITY_STANDARDS.md.
 * The verification email IS sent (Theme B2, `emailVerification` below); whether a
 * verified address is REQUIRED before the account is usable is
 * `AUTH_REQUIRE_EMAIL_VERIFICATION`. This sentence used to say verification was
 * "sent but not blocking" while nothing was sent at all — corrected 2026-08-03.
 */
export function createAuth(prisma: PrismaService, options: CreateAuthOptions) {
  return betterAuth({
    appName: 'SchedulePoint',
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: '/api/auth',
    trustedOrigins: options.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      // Matches the shared password rule in the feature spec (≥ 12 chars).
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // Whether an unverified account can be used at all. The loop that makes this
      // switch usable is `emailVerification` below (Theme B2).
      requireEmailVerification: options.requireEmailVerification,
      autoSignIn: true,
    },
    /**
     * The verification loop (Theme B2). Until this existed the docblock above claimed the email
     * "is sent but not blocking" — it was **never sent at all**, because no `sendVerificationEmail`
     * was configured, so `AUTH_REQUIRE_EMAIL_VERIFICATION` was a switch that could only lock people
     * out. That was the gap standing between an invitation accept and a real proof of mailbox
     * ownership (ADR-0016 §5); what is left of TECH_DEBT #16 is turning the switch on, which is
     * now a deployment decision rather than missing code.
     *
     * `sendOnSignUp` is on so registration triggers it without a separate call; Better Auth owns the
     * token's minting, expiry and single-use, and this app only carries the URL.
     */
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await options.sendVerificationEmail({ to: user.email, verifyUrl: url });
      },
    },
    // Deny abusive traffic at the auth layer (Nest's ThrottlerGuard does not see
    // these routes — they are mounted as a raw Node handler). Better Auth applies
    // stricter per-path limits (e.g. sign-in) on top of this window. Enabled in
    // production; off in dev/test for a frictionless local/test experience. The
    // client IP is resolved via `advanced.ipAddress` below (spoof-resistant with
    // TRUSTED_PROXY_IPS), so the limit can't be bypassed by header forgery.
    rateLimit: {
      enabled: options.isProduction,
      window: 60,
      max: 100,
    },
    advanced: {
      cookiePrefix: 'schedulepoint',
      useSecureCookies: options.isProduction,
      // Resolve the client IP for rate limiting only from X-Forwarded-For hops
      // we trust; without this a spoofed header defeats the sign-in throttle.
      ipAddress: {
        ipAddressHeaders: ['x-forwarded-for'],
        trustedProxies: options.trustedProxies,
      },
    },
  });
}

/** The configured Better Auth instance type. */
export type AuthInstance = ReturnType<typeof createAuth>;
