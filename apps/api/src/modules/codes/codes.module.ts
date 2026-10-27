import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { PlanLockModule } from '../plan-lock/plan-lock.module';
import { PlansModule } from '../plans/plans.module';

import { CodeAssignmentRepository } from './code-assignment.repository';
import { CodeTypeRepository } from './code-type.repository';
import { CodeTypesController } from './code-types.controller';
import { CodeTypesService } from './code-types.service';
import { CodeValueRepository } from './code-value.repository';
import { CodeValuesController } from './code-values.controller';
import { CodeValuesService } from './code-values.service';

/**
 * Codes module (p6-activity-codes spec §4.7) — a plan's code types and their values, the P6 activity
 * codes a planner sorts and groups activities by. Reuses OrganizationsService (org scope),
 * PlansModule's PlanRepository (to load the parent plan) and PlanLockModule's pen gate; every write is
 * structural and pen-gated. **Assignments are not a module of their own**: they are written through an
 * activity write (`ActivityCodesService` in the activities module, which imports the repositories
 * exported here), so the activity's version is their lock and its history records them. A plan,
 * project or client cascade stamps the plan's types and values through the shared
 * HierarchyLifecycleService, not from here.
 */
@Module({
  imports: [OrganizationsModule, PlansModule, PlanLockModule],
  controllers: [CodeTypesController, CodeValuesController],
  providers: [
    CodeTypesService,
    CodeValuesService,
    CodeTypeRepository,
    CodeValueRepository,
    CodeAssignmentRepository,
  ],
  exports: [CodeTypeRepository, CodeValueRepository, CodeAssignmentRepository],
})
export class CodesModule {}
