import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.validation';

/**
 * Typed accessor for validated configuration. Product code depends on this,
 * never on `process.env` directly (see docs/BACKEND_ARCHITECTURE.md).
 */
@Injectable()
export class AppConfigService {
  // `true` marks the config as validated, so `get` returns non-undefined values.
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get('NODE_ENV', { infer: true });
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get port(): number {
    return this.config.get('API_PORT', { infer: true });
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.config.get('LOG_LEVEL', { infer: true });
  }

  get corsOrigins(): string[] {
    return this.config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get betterAuthSecret(): string {
    return this.config.get('BETTER_AUTH_SECRET', { infer: true });
  }

  get betterAuthUrl(): string {
    return this.config.get('BETTER_AUTH_URL', { infer: true });
  }

  /**
   * Whether a verified email is required before an account is usable and before
   * an invitation can be accepted. Single source of truth for both Better Auth
   * and the invitation-accept email-ownership check (see env.validation.ts).
   */
  get requireEmailVerification(): boolean {
    return this.config.get('AUTH_REQUIRE_EMAIL_VERIFICATION', { infer: true });
  }

  /**
   * Whether the plan edit-lock write-gate is enforced (ADR-0028). Off by default
   * so the lock mechanism ships inert; the structural write services no-op their
   * `assertHoldsPen` check until this is enabled (once the front end acquires the
   * pen across all editing entry points). See env.validation.ts.
   */
  get planEditLockEnforced(): boolean {
    return this.config.get('PLAN_EDIT_LOCK_ENFORCED', { infer: true });
  }

  /**
   * Public base URL of the web app, used to build user-facing links (e.g. an
   * invitation accept URL). Defaults to the first configured CORS origin.
   */
  get appUrl(): string {
    return this.corsOrigins[0] ?? 'http://localhost:5173';
  }

  /** Trusted proxy IPs/CIDRs used to resolve the real client IP for rate limiting. */
  get trustedProxyIps(): string[] {
    return this.config
      .get('TRUSTED_PROXY_IPS', { infer: true })
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
  }

  get rateLimit(): { ttlMs: number; limit: number } {
    return {
      ttlMs: this.config.get('RATE_LIMIT_TTL', { infer: true }) * 1000,
      limit: this.config.get('RATE_LIMIT_LIMIT', { infer: true }),
    };
  }
}
