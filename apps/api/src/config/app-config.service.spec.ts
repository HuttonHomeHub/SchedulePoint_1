import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.validation';

/**
 * Built through the **real** `ConfigModule`, not a stubbed `ConfigService`.
 *
 * The defect this file exists for lived in the gap between the two: the env schema mapped an empty
 * `MAIL_SMTP_URL` to `undefined` correctly, and `ConfigService.get` then fell back to `process.env`
 * — where the empty string still sat, because a compose file's `${MAIL_SMTP_URL:-}` always DEFINES
 * the variable. A stubbed config service returns whatever the stub was told to and could never have
 * shown that. The API booted into `createTransport('')` and died; CI's smoke-boot caught it.
 */
async function resolve(): Promise<AppConfigService> {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, ignoreEnvFile: true })],
    providers: [AppConfigService],
  }).compile();
  return moduleRef.get(AppConfigService);
}

const baseEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/app',
};

describe('AppConfigService — mail', () => {
  const original = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('reports an EMPTY MAIL_SMTP_URL as absent, so the logging stub stays bound', async () => {
    // The exact shape a compose file produces for a variable the operator has not set.
    process.env.MAIL_SMTP_URL = '';
    process.env.MAIL_FROM = '';

    const config = await resolve();

    expect(config.mailSmtpUrl).toBeUndefined();
    expect(config.mailFrom).toBeUndefined();
  });

  it('reports a whitespace-only value as absent too', async () => {
    process.env.MAIL_SMTP_URL = '   ';

    expect((await resolve()).mailSmtpUrl).toBeUndefined();
  });

  it('passes a configured transport through unchanged', async () => {
    process.env.MAIL_SMTP_URL = 'smtps://user:pw@host:465';
    process.env.MAIL_FROM = 'SchedulePoint <no-reply@example.com>';

    const config = await resolve();

    expect(config.mailSmtpUrl).toBe('smtps://user:pw@host:465');
    expect(config.mailFrom).toBe('SchedulePoint <no-reply@example.com>');
  });
});

describe('AppConfigService — operational alerting (staff console M1)', () => {
  const original = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, baseEnv);
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('reports EMPTY webhook variables as absent, so nothing is armed', async () => {
    // The `mailSmtpUrl` trap, one variable along: `ConfigService.get` falls back to `process.env`
    // when the validated value is undefined, so the schema's "empty means absent" rule is true of
    // the parsed env and false of the getter unless it is restated. There it boots into
    // `createTransport('')` and dies loudly; here it would arm an alerter that `fetch('')`s on
    // every mail failure — swallowed by design, so the operator sees a configured channel that has
    // never delivered anything. Silent is the worse of the two.
    process.env.MAIL_ALERT_URL = '';
    process.env.HEARTBEAT_URL = '   ';

    const config = await resolve();

    expect(config.mailAlertUrl).toBeUndefined();
    expect(config.heartbeatUrl).toBeUndefined();
  });

  it('passes configured webhooks through unchanged', async () => {
    process.env.MAIL_ALERT_URL = 'https://ntfy.sh/schedulepoint-mail';
    process.env.HEARTBEAT_URL = 'https://hc-ping.com/abc-123';

    const config = await resolve();

    expect(config.mailAlertUrl).toBe('https://ntfy.sh/schedulepoint-mail');
    expect(config.heartbeatUrl).toBe('https://hc-ping.com/abc-123');
  });

  it('converts both periods to milliseconds', async () => {
    // The getters are the only place the unit changes. Consumers take milliseconds because that is
    // what `setInterval` and `Date.now()` arithmetic want; the env is in minutes because that is
    // what an operator thinks in.
    const config = await resolve();

    expect(config.mailAlertWindowMs).toBe(10 * 60_000);
    expect(config.heartbeatIntervalMs).toBe(5 * 60_000);
  });
});
