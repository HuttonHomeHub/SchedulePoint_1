import { Module } from '@nestjs/common';

import { BaselinesModule } from '../baselines/baselines.module';
import { OrganizationsModule } from '../organizations/organizations.module';

import { OverviewController } from './overview.controller';
import { OverviewRepository } from './overview.repository';
import { OverviewService } from './overview.service';

/**
 * Overview module — a read-only projection over the hierarchy, the plan locks, the invitations
 * and each recently-changed plan's standing. It writes nothing and owns no table of its own.
 */
@Module({
  // BaselinesModule exports `BaselineRepository` ALONE, which is why it is imported here rather
  // than ScheduleModule: the standing section needs one calendar loader and has no business with
  // `ScheduleService`. Reusing that loader rather than writing a third copy of the same
  // projection is the ADR-0065/ADR-0121 rule (two implementations drift, and the drift is
  // invisible because each looks right alone).
  imports: [OrganizationsModule, BaselinesModule],
  controllers: [OverviewController],
  providers: [OverviewService, OverviewRepository],
})
export class OverviewModule {}
