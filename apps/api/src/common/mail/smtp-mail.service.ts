import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { createTransport, type Transporter } from 'nodemailer';

import {
  type EmailVerificationEmail,
  type InvitationEmail,
  MailService,
  type PasswordResetEmail,
} from './mail.service';

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
   * Verification. **Swallows and logs, and that is an enumeration control rather than tidiness**
   * (ADR-0074 M5-T1, security review). It used to throw.
   *
   * **The throw was an account-existence oracle on a route anyone can call anonymously.** Better
   * Auth's `/send-verification-email` goes to real trouble to be uniform: for an unknown or
   * already-verified address it mints a **throwaway token** so the CPU work matches, then holds
   * every response to a 500 ms floor so the timings match
   * (`api/routes/email-verification.mjs:104-117`). And then, at the end of that same block,
   * `if (error) throw error` — so a transport failure reaches `better-call`'s router, which turns a
   * non-`APIError` into a bare **500**, distinguishable from the uniform 200 that every other
   * branch returns. A caller submitting a candidate address gets 200 for "unknown", 200 for
   * "already verified", and an error for "exists, unverified, and delivery to this recipient just
   * failed" — which is precisely the oracle this epic exists to keep closed, handed back by the one
   * branch that was never analysed.
   *
   * The sign-up call site was analysed and is safe (`runInBackgroundOrAwait`, `sign-up.mjs:246`),
   * which is why the previous docblock's reasoning read as sound. It was sound about sign-up and
   * silent about resend — the ADR-0064/0067 shape, one call site examined and its neighbour not.
   *
   * Swallowing costs the operator nothing they had: the error is logged **here**, with context, in
   * the Pino stream — strictly better than the `console.error` fallthrough it previously took
   * (`docs/TECH_DEBT.md` #94). The user-facing recovery path is unchanged: press resend again.
   */
  async sendEmailVerification(email: EmailVerificationEmail): Promise<void> {
    try {
      // Never log `verifyUrl` — it carries the token, and logs are retained and shipped.
      await this.transporter.sendMail({
        from: this.from,
        to: email.to,
        subject: 'Confirm your email address for SchedulePoint',
        text: verificationText(email),
      });
      this.logger.info({ to: email.to }, 'email-verification link sent');
    } catch (error) {
      this.logger.error(
        { err: error, to: email.to },
        'email-verification email failed to send; the account exists but cannot be verified until a resend succeeds',
      );
    }
  }

  /**
   * Password reset (ADR-0074). Swallows and logs, matching {@link sendEmailVerification}.
   *
   * **This one is not currently an oracle, and it is swallowed anyway — deliberately.** Better Auth
   * calls `sendResetPassword` through `runInBackgroundOrAwait` (`api/routes/password.mjs:82`), so a
   * rejection here is already caught before it can reach the response, and
   * `/request-password-reset` stays uniform for a known and an unknown address.
   *
   * That safety rests entirely on a **library internal**, one line in a file this repo does not
   * own. Its sibling above was safe by the same reasoning at one call site and an oracle at
   * another, and nothing in this codebase would have said so. Depending on the property rather
   * than holding it is how that happened; holding it here costs one `try` and removes the
   * dependency. The failure is logged with context in the Pino stream either way.
   */
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    try {
      // Never log `resetUrl` — it is a live single-use credential, and logs are retained/shipped.
      await this.transporter.sendMail({
        from: this.from,
        to: email.to,
        subject: 'Reset your SchedulePoint password',
        text: passwordResetText(email),
      });
      this.logger.info({ to: email.to }, 'password-reset link sent');
    } catch (error) {
      this.logger.error(
        { err: error, to: email.to },
        'password-reset email failed to send; the caller was answered uniformly and cannot tell',
      );
    }
  }
}

/**
 * Mirrors the two above: plain text, one action, no template machinery.
 *
 * The closing line is deliberate. A reset email arriving unrequested is the one signal an account
 * holder gets that somebody is probing their address, and "you can ignore this" alone reads as
 * routine — so it says the password is unchanged, which is the fact that makes ignoring it safe.
 */
function passwordResetText(email: PasswordResetEmail): string {
  return [
    'Choose a new password for your SchedulePoint account:',
    '',
    email.resetUrl,
    '',
    'This link can be used once and expires in about an hour.',
    '',
    'If you did not ask to reset your password, you can ignore this message — your password has ' +
      'not been changed.',
  ].join('\n');
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
