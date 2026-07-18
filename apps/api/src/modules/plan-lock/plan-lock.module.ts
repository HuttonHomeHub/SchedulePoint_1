import { Global, Module } from '@nestjs/common';

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
 *
 * `@Global` so the cross-cutting write-gate is injectable everywhere without each
 * write module importing this module. That matters because `PlansModule` pulls in
 * `CalendarsModule`, which `forwardRef`s to `ResourcesModule`; a `ResourcesModule`
 * import of `PlanLockModule` would therefore close a `resources → plan-lock →
 * plans → calendars → resources` module cycle whose eager `@Module`-def-time
 * dereference bootstraps to `undefined`. Registering the pen globally (once, in
 * `AppModule`) breaks that edge rather than papering over it with `forwardRef`.
 */
@Global()
@Module({
  imports: [OrganizationsModule, PlansModule],
  controllers: [PlanLockController],
  providers: [PlanEditLockService, PlanLockRepository],
  exports: [PlanEditLockService],
})
export class PlanLockModule {}
