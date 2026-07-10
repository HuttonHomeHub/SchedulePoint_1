import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';

import { RecycleBinController } from './recycle-bin.controller';
import { RecycleBinRepository } from './recycle-bin.repository';
import { RecycleBinService } from './recycle-bin.service';

/**
 * Recycle-bin module — a read-only view over the hierarchy's soft-deleted rows.
 * Reuses OrganizationsService (org-scope resolver); restore lives in the
 * per-entity modules, so nothing else is wired here.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [RecycleBinController],
  providers: [RecycleBinService, RecycleBinRepository],
})
export class RecycleBinModule {}
