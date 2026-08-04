import { Global, Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';

import { AuditReadService } from './audit-read.service';
import { OrganizationAuditController, SelfAuditController } from './audit.controller';
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
 * The read surface is a SEPARATE service (`AuditReadService`) and is not exported: `AuditService`
 * is what nine modules inject to write, and hanging a read on it would put "list somebody's
 * history" on an object every producer holds.
 */
@Global()
@Module({
  imports: [OrganizationsModule],
  controllers: [OrganizationAuditController, SelfAuditController],
  providers: [AuditRepository, AuditService, AuditReadService],
  exports: [AuditService],
})
export class AuditModule {}
