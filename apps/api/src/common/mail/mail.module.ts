import { Global, Module } from '@nestjs/common';
import { getLoggerToken, PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { OperationalAlertService } from '../operational/operational-alert.service';

import { LoggingMailService } from './logging-mail.service';
import { MailBootstrapService } from './mail-bootstrap.service';
import { MailService } from './mail.service';
import { SmtpMailService } from './smtp-mail.service';

/**
 * Global mail module: binds the {@link MailService} port to a transport. Global so any feature can
 * inject `MailService` without importing this module.
 *
 * **Which adapter is decided by configuration, not by a flag.** With `MAIL_SMTP_URL` set the SMTP
 * adapter is used; without it the logging stub stays, which is byte-for-byte today's behaviour — so
 * development, test and CI are untouched and an operator enables real mail by setting one variable.
 * A boolean flag would be a second thing to keep in step with the credential it guards, and the
 * classic failures are a flag switched on with no transport behind it, and a transport configured
 * but inert because nobody flipped the flag. The credential's presence IS the intent.
 */
@Global()
@Module({
  providers: [
    {
      provide: MailService,
      inject: [
        AppConfigService,
        getLoggerToken(SmtpMailService.name),
        getLoggerToken(LoggingMailService.name),
        OperationalAlertService,
      ],
      useFactory: (
        config: AppConfigService,
        smtpLogger: PinoLogger,
        stubLogger: PinoLogger,
        alerts: OperationalAlertService,
      ): MailService => {
        const smtpUrl = config.mailSmtpUrl;
        const from = config.mailFrom;
        // `from` is guaranteed present alongside `smtpUrl` by the env schema's cross-field rule, so
        // this is a type narrowing rather than a second policy — the app refuses to boot otherwise.
        return smtpUrl !== undefined && from !== undefined
          ? new SmtpMailService(from, smtpUrl, smtpLogger, alerts)
          : // The stub is told whether it is running in production, because "no transport is
            // configured" and "this is a developer's laptop" are NOT the same condition — the stub
            // is what runs on a production host whose operator has not set `MAIL_SMTP_URL` yet, and
            // that is the state of a real deployment today (`docs/TECH_DEBT.md` #16).
            //
            // The stub is deliberately NOT given the alerter. It does not send, so it cannot fail,
            // so there is nothing to record — and a `mail_events` row written by the stub would say
            // a send failed when no send was attempted, which is worse than no row.
            new LoggingMailService(stubLogger, config.isProduction);
      },
    },
    // Runs the boot-time reachability check (ADR-0075 M1). Not exported — nothing injects it; it
    // exists for its lifecycle hook, and exporting it would invite a caller that then has to reason
    // about when the check has run.
    MailBootstrapService,
  ],
  exports: [MailService],
})
export class MailModule {}
