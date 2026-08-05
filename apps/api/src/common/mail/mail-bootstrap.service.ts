import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

import { MailService } from './mail.service';

/** Boot-time outcomes. Siblings of `mail.send_failed`, sharing its `mail.` prefix so one query finds the lot. */
export const MAIL_TRANSPORT_VERIFIED = 'mail.transport_verified';
export const MAIL_TRANSPORT_UNREACHABLE = 'mail.transport_unreachable';

/**
 * Host and port for the log context — **never the credential**.
 *
 * `MAIL_SMTP_URL` is `smtps://user:PASSWORD@host:port`, so logging the URL, or the parsed object,
 * or the error a failed `verify()` throws without thinking about it, publishes a live password to
 * wherever logs are shipped and retained. That is the same class as ADR-0074's "a reset URL is a
 * credential and no adapter may log it", one field along, and it is why this returns a **new object
 * with two scalars** rather than anything derived from the URL by omission — an allow-list, so a
 * future field cannot arrive by accident.
 *
 * A URL that will not parse yields `null` rather than throwing: it is only there to make the log
 * line useful, and it must not be the reason a boot check fails.
 */
export function smtpEndpoint(smtpUrl: string): { host: string; port: string } | null {
  try {
    const url = new URL(smtpUrl);
    return { host: url.hostname, port: url.port || '(default)' };
  } catch {
    return null;
  }
}

/**
 * Proves the mail transport is reachable once, at start-up (ADR-0075 M1).
 *
 * **It never fails the boot, and that is a decision rather than a simplification.** The product
 * owner's host recreates containers unattended on a released image (ADR-0047 Watchtower), so a
 * relay that is briefly unreachable at 03:00 would take the API down and *keep* it down until a
 * person noticed — trading an inconvenience nobody is awake for against an outage of the whole
 * product. Mail is not on the critical path of scheduling; the API is.
 *
 * **It is also deliberately not part of readiness.** `/health/ready` is what the container
 * healthcheck and any load balancer consume, so folding this in would convert a mail outage into a
 * restart loop — the same failure with more moving parts. If you are tempted to add it there, that
 * is the reason not to.
 *
 * `OnApplicationBootstrap` rather than `OnModuleInit`: it runs after every module has initialised,
 * so configuration validation has already happened and a bad `MAIL_SMTP_URL` has already been
 * rejected by the env schema. This check is about the network, not the shape of the string.
 */
@Injectable()
export class MailBootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    @InjectPinoLogger(MailBootstrapService.name) private readonly logger: PinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Feature-detected, not assumed: `verifyTransport` is optional on the port, and the logging
    // stub does not implement it. "No transport is configured" is a deployment state, not a fault,
    // and saying nothing is the correct amount to say about it.
    if (typeof this.mail.verifyTransport !== 'function') return;

    const endpoint = this.config.mailSmtpUrl ? smtpEndpoint(this.config.mailSmtpUrl) : null;
    try {
      await this.mail.verifyTransport();
      this.logger.info({ event: MAIL_TRANSPORT_VERIFIED, ...endpoint }, 'mail transport reachable');
    } catch (error) {
      this.logger.error(
        { event: MAIL_TRANSPORT_UNREACHABLE, ...endpoint, err: error },
        'mail transport is NOT reachable — invitations, verification and password resets will not be delivered; the API has started anyway',
      );
    }
  }
}
