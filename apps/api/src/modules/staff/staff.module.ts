import { Module } from '@nestjs/common';

import { StaffController } from './staff.controller';
import { StaffGuard } from './staff.guard';
import { VersionService } from '../../version/version.service';

import { StaffBootstrapService } from './staff-bootstrap.service';
import { StaffHealthService } from './staff-health.service';

/**
 * The staff console (ADR-0086). Ships dark in M2 — one route, no web surface.
 *
 * It imports **nothing** — `VersionService` is *provided* rather than imported, because it is a
 * dependency-free leaf that reads `package.json`, and importing `VersionModule` to reach it would
 * spend the property below to save one line. That property is the point: an empty `imports` array
 * is a fact a reader can check in one glance.
 *
 * The original wording of this sentence was true and the code did not match it — `VersionService`
 * was injected without being available, and every e2e suite in the repository failed at module
 * resolution. Nest caught it immediately, which is the argument for constructor injection over a
 * service locator, but the docblock is what should have caught it first.
 * That is the module-level statement of the epic's central property: a
 * staff surface that imported `ClientsModule` or `PlansModule` would be reaching customer data, and
 * a structural seam test asserts no file here imports an org-scoped module's service or repository,
 * or the CPM engine. `AppConfigService` and `PrismaService` reach it through global modules.
 */
@Module({
  controllers: [StaffController],
  providers: [StaffGuard, StaffHealthService, StaffBootstrapService, VersionService],
})
export class StaffModule {}
