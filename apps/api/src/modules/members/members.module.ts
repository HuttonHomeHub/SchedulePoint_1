import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';

import { MembersController } from './members.controller';
import { MembersService } from './members.service';

/**
 * Membership management. Depends on the organisations module for the org-scope
 * resolver and the shared `OrgMemberRepository`.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
