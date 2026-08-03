import { Global, Module } from '@nestjs/common';

import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

/**
 * The audit log (ADR-0072, TECH_DEBT #14).
 *
 * **Global**, like `MailModule`, because the producers live in nine different feature modules and
 * an audit call must never be skipped for want of an import. Making each module import this one
 * would give a new feature a reason not to — "it wasn't wired up" is exactly the excuse the
 * coverage gate exists to remove.
 *
 * No controller yet: the read surface arrives with its own DTOs and the `audit:read` guard.
 */
@Global()
@Module({
  providers: [AuditRepository, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
