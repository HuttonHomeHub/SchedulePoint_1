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
});
