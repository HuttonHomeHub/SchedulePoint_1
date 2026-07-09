import { Module } from '@nestjs/common';

import { HierarchyModule } from '../../common/hierarchy/hierarchy.module';
import { OrganizationsModule } from '../organizations/organizations.module';

import { ClientRepository } from './client.repository';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

/**
 * Clients module — the top level of the Client → Project → Plan hierarchy.
 * Reuses OrganizationsService (org-scope resolver) and the shared
 * HierarchyLifecycleService (cascade soft-delete + restore). Exports the
 * repository so the projects module can scope reads to a client.
 */
@Module({
  imports: [OrganizationsModule, HierarchyModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientRepository],
  exports: [ClientRepository],
})
export class ClientsModule {}
