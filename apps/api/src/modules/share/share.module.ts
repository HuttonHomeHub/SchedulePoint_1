import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { CalendarsModule } from '../calendars/calendars.module';
import { DependenciesModule } from '../dependencies/dependencies.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';
import { ScheduleModule } from '../schedule/schedule.module';

import { PlanShareRepository } from './plan-share.repository';
import { ShareGuestController } from './share-guest.controller';
import { ShareGuestService } from './share-guest.service';
import { ShareTokenGuard } from './share-token.guard';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';

/**
 * External-Guest share links (Stage F, ADR-0051).
 *
 * F-M2 wires the authenticated MANAGEMENT surface (create / list / revoke, `plan:share`),
 * reusing OrganizationsService (the `:orgSlug` org-scope resolver) and PlansModule's
 * PlanRepository (to scope the target plan to the caller's org, anti-IDOR); it owns the
 * `PlanShareRepository`.
 *
 * F-M3 adds the session-less guest READ path: the `@Public()` {@link ShareGuestController}
 * behind the {@link ShareTokenGuard} (registered as a provider so DI can construct it — it
 * depends on PlanShareRepository + PlanRepository), and the {@link ShareGuestService} that
 * reads the token's ONE plan through the existing domain repositories. It imports the domain
 * modules that export those repositories (ActivitiesModule / CalendarsModule /
 * DependenciesModule / ScheduleModule — the same repository-reuse pattern as InterchangeModule),
 * so guest reads compose the existing scoped reads rather than re-implementing them.
 *
 * The plan-delete cascade for share links lives in the shared HierarchyLifecycleService (F-M1),
 * not here.
 */
@Module({
  imports: [
    OrganizationsModule,
    PlansModule,
    ActivitiesModule,
    CalendarsModule,
    DependenciesModule,
    ScheduleModule,
  ],
  controllers: [ShareController, ShareGuestController],
  providers: [ShareService, ShareGuestService, ShareTokenGuard, PlanShareRepository],
})
export class ShareModule {}
