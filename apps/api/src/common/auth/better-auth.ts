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
  isProduction: boolean;
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
      requireEmailVerification: false,
      autoSignIn: true,
    },
    // Deny abusive traffic at the auth layer (Nest's ThrottlerGuard does not see
    // these routes — they are mounted as a raw Node handler). Better Auth applies
    // stricter per-path limits (e.g. sign-in) on top of this window.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
    },
    advanced: {
      cookiePrefix: 'schedulepoint',
      useSecureCookies: options.isProduction,
    },
  });
}

/** The configured Better Auth instance type. */
export type AuthInstance = ReturnType<typeof createAuth>;
