import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { createTransport, type Transporter } from 'nodemailer';

import { type EmailVerificationEmail, type InvitationEmail, MailService } from './mail.service';

/**
 * SMTP adapter for {@link MailService} — the first real transport (TECH_DEBT: mail transport,
 * Theme B). Selected by {@link MailModule} only when `MAIL_SMTP_URL` is configured; absent, the
 * logging stub stays in place and behaviour is byte-for-byte today's.
 *
 * **SMTP rather than a provider SDK.** Postmark, SES, Resend, Fastmail and a self-hosted relay all
 * speak it, so the provider is an env var rather than a dependency and swapping one costs a config
 * change instead of a new adapter. It is also the boring option, which for something that must work
 * unattended is the point.
 */
@Injectable()
export class SmtpMailService extends MailService {
  private readonly transporter: Transporter;

  constructor(
    private readonly from: string,
    smtpUrl: string,
    @InjectPinoLogger(SmtpMailService.name) private readonly logger: PinoLogger,
  ) {
    super();
    this.transporter = createTransport(smtpUrl);
  }

  /**
   * **A failed send must never fail the invitation.** Until now the port could not fail, because
   * logging cannot fail — so every caller was written against a method that always resolves, and
   * `InvitationsService` creates the row and then calls this. Letting a network error propagate
   * would silently make invitations start failing whenever a mail server hiccuped, and the invite
   * that did get created would be rolled back or orphaned depending on the caller.
   *
   * So the error is logged with enough context to chase and then swallowed. That is safe here and
   * not merely convenient: the accept URL is **also** returned in the create response and shown in
   * the admin UI, so an Org Admin can always hand it over by another route. The email is a
   * convenience over an existing path, not the only way through — which is exactly the property
   * that makes swallowing correct rather than lossy.
   */
  async sendInvitation(email: InvitationEmail): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email.to,
        subject: `You have been invited to ${email.organizationName} on SchedulePoint`,
        text: invitationText(email),
      });
      this.logger.info(
        { to: email.to, organizationName: email.organizationName },
        'invitation email sent',
      );
    } catch (error) {
      // Never log `acceptUrl` — it carries the one-time token, and logs are retained and shipped.
      this.logger.error(
        { err: error, to: email.to, organizationName: email.organizationName },
        'invitation email failed to send; the invitation itself was created and its accept URL is available in the app',
      );
    }
  }

  /**
   * Verification, and the one place this adapter lets an error **propagate**.
   *
   * `sendInvitation` swallows, because an Org Admin can read the accept URL off the screen and pass
   * it on. There is no such fallback here: the verify URL exists only in the email. Swallowing would
   * hand someone an account that — with `AUTH_REQUIRE_EMAIL_VERIFICATION` on — they cannot use, with
   * no error and nothing on screen explaining why, which is a worse outcome than a sign-up that
   * fails and can be retried.
   *
   * Throwing surfaces through Better Auth's own handler, so the caller learns immediately. Better
   * Auth also exposes a resend endpoint, so a user who slips through a transient outage is not
   * permanently stranded — but that is the recovery path, not the primary one.
   */
  async sendEmailVerification(email: EmailVerificationEmail): Promise<void> {
    // Never log `verifyUrl` — it carries the token, and logs are retained and shipped.
    await this.transporter.sendMail({
      from: this.from,
      to: email.to,
      subject: 'Confirm your email address for SchedulePoint',
      text: verificationText(email),
    });
    this.logger.info({ to: email.to }, 'email-verification link sent');
  }
}

/** Mirrors {@link invitationText}: plain text, one action, no template machinery. */
function verificationText(email: EmailVerificationEmail): string {
  return [
    'Confirm your email address to finish setting up your SchedulePoint account:',
    '',
    email.verifyUrl,
    '',
    'If you did not create an account, you can ignore this message.',
  ].join('\n');
}

/**
 * Plain text only, deliberately. An HTML part would need a template, a layout, escaping and a
 * plain-text fallback anyway, and none of that has a consumer yet — the first email this system
 * sends should be the smallest thing that works. Add HTML when there is a second message to justify
 * the machinery.
 */
function invitationText(email: InvitationEmail): string {
  return [
    `You have been invited to join ${email.organizationName} on SchedulePoint as ${email.role}.`,
    '',
    'Accept the invitation:',
    email.acceptUrl,
    '',
    `This invitation expires on ${email.expiresAt.toISOString().slice(0, 10)}.`,
    '',
    'If you were not expecting this invitation, you can ignore this message.',
  ].join('\n');
}
