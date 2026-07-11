import { Module } from '@nestjs/common';

import { HierarchyModule } from '../../common/hierarchy/hierarchy.module';
import { ActivitiesModule } from '../activities/activities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlanLockModule } from '../plan-lock/plan-lock.module';
import { PlansModule } from '../plans/plans.module';

import { ActivityDependenciesController } from './activity-dependencies.controller';
import { DependenciesController } from './dependencies.controller';
import { DependenciesService } from './dependencies.service';
import { DependencyRepository } from './dependency.repository';
import { PlanDependenciesController } from './plan-dependencies.controller';

/**
 * Dependencies module — the edges of a plan's schedule network. Reuses
 * OrganizationsService (org-scope resolver), PlansModule's PlanRepository (to
 * scope create/list to an active parent plan), ActivitiesModule's
 * ActivityRepository (to load and plan-scope the two endpoints), and the shared
 * HierarchyLifecycleService (soft-delete; restore comes with the endpoints' batch).
 */
@Module({
  imports: [OrganizationsModule, HierarchyModule, PlansModule, ActivitiesModule, PlanLockModule],
  controllers: [PlanDependenciesController, ActivityDependenciesController, DependenciesController],
  providers: [DependenciesService, DependencyRepository],
  exports: [DependencyRepository],
})
export class DependenciesModule {}
