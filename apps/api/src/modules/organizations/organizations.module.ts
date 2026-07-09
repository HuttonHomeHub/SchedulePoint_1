import { Module } from '@nestjs/common';

import { OrgMemberRepository } from './org-member.repository';
import { OrganizationRepository } from './organization.repository';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * Organisations module — the tenancy core. Exports the service (its
 * `resolveScope` is the reusable org-scope resolver) and the repositories so the
 * members and invitations features can reuse them without duplicating data access.
 */
@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationRepository, OrgMemberRepository],
  exports: [OrganizationsService, OrganizationRepository, OrgMemberRepository],
})
export class OrganizationsModule {}
