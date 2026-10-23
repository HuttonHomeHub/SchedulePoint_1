import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { PlanLockModule } from '../plan-lock/plan-lock.module';
import { PlansModule } from '../plans/plans.module';

import { SwimlaneRepository } from './swimlane.repository';
import { SwimlanesController } from './swimlanes.controller';
import { SwimlanesService } from './swimlanes.service';

/**
 * Swimlanes module (swimlanes spec §4.12) — a plan's hand-made, labelled bands of lanes. Reuses
 * OrganizationsService (org scope), PlansModule's PlanRepository (to load the parent plan) and
 * PlanLockModule's pen gate; every write is structural and pen-gated. A plan, project or client
 * cascade stamps the plan's swimlanes through the shared HierarchyLifecycleService, not from here.
 */
@Module({
  imports: [OrganizationsModule, PlansModule, PlanLockModule],
  controllers: [SwimlanesController],
  providers: [SwimlanesService, SwimlaneRepository],
  exports: [SwimlaneRepository],
})
export class SwimlanesModule {}
