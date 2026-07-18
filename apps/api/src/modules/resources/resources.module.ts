import { Module, forwardRef } from '@nestjs/common';

import { CalendarsModule } from '../calendars/calendars.module';
import { OrganizationsModule } from '../organizations/organizations.module';

import { ResourceAssignmentRepository } from './resource-assignment.repository';
import { ResourceAssignmentService } from './resource-assignment.service';
import { ResourceAssignmentsController } from './resource-assignments.controller';
import { ResourceRepository } from './resource.repository';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

/**
 * Resources module — the org-scoped resource library + the activity↔resource assignment
 * write path (M7.1, ADR-0039). Reuses OrganizationsService (org-scope resolver) and
 * CalendarsModule's CalendarRepository (to validate a resource's own calendar is active +
 * in-org). Resources are a sibling library rather than a hierarchy level, so this module
 * owns its own soft-delete + guards and does not depend on HierarchyModule.
 *
 * CalendarsModule and this module reference each other (this needs CalendarRepository;
 * CalendarsService needs ResourceRepository to extend the CALENDAR_IN_USE guard to count
 * active resources) — a bidirectional module dependency resolved with `forwardRef` on both
 * sides. Exports the two repositories so the M7.2 schedule module can resolve a
 * RESOURCE_DEPENDENT activity's driving assignment + calendar.
 *
 * The assignment write path pen-gates on `PlanEditLockService` (ADR-0028), which is
 * provided by the global `PlanLockModule` — importing that module here would close a
 * `resources → plan-lock → plans → calendars → resources` bootstrap cycle, so the pen
 * is injected globally instead (see `PlanLockModule`'s `@Global`).
 */
@Module({
  imports: [OrganizationsModule, forwardRef(() => CalendarsModule)],
  controllers: [ResourcesController, ResourceAssignmentsController],
  providers: [
    ResourcesService,
    ResourceRepository,
    ResourceAssignmentService,
    ResourceAssignmentRepository,
  ],
  exports: [ResourceRepository, ResourceAssignmentRepository],
})
export class ResourcesModule {}
