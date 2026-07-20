import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { CalendarsModule } from '../calendars/calendars.module';
import { DependenciesModule } from '../dependencies/dependencies.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';
import { ProjectsModule } from '../projects/projects.module';
import { ScheduleModule } from '../schedule/schedule.module';

import { InterchangeController } from './interchange.controller';
import { InterchangeService } from './interchange.service';

/**
 * Schedule-interchange module (ADR-0050, C2). The thin NestJS surface over the pure, engine-free
 * `@repo/interchange` pipeline: it owns HTTP (multipart upload), authorisation, and org-scope, and
 * consumes existing services/repositories for scope resolution and persistence. Reuses
 * OrganizationsService (the `:orgSlug` org-scope resolver) and ProjectsModule's ProjectRepository (to
 * scope the target project to the caller's org, anti-IDOR).
 *
 * The transactional **commit** (Task 1.5) composes the existing PlanRepository / CalendarRepository /
 * ActivityRepository / DependencyRepository (each accepts an injected transaction client) inside one
 * `$transaction` — the same repository-composition pattern the domain services use for atomic multi-row
 * writes — then invokes ScheduleService to recalculate the new plan (the CPM engine is only called,
 * never modified).
 */
@Module({
  imports: [
    OrganizationsModule,
    ProjectsModule,
    PlansModule,
    CalendarsModule,
    ActivitiesModule,
    DependenciesModule,
    ScheduleModule,
  ],
  controllers: [InterchangeController],
  providers: [InterchangeService],
})
export class InterchangeModule {}
