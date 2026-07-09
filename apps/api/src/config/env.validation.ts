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
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Rate limiting: window (seconds) and max requests per window. */
    RATE_LIMIT_TTL: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_LIMIT: z.coerce.number().int().positive().default(100),
  })
  .superRefine((env, ctx) => {
    // Never allow the insecure development secret in production.
    if (env.NODE_ENV === 'production' && env.BETTER_AUTH_SECRET.includes('dev-insecure')) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: 'A strong BETTER_AUTH_SECRET must be set in production.',
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
