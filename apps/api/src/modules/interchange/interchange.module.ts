import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { CalendarsModule } from '../calendars/calendars.module';
import { DependenciesModule } from '../dependencies/dependencies.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlanLockModule } from '../plan-lock/plan-lock.module';
import { PlansModule } from '../plans/plans.module';
import { ProjectsModule } from '../projects/projects.module';
import { ResourcesModule } from '../resources/resources.module';
import { ScheduleModule } from '../schedule/schedule.module';

import { ExportService } from './export.service';
import { InterchangeController } from './interchange.controller';
import { InterchangeService } from './interchange.service';
import { PlanExportController } from './plan-export.controller';

/**
 * Schedule-interchange module (ADR-0050, C2). The thin NestJS surface over the pure, engine-free
 * `@repo/interchange` pipeline: it owns HTTP (multipart upload), authorisation, and org-scope, and
 * consumes existing services/repositories for scope resolution and persistence. Reuses
 * OrganizationsService (the `:orgSlug` org-scope resolver) and ProjectsModule's ProjectRepository (to
 * scope the target project to the caller's org, anti-IDOR).
 *
 * The transactional **commit** (Task 1.5) composes the existing PlanRepository / CalendarRepository /
 * ActivityRepository / DependencyRepository — and, from M2 (ADR-0038/0039/0040), the
 * ResourceRepository / ResourceAssignmentRepository (imported via ResourcesModule) — each accepting an
 * injected transaction client, inside one `$transaction` (the same repository-composition pattern the
 * domain services use for atomic multi-row writes), then invokes ScheduleService to recalculate the new
 * plan (the CPM engine is only called, never modified).
 *
 * The uploaded bytes are a **transient, in-memory parse-and-discard buffer**: Multer buffers the file
 * (bounded by the ADR-0050 byte cap), the pure pipeline parses it, and the buffer is dropped when the
 * request ends — it is NEVER persisted to object storage. This is deliberately NOT ADR-0011 durable
 * file storage; the only persisted artefact of an import is the created plan (and, later, an optional
 * import-audit row). MSPDI (M3) and any large-file BullMQ offload (ADR-0009) keep this same property.
 */
@Module({
  imports: [
    OrganizationsModule,
    ProjectsModule,
    PlansModule,
    CalendarsModule,
    ActivitiesModule,
    DependenciesModule,
    ResourcesModule,
    ScheduleModule,
    PlanLockModule,
  ],
  controllers: [InterchangeController, PlanExportController],
  providers: [InterchangeService, ExportService],
})
export class InterchangeModule {}
