import { Global, Module } from '@nestjs/common';

import { HeartbeatService } from './heartbeat.service';
import { OperationalAlertService } from './operational-alert.service';
import { RetentionStatusStore } from './retention-status.store';
import { RetentionSweepRunner } from './retention-sweep.runner';
import { RetentionSweepService } from './retention-sweep.service';

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
  providers: [
    OperationalAlertService,
    HeartbeatService,
    RetentionSweepRunner,
    RetentionStatusStore,
    RetentionSweepService,
  ],
  // `HeartbeatService` is deliberately NOT exported: nothing injects it, it exists for its
  // lifecycle hooks, and exporting it would invite a caller that then has to reason about whether
  // the timer is running — the `MailBootstrapService` precedent.
  // `RetentionSweepService` is NOT exported, for the reason `HeartbeatService` is not: it owns a
  // timer, and handing that to another module would let a controller start, stop or re-run the
  // sweep from a request. The STORE is exported — the staff panel needs what happened, not the
  // schedule.
  //
  // **`RetentionSweepRunner` is not exported either, and briefly was.** It executes the `DELETE`,
  // so exporting it from a `@Global()` module made the one piece the boundary above exists to
  // protect injectable from any controller in the application with no wiring at all — the opposite
  // of the paragraph directly above it. It was exported only to let the API e2e suite drive the
  // delete, and that suite has since demonstrated the right way to reach a non-exported provider:
  // `app.get(Token, { strict: false })`, which searches the container and which a controller cannot
  // do by accident. Raised by the security review.
  exports: [OperationalAlertService, RetentionStatusStore],
})
export class OperationalModule {}
