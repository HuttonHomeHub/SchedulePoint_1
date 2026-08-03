import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.validation';

/**
 * An optional value that a deployment surface left empty is **absent**, not present-and-blank.
 *
 * This exists twice — here and as `optionalString` in the env schema — and deliberately so. The
 * schema's rule governs the parsed env; this one governs what `ConfigService.get` returns, which
 * is not the same thing, because `get` falls through to `process.env` whenever the validated value
 * is `undefined`. One rule stated in one place would have been true in one of the two.
 */
function absentIfBlank(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

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

  /**
   * SMTP connection URL, or `undefined` for the logging stub. Its **presence is the switch** —
   * `MailModule` binds the real transport only when this is set, so there is no separate flag to
   * fall out of step with the credential.
   *
   * Normalised through {@link absentIfBlank} rather than returned raw, because `ConfigService.get`
   * does not stop at the validated env: when the validated value is `undefined` it **falls back to
   * `process.env`**, which holds the empty string a compose file always defines. The schema's
   * "empty means absent" rule is therefore true of the parsed env and false of this getter unless
   * it is restated here. Without it the API boots into `createTransport('')` and dies — which is
   * exactly how CI caught it.
   */
  get mailSmtpUrl(): string | undefined {
    return absentIfBlank(this.config.get('MAIL_SMTP_URL', { infer: true }));
  }

  /** The `From:` address. The env schema guarantees it is set whenever {@link mailSmtpUrl} is. */
  get mailFrom(): string | undefined {
    return absentIfBlank(this.config.get('MAIL_FROM', { infer: true }));
  }

  get rateLimit(): { ttlMs: number; limit: number } {
    return {
      ttlMs: this.config.get('RATE_LIMIT_TTL', { infer: true }) * 1000,
      limit: this.config.get('RATE_LIMIT_LIMIT', { infer: true }),
    };
  }
}
