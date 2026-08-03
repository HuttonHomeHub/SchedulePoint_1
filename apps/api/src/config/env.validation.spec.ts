import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.validation';

/**
 * Guards the fail-fast production checks (docs/SECURITY_STANDARDS.md): the app
 * must refuse to boot on insecure defaults so they can never reach production.
 */
const prodBase = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:app@db:5432/app',
  BETTER_AUTH_SECRET: 'a'.repeat(48),
  CORS_ORIGINS: 'https://app.schedulepoint.example',
  TRUSTED_PROXY_IPS: '10.0.0.0/8',
};

describe('validateEnv (production hardening)', () => {
  it('accepts a fully-configured production environment', () => {
    expect(() => validateEnv({ ...prodBase })).not.toThrow();
  });

  it('rejects a weak/short auth secret in production', () => {
    expect(() => validateEnv({ ...prodBase, BETTER_AUTH_SECRET: 'short-secret-123' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });

  it('rejects the insecure dev secret in production', () => {
    expect(() =>
      validateEnv({ ...prodBase, BETTER_AUTH_SECRET: `dev-insecure-${'x'.repeat(40)}` }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('refuses to boot without TRUSTED_PROXY_IPS in production (rate-limit bypass guard)', () => {
    expect(() => validateEnv({ ...prodBase, TRUSTED_PROXY_IPS: '' })).toThrow(/TRUSTED_PROXY_IPS/);
  });

  it('rejects a localhost CORS origin in production', () => {
    expect(() => validateEnv({ ...prodBase, CORS_ORIGINS: 'http://localhost:5173' })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it('is lenient in development (insecure defaults allowed for DX)', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
      }),
    ).not.toThrow();
  });
});

describe('mail transport configuration (Theme B1)', () => {
  it('defaults to no SMTP, which keeps the logging stub — today’s behaviour', () => {
    const parsed = validateEnv({ ...prodBase });
    expect(parsed.MAIL_SMTP_URL).toBeUndefined();
    expect(parsed.MAIL_FROM).toBeUndefined();
  });

  it('treats an EMPTY mail variable as absent, not as a misconfiguration', () => {
    // How every deployment surface actually behaves: `MAIL_SMTP_URL: ${MAIL_SMTP_URL:-}` in a
    // compose file always DEFINES the variable, empty when unset. A bare `.min(1).optional()`
    // would refuse to boot on the ordinary "I have not configured mail yet" case.
    const parsed = validateEnv({ ...prodBase, MAIL_SMTP_URL: '', MAIL_FROM: '   ' });
    expect(parsed.MAIL_SMTP_URL).toBeUndefined();
    expect(parsed.MAIL_FROM).toBeUndefined();
  });

  it('refuses to boot when SMTP is configured without a sender', () => {
    // Fail at startup rather than at the first invitation. A transport with no From address
    // cannot send, and discovering that when someone invites their first client is too late.
    expect(() => validateEnv({ ...prodBase, MAIL_SMTP_URL: 'smtps://user:pw@host:465' })).toThrow(
      /MAIL_FROM/,
    );
  });

  it('accepts a complete mail configuration', () => {
    const parsed = validateEnv({
      ...prodBase,
      MAIL_SMTP_URL: 'smtps://user:pw@host:465',
      MAIL_FROM: 'SchedulePoint <no-reply@example.com>',
    });
    expect(parsed.MAIL_SMTP_URL).toBe('smtps://user:pw@host:465');
    expect(parsed.MAIL_FROM).toBe('SchedulePoint <no-reply@example.com>');
  });

  it('refuses to boot when verification is required in production with no transport', () => {
    // The dead end this guard exists to prevent: with no SMTP the only adapter left is the
    // logging stub, so the verify URL is written to the server log and nowhere else — every new
    // account is unusable and nothing on screen says why.
    expect(() => validateEnv({ ...prodBase, AUTH_REQUIRE_EMAIL_VERIFICATION: 'true' })).toThrow(
      /AUTH_REQUIRE_EMAIL_VERIFICATION/,
    );
  });

  it('accepts verification required once a transport is configured', () => {
    const parsed = validateEnv({
      ...prodBase,
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'true',
      MAIL_SMTP_URL: 'smtps://user:pw@host:465',
      MAIL_FROM: 'SchedulePoint <no-reply@example.com>',
    });
    expect(parsed.AUTH_REQUIRE_EMAIL_VERIFICATION).toBe(true);
  });

  it('still allows verification without SMTP outside production — the stub logs the link', () => {
    // Deliberately not a global rule. Locally the logging adapter prints the verify URL, which is
    // the only way to complete a verified sign-up on a developer's machine.
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
        AUTH_REQUIRE_EMAIL_VERIFICATION: 'true',
      }),
    ).not.toThrow();
  });

  it('checks mail in development too, not only production', () => {
    // The other cross-field rules guard against insecure PRODUCTION defaults; this one guards
    // against a transport that cannot send, which is equally wrong on a developer's machine.
    expect(() =>
      validateEnv({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://app:app@db:5432/app',
        MAIL_SMTP_URL: 'smtps://user:pw@host:465',
      }),
    ).toThrow(/MAIL_FROM/);
  });
});
