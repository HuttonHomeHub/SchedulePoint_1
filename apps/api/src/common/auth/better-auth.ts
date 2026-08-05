import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';

import type { PrismaService } from '../../prisma/prisma.service';
import { resolveClientIp } from '../http/client-ip';
import { hashToken } from '../tokens/token';

import {
  attributeAttemptedAddress,
  classifyAuthEvent,
  emailVerifiedEvent,
  passwordResetCompletedEvent,
  signedOutEvent,
  type AuthAuditEvent,
  type FindUserIdByEmail,
} from './auth-audit';
import { normalizeEmail } from './normalize-email';

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
   * The SMTP adapter deliberately rejects rather than swallowing — but **rejecting does not fail
   * the sign-up**, because Better Auth calls this through `runInBackgroundOrAwait`, which catches
   * and logs without rethrowing. Delivery is best-effort in practice. See
   * `SmtpMailService.sendEmailVerification` for the verified detail and `docs/TECH_DEBT.md` #94
   * for what is left. This comment claimed the opposite until 2026-08-04.
   */
  sendVerificationEmail: (input: { to: string; verifyUrl: string }) => Promise<void>;
  /**
   * Deliver the password-reset link (ADR-0074). A callback for the same reason as
   * `sendVerificationEmail` — this factory stays a pure function of its options.
   *
   * **Configuring this is what makes reset exist at all.** Absent, Better Auth's
   * `/request-password-reset` throws `RESET_PASSWORD_DISABLED` outright
   * (`api/routes/password.mjs:51-57`), which is why the product had no recovery path rather than
   * merely no screen for one.
   */
  sendPasswordReset: (input: { to: string; resetUrl: string }) => Promise<void>;
  /**
   * Record an authentication event (ADR-0072). A callback for the same reason as
   * `sendVerificationEmail`: this factory stays a pure function of its options and never learns
   * about Nest DI.
   *
   * It must **never reject** — the caller binds it to `AuditService.recordBestEffort`, whose whole
   * job is to swallow. There is no transaction here to roll back, and refusing every sign-in
   * because the audit table is unavailable would turn a logging fault into an outage.
   */
  recordAuthEvent: (
    event: AuthAuditEvent,
    request: { ipAddress: string | null; userAgent: string | null },
  ) => Promise<void>;
  /**
   * Resolve an attempted address to a user id, so a failed sign-in is readable by the account it
   * was aimed at (ADR-0073 C2.2). A callback for the same reason as the two above: this factory
   * stays a pure function of its options.
   *
   * Like `recordAuthEvent` it **must never reject** — it runs on the sign-in path, where a lookup
   * fault must not become a refused sign-in.
   */
  findUserIdByEmail: FindUserIdByEmail;
  /**
   * Forward one of the auth library's own log lines into the application's structured stream
   * (`docs/TECH_DEBT.md` #94). A callback for the same reason as the three above.
   *
   * **What this buys, precisely.** Better Auth invokes `sendVerificationEmail` and
   * `sendResetPassword` through `runInBackgroundOrAwait`, which catches a rejection and hands it to
   * its **own** logger without rethrowing. Unconfigured, that logger writes a bare
   * `[Better Auth]:` line to stdout — outside Pino, outside the correlation ID, outside redaction —
   * so a broken relay produced silently unverifiable accounts and, since ADR-0074, silently
   * unrecoverable ones. Routing it here is the cheap half of #94; the hard half (knowing a send
   * failed *before* the handoff) is unchanged and still open.
   */
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, args: unknown[]) => void;
}

/**
 * Pull the request evidence off the hook's headers.
 *
 * The IP goes through the SAME `resolveClientIp` the rest of the app uses, over the same
 * `TRUSTED_PROXY_IPS` list Better Auth's own rate limiter is configured with. Taking the leftmost
 * `X-Forwarded-For` hop instead would be one line shorter and would record whatever the client
 * chose to claim — on the one table where a forged value is worst.
 *
 * There is no socket here (the hook sees a `Headers`, not a Node request), so a direct-access
 * request with no proxy header yields `null` rather than a peer address. An honestly empty column
 * beats a guess.
 */
