import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';

import { ScheduleRepository } from './schedule.repository';
import { ScheduleService } from './schedule.service';

/**
 * The CPM schedule module (M6, ADR-0022): recalculate a plan's schedule and read
 * its summary. Depends on `OrganizationsModule` for scope resolution and
 * `PlansModule` for the plan load; Prisma comes from the global `PrismaModule`.
 * The HTTP surface (the recalculate endpoint) is added in Task B2.
 */
@Module({
  imports: [OrganizationsModule, PlansModule],
  providers: [ScheduleService, ScheduleRepository],
  exports: [ScheduleService],
})
export class ScheduleModule {}
