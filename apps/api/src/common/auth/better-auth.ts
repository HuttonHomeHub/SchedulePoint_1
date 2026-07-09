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
   * Require a verified email before an account is usable. Off for the alpha
   * (no verification-email loop yet); when on, it also becomes the real
   * mailbox-ownership proof the invitation-accept check relies on (ADR-0016).
   */
  requireEmailVerification: boolean;
}

/**
 * Build the Better Auth instance. Email + password only in v1; sessions are
 * cookie-based (secure, http-only, same-site) per docs/SECURITY_STANDARDS.md.
 * Email verification is sent but not blocking for the alpha (ADR-0016).
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
      // v1: verification email is not enforced before first use (ADR-0016).
      // Driven by config so the invitation-accept email check can be hardened
      // with a single switch once the verification-email loop is built.
      requireEmailVerification: options.requireEmailVerification,
      autoSignIn: true,
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
