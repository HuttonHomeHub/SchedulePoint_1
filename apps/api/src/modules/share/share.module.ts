import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';

import { PlanShareRepository } from './plan-share.repository';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';

/**
 * External-Guest share links (Stage F, ADR-0051). F-M2 wires the authenticated MANAGEMENT
 * surface (create / list / revoke, `plan:share`). It reuses OrganizationsService (the
 * `:orgSlug` org-scope resolver) and PlansModule's PlanRepository (to scope the target plan
 * to the caller's org, anti-IDOR), and owns the `PlanShareRepository`.
 *
 * The session-less guest READ path (F-M3) — a `@Public()` controller behind the
 * `ShareTokenGuard`, plus its rate-limiter — is added to this module later. The plan-delete
 * cascade for share links lives in the shared HierarchyLifecycleService (F-M1), not here.
 */
@Module({
  imports: [OrganizationsModule, PlansModule],
  controllers: [ShareController],
  providers: [ShareService, PlanShareRepository],
})
export class ShareModule {}
