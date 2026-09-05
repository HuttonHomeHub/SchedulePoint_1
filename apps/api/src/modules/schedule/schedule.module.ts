import { Module } from '@nestjs/common';

import { BaselinesModule } from '../baselines/baselines.module';
import { CalendarRepository } from '../calendars/calendar.repository';
import { CrossPlanDependenciesModule } from '../cross-plan-dependencies/cross-plan-dependencies.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlanLockModule } from '../plan-lock/plan-lock.module';
import { PlansModule } from '../plans/plans.module';

import { ScheduleController } from './schedule.controller';
import { ScheduleRepository } from './schedule.repository';
import { ScheduleService } from './schedule.service';

/**
 * The CPM schedule module (M6, ADR-0022): recalculate a plan's schedule and read
 * its summary. Depends on `OrganizationsModule` for scope resolution and
 * `PlansModule` for the plan load; Prisma comes from the global `PrismaModule`.
 * `CrossPlanDependenciesModule` supplies the `CrossPlanDependencyRepository` the
 * recalc reads to derive live inter-project bounds (F4, ADR-0045 §2).
 */
@Module({
  // BaselinesModule exports BaselineRepository, which the revision comparison reads BOTH sides
  // through (revision M1). It imports OrganizationsModule and PlansModule only, so there is no cycle.
  imports: [
    OrganizationsModule,
    PlansModule,
    PlanLockModule,
    CrossPlanDependenciesModule,
    BaselinesModule,
  ],
  controllers: [ScheduleController],
  // CalendarRepository: the recalculation persists float in DAYS, and the factor comes from
  // each activity's own calendar (ADR-0068 §3a).
  providers: [ScheduleService, ScheduleRepository, CalendarRepository],
  // ScheduleRepository is exported so the External-Guest read path (ADR-0051 F-M3) can read a
  // plan's persisted schedule summary (`summarise`) without a Principal — a pure persisted-column
  // read, no engine invocation.
  exports: [ScheduleService, ScheduleRepository],
})
export class ScheduleModule {}
