import { Module } from '@nestjs/common';

import { VersionModule } from '../../version/version.module';
import { OrganizationsModule } from '../organizations/organizations.module';

import { OrganizationExportController } from './organization-export.controller';
import { OrganizationExportRepository } from './organization-export.repository';
import { OrganizationExportService } from './organization-export.service';

/**
 * The whole-organisation export (ADR-0194). Reads through its own repository inside one read-only
 * snapshot; the audit service is global, and the organisation scope resolver comes from the
 * organisations module like every `:orgSlug` route. Nothing here is exported: no other module
 * reads the export.
 */
@Module({
  imports: [OrganizationsModule, VersionModule],
  controllers: [OrganizationExportController],
  providers: [OrganizationExportService, OrganizationExportRepository],
})
export class OrganizationExportModule {}
