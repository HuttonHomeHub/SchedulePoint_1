import { Global, Module } from '@nestjs/common';

import { LoggingMailService } from './logging-mail.service';
import { MailService } from './mail.service';

/**
 * Global mail module: binds the {@link MailService} port to its v1 stub adapter.
 * Global so any feature can inject `MailService` without importing this module.
 */
@Global()
@Module({
  providers: [{ provide: MailService, useClass: LoggingMailService }],
  exports: [MailService],
})
export class MailModule {}
