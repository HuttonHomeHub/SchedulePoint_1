import { Module } from '@nestjs/common';

import { StaffController } from './staff.controller';
import { StaffGuard } from './staff.guard';

/**
 * The staff console (ADR-0086). Ships dark in M2 — one route, no web surface.
 *
 * It imports **nothing**. That is the module-level statement of the epic's central property: a
 * staff surface that imported `ClientsModule` or `PlansModule` would be reaching customer data, and
 * a structural seam test asserts no file here imports an org-scoped module's service or repository,
 * or the CPM engine. `AppConfigService` and `PrismaService` reach it through global modules.
 */
@Module({
  controllers: [StaffController],
  providers: [StaffGuard],
})
export class StaffModule {}
