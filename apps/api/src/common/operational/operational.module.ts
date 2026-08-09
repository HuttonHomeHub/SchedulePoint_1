import { Global, Module } from '@nestjs/common';

import { OperationalAlertService } from './operational-alert.service';

/**
 * Operational signalling: the durable record of a mail failure, and the alert that carries it to
 * somebody (staff console M1, `docs/TECH_DEBT.md` #100).
 *
 * **Global, and imported before `MailModule`.** `MailModule` builds its transport in a `useFactory`
 * that must inject this service, so the ordering in `AppModule` is load-bearing rather than
 * cosmetic — a global module is still only global once it has been instantiated.
 *
 * Deliberately **not** part of `AuditModule`. A mail failure is an act by a machine, not by a
 * person: it earns no audit row (ADR-0073's durability/blast-radius tests are about acts somebody
 * took), and `AuditService.record()` fails its caller outside a transaction, which is the defect
 * ADR-0073 C4 found in the interchange producer. Keeping the two in separate modules makes reaching
 * for the wrong one an import rather than an autocomplete.
 */
@Global()
@Module({
  providers: [OperationalAlertService],
  exports: [OperationalAlertService],
})
export class OperationalModule {}
