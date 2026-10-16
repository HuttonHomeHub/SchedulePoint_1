import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import {
  DatabasePasswordWarningService,
  usesDefaultDatabasePassword,
} from './database-password-warning.service';

function build(
  databaseUrl: string,
  nodeEnv: 'development' | 'test' | 'production' = 'production',
): { service: DatabasePasswordWarningService; warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();
  const config = { databaseUrl, nodeEnv } as AppConfigService;
  const logger = { warn } as unknown as ConstructorParameters<
    typeof DatabasePasswordWarningService
  >[1];

  return { service: new DatabasePasswordWarningService(config, logger), warn };
}

const DEFAULT_URL = 'postgresql://app:app@db:5432/app?schema=public';

describe('DatabasePasswordWarningService', () => {
  it('warns once, with a named event, when the password is the built-in default', () => {
    const { service, warn } = build(DEFAULT_URL);

    service.onApplicationBootstrap();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toEqual({ event: 'database.default_password' });
    expect(warn.mock.calls[0]?.[1]).toContain('built-in default');
  });

  it('warns in development too, but not under NODE_ENV=test', () => {
    const dev = build(DEFAULT_URL, 'development');
    dev.service.onApplicationBootstrap();
    expect(dev.warn).toHaveBeenCalledTimes(1);

    const test = build(DEFAULT_URL, 'test');
    test.service.onApplicationBootstrap();
    expect(test.warn).not.toHaveBeenCalled();
  });

  it('is silent for any other password', () => {
    const { service, warn } = build('postgresql://app:3f9c1d7e@db:5432/app');

    service.onApplicationBootstrap();

    expect(warn).not.toHaveBeenCalled();
  });

  it('is silent for a percent-encoded password that is not the default', () => {
    const { service, warn } = build('postgresql://app:p%40ss%2Fapp@db:5432/app');

    service.onApplicationBootstrap();

    expect(warn).not.toHaveBeenCalled();
  });

  it('never puts the password or the URL in the log call', () => {
    const { service, warn } = build(DEFAULT_URL);

    service.onApplicationBootstrap();

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain('app:app');
    expect(logged).not.toContain('postgresql');
    expect(logged).not.toContain('@db');
  });

  it('does not throw on a URL that does not parse', () => {
    const { service, warn } = build('not a url');

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('usesDefaultDatabasePassword', () => {
  it('reads a percent-encoded spelling of the default as the default', () => {
    expect(usesDefaultDatabasePassword('postgresql://app:%61pp@db:5432/app')).toBe(true);
  });

  it('is false when the URL has no password or an undecodable one', () => {
    expect(usesDefaultDatabasePassword('postgresql://app@db:5432/app')).toBe(false);
    expect(usesDefaultDatabasePassword('postgresql://app:%E0%A4%A@db:5432/app')).toBe(false);
  });
});
