import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { LoggingMailService } from './logging-mail.service';

function loggerDouble(): PinoLogger {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as PinoLogger;
}

const VERIFY_URL = 'https://app.example.com/api/v1/auth/verify-email?token=tok_live_secret';

const verification = { to: 'new-user@example.com', verifyUrl: VERIFY_URL };

const invitation = {
  to: 'invitee@example.com',
  organizationName: 'Acme Construction',
  role: 'PLANNER',
  acceptUrl: 'https://app.example.com/invitations/accept#tok_secret',
  expiresAt: new Date('2026-09-01T00:00:00Z'),
};

/** Every argument of every call, flattened, so a token cannot hide in a nested field. */
function loggedText(logger: PinoLogger): string {
  const calls = [
    ...(logger.info as unknown as ReturnType<typeof vi.fn>).mock.calls,
    ...(logger.warn as unknown as ReturnType<typeof vi.fn>).mock.calls,
    ...(logger.error as unknown as ReturnType<typeof vi.fn>).mock.calls,
    ...(logger.debug as unknown as ReturnType<typeof vi.fn>).mock.calls,
  ];
  return JSON.stringify(calls);
}

describe('LoggingMailService', () => {
  describe('outside production', () => {
    it('logs the verification URL, because locally the link exists nowhere else', async () => {
      const logger = loggerDouble();
      await new LoggingMailService(logger, false).sendEmailVerification(verification);

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(loggedText(logger)).toContain(VERIFY_URL);
    });
  });

  describe('in production', () => {
    /**
     * The regression this file exists for. The stub is selected purely on `MAIL_SMTP_URL` being
     * unset — which is a production host whose operator has not configured SMTP, not only a
     * developer's laptop — and Better Auth mints a verification token on every sign-up regardless
     * of `AUTH_REQUIRE_EMAIL_VERIFICATION`. Logging the URL there writes a live, single-use token
     * that changes account state into a retained, shipped log stream.
     */
    it('never logs the verification URL or its token', async () => {
      const logger = loggerDouble();
      await new LoggingMailService(logger, true).sendEmailVerification(verification);

      const text = loggedText(logger);
      expect(text).not.toContain(VERIFY_URL);
      expect(text).not.toContain('tok_live_secret');
      // Not merely absent from `info` — absent from every level, so moving the call does not
      // quietly reintroduce it.
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('says why no verification email went out, naming the missing configuration', async () => {
      const logger = loggerDouble();
      await new LoggingMailService(logger, true).sendEmailVerification(verification);

      // Silence would be worse than the leak in one respect: an operator would have no way to
      // learn that sign-ups are minting tokens nobody can use.
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const text = loggedText(logger);
      expect(text).toContain('MAIL_SMTP_URL');
      expect(text).toContain('new-user@example.com');
    });
  });

  describe('invitations', () => {
    it.each([
      ['outside production', false],
      ['in production', true],
    ])('never logs the accept URL (%s)', async (_label, isProduction) => {
      const logger = loggerDouble();
      await new LoggingMailService(logger, isProduction).sendInvitation(invitation);

      const text = loggedText(logger);
      expect(text).not.toContain(invitation.acceptUrl);
      expect(text).not.toContain('tok_secret');
    });
  });
});
