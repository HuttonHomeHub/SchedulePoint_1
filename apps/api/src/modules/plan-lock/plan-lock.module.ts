import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';

import { PlanLockController } from './plan-lock.controller';
import { PlanLockRepository } from './plan-lock.repository';
import { PlanEditLockService } from './plan-lock.service';

/**
 * The plan edit-lock module (ADR-0028): the single-editor "pen". Depends on
 * `OrganizationsModule` for scope resolution and `PlansModule` for the plan load;
 * Prisma comes from the global `PrismaModule`. Exports {@link PlanEditLockService}
 * so the structural write modules can inject its `assertHoldsPen` write-gate.
 */
@Module({
  imports: [OrganizationsModule, PlansModule],
  controllers: [PlanLockController],
  providers: [PlanEditLockService, PlanLockRepository],
  exports: [PlanEditLockService],
})
export class PlanLockModule {}
