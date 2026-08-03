import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { type EmailVerificationEmail, type InvitationEmail, MailService } from './mail.service';

/**
 * v1 stub adapter for {@link MailService}: it logs instead of sending. Onboarding
 * still works because the invitation's accept URL is also returned in the create
 * response (and shown in the admin UI). Replace with a real provider adapter
 * (behind its own ADR) when transactional email is wired.
 */
@Injectable()
export class LoggingMailService extends MailService {
  constructor(@InjectPinoLogger(LoggingMailService.name) private readonly logger: PinoLogger) {
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
   * The verify URL IS logged here, unlike the invitation's accept URL — deliberately, and only
   * because this adapter runs when no transport is configured, i.e. development. Without it there
   * would be no way to complete a sign-up locally with verification switched on: the link exists
   * nowhere else. The SMTP adapter never logs it.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async sendEmailVerification(email: EmailVerificationEmail): Promise<void> {
    this.logger.info(
      { to: email.to, verifyUrl: email.verifyUrl },
      'email-verification link (stub — not actually sent; follow this URL to verify locally)',
    );
  }
}
