import { z } from 'zod';

/**
 * An optional string where **empty means absent**.
 *
 * Every deployment surface this app has — Docker Compose, Dockge, Kubernetes — passes a variable
 * it does not have a value for as an empty string rather than omitting it, because `FOO: ${FOO}`
 * in a compose file always defines `FOO`. A plain `.min(1).optional()` therefore refuses to boot
 * on the ordinary case of "I have not configured mail yet", which is the opposite of optional.
 */
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

/**
 * Environment schema — the single source of truth for configuration shape.
 * The app validates the environment at startup and refuses to boot on invalid
 * config (fail fast). See docs/BACKEND_ARCHITECTURE.md (Configuration).
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    /** PostgreSQL connection string (postgresql://…). */
    DATABASE_URL: z.string().min(1),
    /** Comma-separated list of allowed CORS origins. */
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    /** Session signing secret — must be strong in production. */
    BETTER_AUTH_SECRET: z.string().min(16).default('dev-insecure-secret-change-me!!'),
    BETTER_AUTH_URL: z.string().min(1).default('http://localhost:3000'),
    /**
     * When `true`, users must have a verified email before their account is
     * usable — and, critically, before they can accept an organisation
     * invitation. The accept flow matches the signed-in user's email to the
     * invitee's, but that only proves mailbox ownership when verification is
     * enforced; otherwise an account can be registered for any address without
     * proof (ADR-0016 §5).
     *
     * The verification-email loop now exists (Theme B2, `emailVerification` in
     * `better-auth.ts`), so this is a switch an operator can turn on rather than
     * one that would strand every new account. It stays `false` by default
     * because turning it on is a deployment decision that needs a mail transport
     * — which is why `MAIL_SMTP_URL` is a hard prerequisite in production below.
     */
    AUTH_REQUIRE_EMAIL_VERIFICATION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    /**
     * Comma-separated trusted proxy IPs/CIDRs, ordered outermost→innermost. The
     * auth rate limiter derives the client IP from `X-Forwarded-For`; without a
     * trusted-proxy list a client can spoof that header and bypass the limit
     * (credential stuffing). Required in production so the vulnerable default
     * cannot ship. Empty in dev (the app is reached directly).
     */
    TRUSTED_PROXY_IPS: z.string().default(''),
    /**
     * SMTP connection URL (`smtps://user:pass@host:465`). **Absent = the logging stub**, which is
     * exactly today's behaviour — so dev, test and CI are unchanged and an operator opts in by
     * setting one variable, with no flag to flip and no code path to choose.
     *
     * SMTP rather than a provider SDK: Postmark, SES, Resend, Fastmail and a self-hosted relay all
     * speak it, so **which** provider is configuration rather than a dependency, and swapping one
     * costs an env change instead of an adapter. It also keeps the credential out of the codebase.
     */
    MAIL_SMTP_URL: optionalString,
    /** The `From:` address. Required once SMTP is configured — a transport with no sender cannot send. */
    MAIL_FROM: optionalString,
    /**
     * When `true`, structural plan writes (activity/dependency create/update/
     * delete/restore, positions batch, schedule recalculate) require the caller
     * to hold the plan edit-lock (ADR-0028) and return **423** otherwise. Off by
     * default: the lock *mechanism* ships inert so it never breaks the existing
     * (flag-on) activities-table / dependency-editor / recalculate flows, which do
     * not yet acquire a lock. Flip it on only once the front end acquires the pen
     * across every editing entry point (edit-lock M2/M3). The progress path and
     * reads are never gated regardless of this flag.
     */
    PLAN_EDIT_LOCK_ENFORCED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Rate limiting: window (seconds) and max requests per window. */
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    // Never allow the insecure development secret — and demand real entropy.
    if (env.BETTER_AUTH_SECRET.includes('dev-insecure') || env.BETTER_AUTH_SECRET.length < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: 'A strong BETTER_AUTH_SECRET (≥ 32 chars) must be set in production.',
      });
    }

    // The auth rate limiter cannot safely resolve client IPs without knowing
    // which proxies to trust — refuse to boot on the spoofable default.
    if (env.TRUSTED_PROXY_IPS.trim() === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUSTED_PROXY_IPS'],
        message:
          'TRUSTED_PROXY_IPS must list your proxy IP(s)/CIDR(s) in production so auth rate limiting cannot be bypassed via a spoofed X-Forwarded-For header.',
      });
    }

    // Requiring a verified address with no way to deliver the link is a dead end: without a
    // transport the only adapter left is the logging stub, so the verify URL exists nowhere but
    // the server's own log and every new account is unusable with nothing on screen saying why.
    // The switch and its prerequisite are checked together rather than trusting an operator to
    // read a doc — the same reason MAIL_FROM is demanded alongside MAIL_SMTP_URL.
    if (env.AUTH_REQUIRE_EMAIL_VERIFICATION && env.MAIL_SMTP_URL === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_REQUIRE_EMAIL_VERIFICATION'],
        message:
          'AUTH_REQUIRE_EMAIL_VERIFICATION=true requires MAIL_SMTP_URL in production — without a transport the verification link is only written to the server log, so no new account can be used.',
      });
    }

    // Don't silently trust only localhost as a CORS/CSRF origin in production.
    if (env.CORS_ORIGINS.split(',').some((origin) => origin.includes('localhost'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Set CORS_ORIGINS to your real web origin(s) in production (not localhost).',
      });
    }
  })
  /**
   * Mail is checked in **every** environment, not just production — the rules above guard against
   * shipping an insecure default, but this one guards against a transport that cannot send at all,
   * which is equally wrong in staging or on a developer's machine. Fail at boot rather than at the
   * first invitation.
   */
  .superRefine((env, ctx) => {
    if (env.MAIL_SMTP_URL !== undefined && env.MAIL_FROM === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_FROM'],
        message:
          'MAIL_FROM must be set when MAIL_SMTP_URL is — a transport needs a sender address.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validate raw environment variables into a typed `Env`.
 * Passed to `ConfigModule.forRoot({ validate })`.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
