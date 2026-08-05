import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import {
  type EmailVerificationEmail,
  type InvitationEmail,
  MailService,
  type PasswordResetEmail,
} from './mail.service';

/**
 * v1 stub adapter for {@link MailService}: it logs instead of sending. Onboarding
 * still works because the invitation's accept URL is also returned in the create
 * response (and shown in the admin UI). Replace with a real provider adapter
 * (behind its own ADR) when transactional email is wired.
 */
@Injectable()
export class LoggingMailService extends MailService {
  constructor(
    @InjectPinoLogger(LoggingMailService.name) private readonly logger: PinoLogger,
    /**
     * Whether this process is a production deployment. Passed in rather than read here so the
     * decision stays in one place ({@link MailModule}) — see the comment on
     * {@link sendEmailVerification} for why this adapter has to know.
     */
    private readonly isProduction: boolean,
  ) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async sendInvitation(email: InvitationEmail): Promise<void> {
    // Never log the raw token beyond the acceptUrl; this is a dev-only stub.
    this.logger.info(
      { to: email.to, organizationName: email.organizationName, role: email.role },
      'invitation email (stub — not actually sent)',
    );
  }

  /**
   * The verify URL is logged **outside production only**, unlike the invitation's accept URL which
   * is never logged at all. Locally there is no other way to complete a sign-up with verification
   * switched on — the link exists nowhere else — so the URL is the whole point of the stub.
   *
   * The production guard exists because the previous version of this docblock said the stub "runs
   * when no transport is configured, i.e. development" and treated those as the same condition.
   * They are not. This adapter is selected purely on `MAIL_SMTP_URL` being unset, which is exactly
   * the state of a production host whose operator has not configured SMTP yet — and per
   * `docs/TECH_DEBT.md` #16 that is the state of the running deployment. Better Auth mints a
   * verification token on **every** sign-up (`sendOnSignUp: true`, independent of
   * `AUTH_REQUIRE_EMAIL_VERIFICATION`), so the unguarded version wrote a live, single-use token
   * that changes account state into a log stream that is retained and shipped. Pino's redact list
   * covers fixed `req.*` paths and would never have masked a custom field.
   *
   * In production the link is withheld and the miswiring is named instead, because an operator who
   * sees this line has a configuration problem to fix, not a URL to follow. Found by the 2026-08-04
   * reconciliation pass (`docs/RECONCILE.md` step 7). The SMTP adapter never logs the URL on any
   * path.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async sendEmailVerification(email: EmailVerificationEmail): Promise<void> {
    if (this.isProduction) {
      this.logger.warn(
        { to: email.to },
        'email-verification link NOT sent and NOT logged: no MAIL_SMTP_URL is configured, so this ' +
          'account cannot be verified. Configure a transport (docs/DEPLOYMENT.md). The link is ' +
          'deliberately withheld from production logs because it is a live single-use token.',
      );
      return;
    }

    this.logger.info(
      { to: email.to, verifyUrl: email.verifyUrl },
      'email-verification link (stub — not actually sent; follow this URL to verify locally)',
    );
  }

  /**
   * Password reset (ADR-0074). Same production guard as {@link sendEmailVerification} and for the
   * same reason — locally the URL is the whole point of the stub, and in production it is a live
   * credential in a retained log stream.
   *
   * If anything the guard matters **more** here. A verification link proves an address; a reset
   * link changes a password. And this adapter is selected exactly when no transport is configured,
   * which is the state in which a production operator most needs to be told their recovery path is
   * inert rather than handed a URL to follow.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async sendPasswordReset(email: PasswordResetEmail): Promise<void> {
    if (this.isProduction) {
      this.logger.warn(
        { to: email.to },
        'password-reset link NOT sent and NOT logged: no MAIL_SMTP_URL is configured, so this ' +
          'account cannot be recovered. Configure a transport (docs/DEPLOYMENT.md). The link is ' +
          'deliberately withheld from production logs because it can set a new password.',
      );
      return;
    }

    this.logger.info(
      { to: email.to, resetUrl: email.resetUrl },
      'password-reset link (stub — not actually sent; follow this URL to reset locally)',
    );
  }
}
