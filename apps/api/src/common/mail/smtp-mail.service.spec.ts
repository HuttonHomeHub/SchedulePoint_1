import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAIL_SEND_FAILED, SEND_TIMEOUT_MS, SmtpMailService } from './smtp-mail.service';

const sendMail = vi.fn();
// Hoisted by Vitest above the import, so the adapter's `createTransport` call resolves to this.
const verify = vi.fn();
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => ({ sendMail, verify })) }));

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

/**
 * The alertable shape, asserted on all three failure paths. An operator greps ONE term; if a
 * record loses the field it stops being findable while still looking fine in a log viewer, which
 * is exactly the failure mode `docs/DEPLOYMENT.md`'s old instruction had (ADR-0075).
 */
const expectAlertable = (logger: ReturnType<typeof loggerDouble>, kind: string): void => {
  expect(logger.error).toHaveBeenCalledWith(
    expect.objectContaining({ event: MAIL_SEND_FAILED, kind }),
    expect.any(String),
  );
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

  it('logs the error object itself, extra fields and all — so those fields must not carry the body', async () => {
    // The ADR-0075 security review asked whether a transport error could smuggle the message —
    // and therefore a live token — into the log through `err`, since Pino's default serializer
    // emits every enumerable own property, not just `message`/`stack`.
    //
    // **Checked rather than assumed, and the specific worry did not hold.** `nodemailer@9.0.3`
    // builds send errors in `_formatError` (`lib/smtp-connection/index.js:932-957`) and attaches
    // exactly `response`, `responseCode` and `command` — the SERVER's reply and the SMTP verb.
    // The `raw` fields elsewhere in that package are message-composition inputs, not error fields.
    //
    // No redaction path was added for a field that does not exist. This test pins the property the
    // question was really about: whatever a transport hangs off its error, the token must not be
    // in it. It fails the day a transport starts echoing the payload back.
    const hostile = Object.assign(new Error('550 rejected'), {
      response: '550 5.7.1 rejected',
      responseCode: 550,
      command: 'DATA',
    });
    sendMail.mockRejectedValue(hostile);
    const logger = loggerDouble();

    await new SmtpMailService('no-reply@example.com', 'smtps://h', logger).sendInvitation(
      invitation,
    );

    const record = vi.mocked(logger.error).mock.calls[0]?.[0] as { err: Error };
    // Serialise the way Pino does — own enumerable properties, not `JSON.stringify`, which reduces
    // an Error to `{}` and would make this assertion pass against anything at all.
    const serialised = JSON.stringify({ ...record.err, message: record.err.message });
    expect(serialised).toContain('550');
    expect(serialised).not.toContain('tok_secret');
    expect(serialised).not.toContain(invitation.acceptUrl);
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

/**
 * The per-message bound (ADR-0075 M4), and the reason it exists.
 *
 * The milestone shipped its risk table saying **"no request-path cost"**, and its ADR reasoned
 * about mail as if it sat off to one side of the request. Both were wrong the same way:
 * `runInBackgroundOrAwait` **awaits** unless `advanced.backgroundTasks.handler` is configured,
 * nothing here configures one, and `InvitationsService` awaits its send in the handler outright.
 * Four endpoints therefore sit on a live SMTP round trip whose only bound was nodemailer's own
 * defaults — up to **ten minutes** on a socket that connects and then says nothing.
 *
 * These tests pin the two halves of the fix: the request is released, and the process survives the
 * send that was abandoned.
 */
describe('SmtpMailService send bound', () => {
  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
  });

  it('gives up on a hung relay and reports it, instead of holding the request open', async () => {
    vi.useFakeTimers();
    try {
      // A socket that accepts the connection and never speaks — the case nodemailer's *connection*
      // timeout does not cover, and the reason the bound is ours rather than the transport's.
      sendMail.mockReturnValue(new Promise(() => {}));
      const logger = loggerDouble();
      const service = new SmtpMailService('no-reply@example.com', 'smtps://h', logger);

      const pending = service.sendInvitation(invitation);
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);

      // RESOLVES, not rejects: the bound changes how long the caller waits, never what it is told.
      await expect(pending).resolves.toBeUndefined();
      expectAlertable(logger, 'invitation');
      // Read `err` off the record rather than stringifying it — `JSON.stringify(new Error(…))` is
      // `{}`, so a substring check over the serialised call list passes on ANY failure and would
      // have proved nothing about the timeout at all.
      const record = vi.mocked(logger.error).mock.calls[0]?.[0] as { err: Error };
      expect(record.err.message).toMatch(/timed out after 10000 ms/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('handles a rejection that arrives AFTER the wait was abandoned', async () => {
    // Without this, the fix would be worse than the defect. Node terminates the process on an
    // unhandled rejection by default, so a relay that times out and *then* errors would turn a mail
    // outage — the thing this whole ADR treats as survivable — into a crash loop.
    vi.useFakeTimers();
    try {
      let failLate: (error: Error) => void = () => {};
      sendMail.mockReturnValue(
        new Promise((_resolve, reject) => {
          failLate = reject;
        }),
      );
      const logger = loggerDouble();
      const service = new SmtpMailService('no-reply@example.com', 'smtps://h', logger);

      const pending = service.sendInvitation(invitation);
      await vi.advanceTimersByTimeAsync(SEND_TIMEOUT_MS);
      await expect(pending).resolves.toBeUndefined();

      failLate(new Error('421 service not available'));
      await vi.advanceTimersByTimeAsync(0);

      // Handled — and recorded as the distinct fact it is: not "the send failed" but "the send we
      // had already stopped waiting for failed".
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: MAIL_SEND_FAILED, abandoned: true }),
        expect.any(String),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not report an ordinary failure as abandoned', async () => {
    // The two records answer different questions, so a send that simply failed inside the bound
    // must not also appear in the abandoned stream — an operator counting abandonments to judge
    // whether the bound is too tight would otherwise be reading transport errors.
    sendMail.mockRejectedValue(new Error('550 mailbox unavailable'));
    const logger = loggerDouble();

    await new SmtpMailService('no-reply@example.com', 'smtps://h', logger).sendInvitation(
      invitation,
    );

    expect(logger.warn).not.toHaveBeenCalled();
    expectAlertable(logger, 'invitation');
  });
});

/**
 * The boot-time handshake (ADR-0075 M1). What a success does NOT prove is documented on the port;
 * these cover only the three outcomes this method itself has.
 */
describe('SmtpMailService.verifyTransport', () => {
  it('resolves when the transport verifies', async () => {
    verify.mockResolvedValue(true);
    const service = new SmtpMailService('no-reply@example.com', 'smtps://h', loggerDouble());
    await expect(service.verifyTransport()).resolves.toBeUndefined();
  });

  it('rejects when the transport refuses', async () => {
    verify.mockRejectedValue(new Error('535 authentication failed'));
    const service = new SmtpMailService('no-reply@example.com', 'smtps://h', loggerDouble());
    await expect(service.verifyTransport()).rejects.toThrow('535 authentication failed');
  });

  it('rejects on timeout when the relay connects and then never speaks', async () => {
    // The realistic hang, and the one a connection timeout does not cover — which is why the bound
    // is our own race rather than nodemailer's three separate timeout options.
    vi.useFakeTimers();
    try {
      verify.mockReturnValue(new Promise(() => {}));
      const service = new SmtpMailService('no-reply@example.com', 'smtps://h', loggerDouble());
      const pending = service.verifyTransport();
      const assertion = expect(pending).rejects.toThrow(/timed out after 5000 ms/);
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
