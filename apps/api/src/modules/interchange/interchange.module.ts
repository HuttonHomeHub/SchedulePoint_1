import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';

import { InterchangeController } from './interchange.controller';
import { InterchangeService } from './interchange.service';

/**
 * Schedule-interchange module (ADR-0050, C2). The thin NestJS surface over the pure, engine-free
 * `@repo/interchange` pipeline: it owns HTTP (multipart upload), authorisation, and org-scope, and
 * consumes existing services for scope resolution. Reuses OrganizationsService (the `:orgSlug`
 * org-scope resolver) and ProjectsModule's ProjectRepository (to scope the target project to the
 * caller's org, anti-IDOR). M1 exposes the stateless dry-run only; the transactional commit (which
 * persists via the hierarchy/activities/dependencies/calendars services + recalculate) lands next.
 */
@Module({
  imports: [OrganizationsModule, ProjectsModule],
  controllers: [InterchangeController],
  providers: [InterchangeService],
})
export class InterchangeModule {}
