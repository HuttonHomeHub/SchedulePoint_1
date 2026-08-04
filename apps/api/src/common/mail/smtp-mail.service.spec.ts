import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SmtpMailService } from './smtp-mail.service';

const sendMail = vi.fn();
// Hoisted by Vitest above the import, so the adapter's `createTransport` call resolves to this.
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

function loggerDouble(): PinoLogger {
  return { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as PinoLogger;
}

const invitation = {
  to: 'invitee@example.com',
  organizationName: 'Acme Construction',
  role: 'PLANNER',
  acceptUrl: 'https://app.example.com/invitations/accept#tok_secret',
  expiresAt: new Date('2026-09-01T00:00:00Z'),
};

describe('SmtpMailService', () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
  });

  it('sends the invitation with the configured sender and a usable accept URL', async () => {
    const service = new SmtpMailService(
      'SchedulePoint <no-reply@example.com>',
      'smtps://h',
      loggerDouble(),
    );
    await service.sendInvitation(invitation);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const message = sendMail.mock.calls[0]?.[0] as Record<string, string>;
    expect(message.from).toBe('SchedulePoint <no-reply@example.com>');
    expect(message.to).toBe('invitee@example.com');
    expect(message.subject).toContain('Acme Construction');
    // The accept URL is the whole point of the message — if it is missing the email is useless.
    expect(message.text).toContain(invitation.acceptUrl);
    expect(message.text).toContain('2026-09-01');
  });

  it('RESOLVES when the transport throws, so a mail outage cannot fail an invitation', async () => {
    // The load-bearing test. Until this adapter existed the port could not fail, because logging
    // cannot fail — so `InvitationsService` creates the invitation row and then calls this. If a
    // send error propagated, invitations would start failing whenever a mail server hiccuped.
    sendMail.mockRejectedValue(new Error('550 mailbox unavailable'));
    const logger = loggerDouble();
    const service = new SmtpMailService('no-reply@example.com', 'smtps://h', logger);

    await expect(service.sendInvitation(invitation)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('never puts the accept URL in a log line, because it carries the one-time token', async () => {
    sendMail.mockRejectedValue(new Error('connect ETIMEDOUT'));
    const logger = loggerDouble();
    await new SmtpMailService('no-reply@example.com', 'smtps://h', logger).sendInvitation(
      invitation,
    );

    const logged = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(logged).not.toContain('tok_secret');
    expect(logged).not.toContain(invitation.acceptUrl);
  });

  it('sends the verification link with the configured sender', async () => {
    const service = new SmtpMailService('no-reply@example.com', 'smtps://h', loggerDouble());
    await service.sendEmailVerification({
      to: 'new@example.com',
      verifyUrl: 'https://app.example.com/verify?token=tok_secret',
    });

    const message = sendMail.mock.calls[0]?.[0] as Record<string, string>;
    expect(message.from).toBe('no-reply@example.com');
    expect(message.to).toBe('new@example.com');
    expect(message.text).toContain('https://app.example.com/verify?token=tok_secret');
  });

  it('THROWS when the verification send fails — the opposite of the invitation rule', async () => {
    // The asymmetry, pinned. An invitation swallows because its accept URL is also on screen; the
    // verify URL exists ONLY in this email. Swallowing would discard the only signal that anything
    // went wrong.
    //
    // **Throwing does not fail the sign-up**, and this comment claimed it did until 2026-08-04:
    // Better Auth calls the port through `runInBackgroundOrAwait`, which catches and logs without
    // rethrowing. What the throw buys is that the failure reaches a logger with context rather than
    // vanishing here — which is exactly why routing Better Auth's own logger into Pino
    // (`docs/TECH_DEBT.md` #94) is part of ADR-0074's M0. This test pins the seam's behaviour, not
    // a guarantee about the layer above it — a distinction that cost the previous version its
    // accuracy, because a test one level below where a claim is made cannot see the claim.
    sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const service = new SmtpMailService('no-reply@example.com', 'smtps://h', loggerDouble());

    await expect(
      service.sendEmailVerification({ to: 'new@example.com', verifyUrl: 'https://x/verify#t' }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });

  it('never logs the verify URL on success — it carries the token', async () => {
    const logger = loggerDouble();
    await new SmtpMailService('no-reply@example.com', 'smtps://h', logger).sendEmailVerification({
      to: 'new@example.com',
      verifyUrl: 'https://app.example.com/verify?token=tok_secret',
    });

    const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(logged).not.toContain('tok_secret');
  });

  describe('password reset (ADR-0074)', () => {
    const reset = {
      to: 'locked-out@example.com',
      resetUrl: 'https://app.example.com/api/auth/reset-password/tok_reset_secret',
    };

    it('sends the reset link, and says the password has not changed', async () => {
      const service = new SmtpMailService('no-reply@example.com', 'smtps://h', loggerDouble());
      await service.sendPasswordReset(reset);

      const message = sendMail.mock.calls[0]?.[0] as Record<string, string>;
      expect(message.to).toBe('locked-out@example.com');
      expect(message.text).toContain(reset.resetUrl);
      // The line that matters for an unrequested reset: it tells the recipient that ignoring the
      // message is safe, which "you can ignore this" alone does not.
      expect(message.text).toContain('has not been changed');
    });

    it('THROWS when the send fails, like verification and unlike an invitation', async () => {
      sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'));
      const service = new SmtpMailService('no-reply@example.com', 'smtps://h', loggerDouble());

      await expect(service.sendPasswordReset(reset)).rejects.toThrow(/ECONNREFUSED/);
    });

    it('never logs the reset URL on success — it can set a password', async () => {
      const logger = loggerDouble();
      await new SmtpMailService('no-reply@example.com', 'smtps://h', logger).sendPasswordReset(
        reset,
      );

      const logged = JSON.stringify(vi.mocked(logger.info).mock.calls);
      expect(logged).not.toContain('tok_reset_secret');
    });
  });
});
