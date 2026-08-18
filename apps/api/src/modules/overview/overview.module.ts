import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';

import { OverviewController } from './overview.controller';
import { OverviewRepository } from './overview.repository';
import { OverviewService } from './overview.service';

/**
 * Overview module — a read-only projection over the hierarchy, the plan locks and the
 * invitations. It writes nothing and owns no table of its own, so only the org-scope
 * resolver is wired in.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [OverviewController],
  providers: [OverviewService, OverviewRepository],
})
export class OverviewModule {}
