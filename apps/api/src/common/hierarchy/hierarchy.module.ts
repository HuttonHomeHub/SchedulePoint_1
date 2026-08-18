import { Module } from '@nestjs/common';

import { AuditModule } from '../../modules/audit/audit.module';

import { HierarchyExpiryService } from './hierarchy-expiry.service';
import { HierarchyLifecycleService } from './hierarchy-lifecycle.service';

/**
 * Shared hierarchy lifecycle. Exposes {@link HierarchyLifecycleService} — the
 * cascade soft-delete + batch restore mechanics reused by the clients, projects,
 * and plans modules. Kept in one place so the tree logic never diverges.
 *
 * {@link HierarchyExpiryService} is a provider and deliberately **not** an export: it is a timer,
 * not a capability, and exporting it would make "permanently delete this customer's work" an
 * injectable one import away from any controller. `hierarchy-expiry.structural.spec.ts` pins that.
 */
@Module({
  imports: [AuditModule],
  providers: [HierarchyLifecycleService, HierarchyExpiryService],
  exports: [HierarchyLifecycleService],
})
export class HierarchyModule {}
