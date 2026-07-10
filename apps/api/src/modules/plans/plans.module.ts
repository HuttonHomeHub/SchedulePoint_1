import { Module } from '@nestjs/common';

import { HierarchyModule } from '../../common/hierarchy/hierarchy.module';
import { CalendarsModule } from '../calendars/calendars.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';

import { PlanRepository } from './plan.repository';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { ProjectPlansController } from './project-plans.controller';

/**
 * Plans module — the leaf level of the Client → Project → Plan hierarchy and the
 * future host of activities and the TSLD. Reuses OrganizationsService (org-scope
 * resolver), ProjectsModule's ProjectRepository (to scope create/list to an
 * active parent project), CalendarsModule's CalendarRepository (to default a new
 * plan to the org's Standard calendar and validate a plan's calendar assignment),
 * and the shared HierarchyLifecycleService (soft-delete + restore; a plan is a
 * leaf, so delete cascades to nothing).
 */
@Module({
  imports: [OrganizationsModule, HierarchyModule, ProjectsModule, CalendarsModule],
  controllers: [ProjectPlansController, PlansController],
  providers: [PlansService, PlanRepository],
  exports: [PlanRepository],
})
export class PlansModule {}
