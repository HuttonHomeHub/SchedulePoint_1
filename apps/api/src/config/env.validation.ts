import { z } from 'zod';

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
     * proof. Off for the alpha because the verification-email loop is not built
     * yet (ADR-0016, docs/TECH_DEBT.md) — turning it on is the single switch
     * that closes that gap.
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

    // Don't silently trust only localhost as a CORS/CSRF origin in production.
    if (env.CORS_ORIGINS.split(',').some((origin) => origin.includes('localhost'))) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Set CORS_ORIGINS to your real web origin(s) in production (not localhost).',
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
