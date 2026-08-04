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
   * Verification. This method lets its error **propagate**, unlike `sendInvitation` which swallows
   * — but read the next paragraph before relying on that, because propagating is not the same as
   * failing the sign-up, and this docblock claimed it was.
   *
   * **The rejection does NOT fail the sign-up.** Better Auth invokes `sendVerificationEmail` via
   * `ctx.context.runInBackgroundOrAwait(...)` (`api/routes/sign-up.mjs`), whose default
   * implementation wraps the await in `try { … } catch (e) { logger.error(…) }` and never
   * rethrows, in either branch. No option this app can set changes that — the alternative branch
   * needs `advanced.backgroundTasks.handler`, which also only `.catch()`es. So the sign-up commits
   * and returns success whether or not the message was delivered. The 2026-08-04 reconciliation
   * pass verified this against the installed `better-auth@1.6.25`; the previous text here, in
   * `better-auth.ts`, and in `docs/DEPLOYMENT.md` all asserted the opposite, and had been believed
   * because the only test drives this method directly and so cannot see the layer above it.
   *
   * The reasoning for throwing still stands and the throw is kept: it is right at this seam, and it
   * becomes true the moment the caller stops swallowing. What is untrue is the guarantee built on
   * it. Delivery is **best-effort in practice**, and the operator-facing consequence — a broken
   * relay producing silently unverifiable accounts, visible only as an unstructured `[better-auth]`
   * line outside the Pino pipeline — is `docs/TECH_DEBT.md` #94. Better Auth's resend endpoint is
   * the user-facing recovery path.
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
