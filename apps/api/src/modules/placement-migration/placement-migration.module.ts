import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';

import { PlacementMigrationController } from './placement-migration.controller';
import { PlacementMigrationRepository } from './placement-migration.repository';
import { PlacementMigrationService } from './placement-migration.service';

/**
 * The placement-migration report (one-planning-surface M-I).
 *
 * Depends on `OrganizationsModule` for scope resolution and `PlansModule` for the plan load, like
 * every other plan-nested read; Prisma comes from the global `PrismaModule`. It exports nothing —
 * no other module has any business reading this table, and the day one does is the day to ask why.
 */
@Module({
  imports: [OrganizationsModule, PlansModule],
  controllers: [PlacementMigrationController],
  providers: [PlacementMigrationService, PlacementMigrationRepository],
})
export class PlacementMigrationModule {}
