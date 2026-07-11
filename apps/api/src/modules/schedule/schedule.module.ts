import { Module } from '@nestjs/common';

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
 */
@Module({
  imports: [OrganizationsModule, PlansModule, PlanLockModule],
  controllers: [ScheduleController],
  providers: [ScheduleService, ScheduleRepository],
  exports: [ScheduleService],
})
export class ScheduleModule {}
