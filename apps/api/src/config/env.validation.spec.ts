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
