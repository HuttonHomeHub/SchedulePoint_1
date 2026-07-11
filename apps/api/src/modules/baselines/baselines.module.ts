import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';

import { BaselineRepository } from './baseline.repository';
import { BaselinesController } from './baselines.controller';
import { BaselinesService } from './baselines.service';

/**
 * Baselines module — named plan-of-record snapshots (ADR-0025). Reuses
 * OrganizationsService (org-scope resolver) and PlanRepository (plan lookup); capture
 * takes the shared plan advisory lock directly (no ScheduleModule dependency). Baselines
 * are descendants of a plan, so delete (Task B2) is a service-owned soft-cascade wired
 * into the HierarchyLifecycleService. Exports the repository so the variance read model
 * (Task C1) and the hierarchy cascade can reference baselines.
 */
@Module({
  imports: [OrganizationsModule, PlansModule],
  controllers: [BaselinesController],
  providers: [BaselinesService, BaselineRepository],
  exports: [BaselineRepository],
})
export class BaselinesModule {}