function requestEvidence(
  headers: Headers | undefined,
  trustedProxies: readonly string[],
): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: resolveClientIp(
      headers?.get('x-forwarded-for') ?? undefined,
      undefined,
      trustedProxies,
    ),
    userAgent: headers?.get('user-agent') ?? null,
  };
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
    /**
     * Route the library's own logging into Pino (`docs/TECH_DEBT.md` #94, ADR-0074 M0).
     *
     * `disableColors` because the destination is JSON, not a terminal: without it the message
     * arrives wrapped in ANSI escapes that survive into the log store. The level is left at Better
     * Auth's own default (`warn`) rather than widened — the line this exists to capture is an
     * `error`, and dropping to `debug` would add per-request chatter to a stream that is retained.
     */
    logger: {
      disableColors: true,
      log: (level, message, ...args) => {
        options.log(level, message, args);
      },
    },
    emailAndPassword: {
      enabled: true,
      // Matches the shared password rule in the feature spec (≥ 12 chars).
      minPasswordLength: 12,
      maxPasswordLength: 128,
      // Whether an unverified account can be used at all. The loop that makes this
      // switch usable is `emailVerification` below (Theme B2).
      requireEmailVerification: options.requireEmailVerification,
      autoSignIn: true,
      /**
       * Account recovery (ADR-0074). Configuring this is what makes reset **exist**: without it
       * `/request-password-reset` answers `RESET_PASSWORD_DISABLED`, which is why the product had
       * no recovery path at all rather than merely no screen for one.
       *
       * Better Auth owns the token's minting, expiry and single-use; this app carries the URL, and
       * (per the `verification` key below) stores only its hash.
       */
      sendResetPassword: async ({ user, url }) => {
        await options.sendPasswordReset({ to: user.email, resetUrl: url });
      },
      /**
       * The audit seam for `auth.password_reset_completed` (ADR-0074). NOT `hooks.after`, for the
       * same reason `afterEmailVerification` is not: `/reset-password` returns `{ status: true }`
       * and nothing else, so an after-hook fires with no user on the context and would record
       * nothing while looking correct. Verified against a running instance, not assumed.
       *
       * It fires **before** the session revocation below, which is the right order: the row
       * describes the reset, and the revocation is its consequence.
       */
      onPasswordReset: async ({ user }, request) => {
        await options.recordAuthEvent(
          passwordResetCompletedEvent({ id: user.id, email: user.email }),
          requestEvidence(request?.headers, options.trustedProxies),
        );
      },
      /**
       * **A completed reset ends every other session** (ADR-0074 B2).
       *
       * `resetPassword` deletes the user's sessions only when this is truthy
       * (`better-auth/dist/api/routes/password.mjs:172`); unset, a reset leaves them all alive.
       * That is the wrong default for the commonest reason someone resets a password: a forgotten
       * password is sometimes *caused by* a compromise, and a reset that leaves the compromise
       * signed in has closed nothing.
       *
       * Note it costs the resetting browser nothing, because `/reset-password` issues no session
       * either — it returns `{ status: true }` and the user signs in afterwards.
       */
      revokeSessionsOnPasswordReset: true,
    },
    /**
     * **Verification identifiers are hashed at rest** (ADR-0074 B1).
     *
     * With no `verification` key configured, `processIdentifier` returns the identifier unchanged
     * (`better-auth/dist/db/verification-token-storage.mjs:8-13`) — so a password-reset row would
     * hold the literal `reset-password:<token>` in cleartext for the token's whole lifetime, and
     * anyone who could read that table would hold a usable account-takeover credential.
     *
     * That is exactly the bar `common/tokens/token.ts` sets for this app's own opaque tokens
     * (ADR-0016 invitations, ADR-0051 share links): "a database leak never exposes a usable token".
     * It applies here for the same reason, so it reuses the **same hasher** rather than Better
     * Auth's `'hashed'` shorthand — one hashing convention in the repository beats two that happen
     * to agree today.
     *
     * This is deliberately configured **before** `sendResetPassword` exists, which is what makes
     * the window in which a cleartext row could have been written empty rather than merely short.
     */
    verification: {
      // The port is async (Better Auth's own hasher awaits WebCrypto); ours is synchronous, so it
      // resolves immediately. `Promise.resolve` rather than an `async` arrow only to keep the
      // no-await-in-async lint rule quiet about a function that never awaits.
      storeIdentifier: { hash: (identifier: string) => Promise.resolve(hashToken(identifier)) },
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
      // The audit seam for `auth.email_verified` (ADR-0072). NOT `hooks.after`: `/verify-email`
      // returns `{ status: true, user: null }` and, when a `callbackURL` is present — which is how
      // the emailed link works — succeeds by THROWING a redirect. An after-hook would see no user
      // and an error on the success path, and would silently record nothing while looking correct.
      // This callback fires only on success and receives the user.
      afterEmailVerification: async (user, request) => {
        await options.recordAuthEvent(
          emailVerifiedEvent({ id: user.id, email: user.email }),
          requestEvidence(request?.headers, options.trustedProxies),
        );
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
    hooks: {
      /**
       * `auth.signed_out` (ADR-0072) — recorded on the way IN.
       *
       * `/sign-out` reads the session cookie directly and never resolves a session onto the
       * context, so an after-hook cannot say who signed out. Resolving it here, while the cookie
       * is still valid, is the only way to name the actor. The row therefore means "a sign-out was
       * requested by X"; the endpoint swallows its own delete-session error and always returns
       * success, so that is not a distinction a reader could act on.
       *
       * The hook returns nothing, which leaves the request untouched — a `before` hook that
       * returned a value would SHORT-CIRCUIT the endpoint, and signing out would stop working.
       */
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-out') return;
        const session = await getSessionFromCtx(ctx).catch(() => null);
        if (!session) return;
        await options.recordAuthEvent(
          signedOutEvent({ id: session.user.id, email: session.user.email }),
          requestEvidence(ctx.headers, options.trustedProxies),
        );
      }),
      /**
       * `auth.signed_up`, `auth.signed_in` and `auth.sign_in_failed` (ADR-0072).
       *
       * Failures are visible here because `dispatchAuthEndpoint` catches an `APIError`, assigns it
       * to `context.returned`, and still runs the after-hooks — which matters more than the
       * successes: the row nobody can produce is the one showing somebody trying.
       *
       * `classifyAuthEvent` returns null for every other path, and there are many (`/get-session`
       * fires on more or less every page load).
       */
      after: createAuthMiddleware(async (ctx) => {
        const event = classifyAuthEvent({
          path: ctx.path,
          failed: ctx.context.returned instanceof Error,
          newSession: ctx.context.newSession,
          // `/change-password` succeeds without minting a session, so its user is here and not in
          // `newSession` (ADR-0074).
          returned: ctx.context.returned,
          body: ctx.body,
        });
        if (!event) return;
        // Attribution runs BEFORE the record, because the table is append-only: there is no later
        // pass that could fill `subject_id` in (ADR-0073 C2.2).
        const attributed = await attributeAttemptedAddress(
          event,
          options.findUserIdByEmail,
          normalizeEmail,
        );
        await options.recordAuthEvent(
          attributed,
          requestEvidence(ctx.headers, options.trustedProxies),
        );
      }),
    },
    advanced: {
      /**
       * **Keep the origin check on under test.** Better Auth defaults `skipOriginCheck` to
       * `isTest() ? true : false` (`context/create-context.mjs:210`), so without this line every
       * e2e in this repository runs with the CSRF and redirect-target validation **switched off** —
       * a different security posture from production, in the suite whose job is to prove the
       * production one.
       *
       * That matters concretely for ADR-0074: `redirectTo` on `/request-password-reset` is
       * validated against `trustedOrigins` (bound to `CORS_ORIGINS`), and an app origin missing
       * from that list makes **every** reset fail with nothing on screen to explain it. Setting it
       * explicitly is what makes that failure mode testable rather than a deployment surprise.
       *
       * Found while writing `test/password-reset.e2e-spec.ts`, when an attacker-controlled
       * `redirectTo` returned 200.
       */
      disableOriginCheck: false,
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
