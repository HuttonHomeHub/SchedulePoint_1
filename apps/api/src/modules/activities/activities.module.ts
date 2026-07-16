import { Module } from '@nestjs/common';

import { HierarchyModule } from '../../common/hierarchy/hierarchy.module';
import { CalendarsModule } from '../calendars/calendars.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlanLockModule } from '../plan-lock/plan-lock.module';
import { PlansModule } from '../plans/plans.module';

import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';
import { ActivityRepository } from './activity.repository';
import { PlanActivitiesController } from './plan-activities.controller';

/**
 * Activities module — the leaf of the Client → Project → Plan → Activity
 * hierarchy and the atomic unit of a schedule. Reuses OrganizationsService
 * (org-scope resolver), PlansModule's PlanRepository (to scope create/list to an
 * active parent plan), and the shared HierarchyLifecycleService (soft-delete +
 * restore; an activity is a leaf, so delete cascades to nothing).
 */
@Module({
  imports: [OrganizationsModule, HierarchyModule, PlansModule, PlanLockModule, CalendarsModule],
  controllers: [PlanActivitiesController, ActivitiesController],
  providers: [ActivitiesService, ActivityRepository],
  exports: [ActivityRepository],
})
export class ActivitiesModule {}
