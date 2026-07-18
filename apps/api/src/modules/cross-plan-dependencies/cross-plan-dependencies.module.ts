import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';

import { ActivityCrossPlanDependenciesController } from './activity-cross-plan-dependencies.controller';
import { CrossPlanDependenciesController } from './cross-plan-dependencies.controller';
import { CrossPlanDependenciesService } from './cross-plan-dependencies.service';
import { CrossPlanDependencyRepository } from './cross-plan-dependency.repository';
import { PlanCrossPlanDependenciesController } from './plan-cross-plan-dependencies.controller';

/**
 * Cross-plan dependencies module — the LIVE inter-project edges of the programme graph (ADR-0045).
 * A sibling of DependenciesModule that spans TWO plans. Reuses OrganizationsService (org-scope
 * resolver), PlansModule's PlanRepository (to scope a plan-list to an active plan), and
 * ActivitiesModule's ActivityRepository (to load and org-scope the two endpoints). Soft-delete is
 * OWNED locally by the repository (a cross-plan edge is not a hierarchy-tree node, so the shared
 * HierarchyLifecycleService does not cover it). PlanEditLockService is injected from the @Global
 * PlanLockModule — do NOT import it here. This module is DARK: nothing consumes the edges yet (the
 * derivation seam + programme recalc are F4/F5).
 */
@Module({
  imports: [OrganizationsModule, PlansModule, ActivitiesModule],
  controllers: [
    CrossPlanDependenciesController,
    PlanCrossPlanDependenciesController,
    ActivityCrossPlanDependenciesController,
  ],
  providers: [CrossPlanDependenciesService, CrossPlanDependencyRepository],
  exports: [CrossPlanDependencyRepository],
})
export class CrossPlanDependenciesModule {}
