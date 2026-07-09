import { Module } from '@nestjs/common';

import { HierarchyModule } from '../../common/hierarchy/hierarchy.module';
import { ClientsModule } from '../clients/clients.module';
import { OrganizationsModule } from '../organizations/organizations.module';

import { ClientProjectsController } from './client-projects.controller';
import { ProjectRepository } from './project.repository';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * Projects module — the middle level of the Client → Project → Plan hierarchy.
 * Reuses OrganizationsService (org-scope resolver), ClientsModule's
 * ClientRepository (to scope create/list to an active parent client), and the
 * shared HierarchyLifecycleService (cascade soft-delete + restore). Exports the
 * repository so the plans module can scope reads to a project.
 */
@Module({
  imports: [OrganizationsModule, HierarchyModule, ClientsModule],
  controllers: [ClientProjectsController, ProjectsController],
  providers: [ProjectsService, ProjectRepository],
  exports: [ProjectRepository],
})
export class ProjectsModule {}
