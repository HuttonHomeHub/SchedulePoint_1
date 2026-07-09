import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { type InvitationEmail, MailService } from './mail.service';

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
}
