import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAIL_SEND_FAILED, SmtpMailService } from './smtp-mail.service';

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

  /**
   * The alertable shape, asserted on all three failure paths. An operator greps ONE term; if a
   * record loses the field it stops being findable while still looking fine in a log viewer, which
   * is exactly the failure mode `docs/DEPLOYMENT.md`'s old instruction had (ADR-0075).
   */
  const expectAlertable = (logger: ReturnType<typeof loggerDouble>, kind: string): void => {
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: MAIL_SEND_FAILED, message: kind }),
      expect.any(String),
    );
  };

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
    expectAlertable(logger, 'invitation');
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

  it('RESOLVES when the verification send fails — a rejection here is an existence oracle', async () => {
    // **The inversion of this assertion is the fix** (ADR-0074 M5-T1, security review). It asserted
    // `rejects` until 2026-08-05, on reasoning that was correct about sign-up and silent about the
    // route that actually matters.
    //
    // `/send-verification-email` can be called by anyone, with no session. Better Auth makes it
    // uniform on purpose — a throwaway token minted for the unknown/verified branch so the CPU work
    // matches, then a 500 ms floor so the timings do — and then ends that same block with
    // `if (error) throw error`, which `better-call` turns into a bare 500. So a transport failure
    // made "this address exists and is unverified" distinguishable from every other answer.
    //
    // The operator signal the throw used to buy is not lost: the failure is logged here, with
    // context, inside the Pino stream, instead of falling through to `console.error`.
    const logger = loggerDouble();
    sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const service = new SmtpMailService('no-reply@example.com', 'smtps://h', logger);

    await expect(
      service.sendEmailVerification({ to: 'new@example.com', verifyUrl: 'https://x/verify#t' }),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
    expectAlertable(logger, 'email_verification');
    // And still never the URL, even on the failure path.
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('/verify#t');
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

    it('RESOLVES when the send fails, holding the uniform-answer property rather than borrowing it', async () => {
      // Not currently an oracle — `runInBackgroundOrAwait` catches this before it reaches the
      // response — but that safety is one line in a library this repo does not own, and its sibling
      // above was safe by the same argument at one call site and unsafe at another. Held here
      // instead of depended upon.
      const logger = loggerDouble();
      sendMail.mockRejectedValue(new Error('connect ECONNREFUSED'));
      const service = new SmtpMailService('no-reply@example.com', 'smtps://h', logger);

      await expect(service.sendPasswordReset(reset)).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
      expectAlertable(logger, 'password_reset');
      expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('tok_reset_secret');
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
