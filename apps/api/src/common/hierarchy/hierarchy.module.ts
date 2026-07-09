import { Module } from '@nestjs/common';

import { HierarchyLifecycleService } from './hierarchy-lifecycle.service';

/**
 * Shared hierarchy lifecycle. Exposes {@link HierarchyLifecycleService} — the
 * cascade soft-delete + batch restore mechanics reused by the clients, projects,
 * and plans modules. Kept in one place so the tree logic never diverges.
 */
@Module({
  providers: [HierarchyLifecycleService],
  exports: [HierarchyLifecycleService],
})
export class HierarchyModule {}
