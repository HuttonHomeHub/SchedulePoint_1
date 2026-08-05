import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import {
  MAIL_TRANSPORT_UNREACHABLE,
  MAIL_TRANSPORT_VERIFIED,
  MailBootstrapService,
  smtpEndpoint,
} from './mail-bootstrap.service';
import type { MailService } from './mail.service';

/** A URL with a password in it — the thing that must never reach a log record. */
const SMTP_URL = 'smtps://resend:re_a_real_looking_api_key@smtp.resend.com:465';
const PASSWORD = 're_a_real_looking_api_key';

function loggerDouble(): PinoLogger {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as PinoLogger;
}

const configDouble = (smtpUrl?: string): AppConfigService =>
  ({ mailSmtpUrl: smtpUrl }) as unknown as AppConfigService;

describe('smtpEndpoint', () => {
  it('returns host and port and nothing else', () => {
    expect(smtpEndpoint(SMTP_URL)).toEqual({ host: 'smtp.resend.com', port: '465' });
  });

  it('names the default port rather than emitting an empty string', () => {
    // `''` renders as `port: ""` in a log viewer, which reads like a misconfiguration.
    expect(smtpEndpoint('smtp://mail.example.com')?.port).toBe('(default)');
  });

  it('returns null for an unparseable URL instead of throwing', () => {
    // It exists to make a log line useful; it must never be the reason a boot check fails.
    expect(smtpEndpoint('not a url')).toBeNull();
  });
});

describe('MailBootstrapService', () => {
  it('records the verified event with the endpoint, and never the credential', async () => {
    const logger = loggerDouble();
    const mail = {
      verifyTransport: vi.fn().mockResolvedValue(undefined),
    } as unknown as MailService;

    await new MailBootstrapService(mail, configDouble(SMTP_URL), logger).onApplicationBootstrap();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: MAIL_TRANSPORT_VERIFIED,
        host: 'smtp.resend.com',
        port: '465',
      }),
      expect.any(String),
    );
    expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).not.toContain(PASSWORD);
  });

  it('records the unreachable event and does NOT throw, so the boot continues', async () => {
    // The decision this test pins: an unattended recreate (ADR-0047) must not be able to take the
    // API down because a relay blipped. If this ever starts rejecting, boots become mail-dependent.
    const logger = loggerDouble();
    const mail = {
      verifyTransport: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 1.2.3.4:465')),
    } as unknown as MailService;

    await expect(
      new MailBootstrapService(mail, configDouble(SMTP_URL), logger).onApplicationBootstrap(),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: MAIL_TRANSPORT_UNREACHABLE, host: 'smtp.resend.com' }),
      expect.any(String),
    );
    // The failure path is the one where a careless `err` spread could carry the URL out with it.
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(PASSWORD);
  });

  it('says nothing at all when no transport is configured', async () => {
    // The logging stub has no `verifyTransport`. "No mail configured" is a deployment state, not a
    // fault — a warning here would train operators to ignore the channel that carries real ones.
    const logger = loggerDouble();
    const mail = {} as unknown as MailService;

    await new MailBootstrapService(mail, configDouble(undefined), logger).onApplicationBootstrap();

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
