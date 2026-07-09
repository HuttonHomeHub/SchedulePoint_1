import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';

import { InvitationRepository } from './invitation.repository';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { OrgInvitationsController } from './org-invitations.controller';

/**
 * Invitations. Depends on the organisations module for the org-scope resolver
 * and the shared `OrgMemberRepository` (accepting an invite creates a member).
 * The `MailService` port is provided globally (MailModule).
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [OrgInvitationsController, InvitationsController],
  providers: [InvitationsService, InvitationRepository],
})
export class InvitationsModule {}
