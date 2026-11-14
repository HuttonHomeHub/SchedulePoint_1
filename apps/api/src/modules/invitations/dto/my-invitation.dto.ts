import { ApiProperty } from '@nestjs/swagger';
import { ORGANIZATION_ROLES, type MyInvitation, type OrganizationRole } from '@repo/types';

import type { InvitationWithOrg } from '../invitation.repository';

/**
 * An invitation as its addressee sees it after confirming their address (ADR-0221). No token (the
 * server does not hold it), no inviter, no email (it is the caller's own).
 */
export class MyInvitationDto implements MyInvitation {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  organizationName!: string;

  @ApiProperty({ enum: ORGANIZATION_ROLES })
  role!: OrganizationRole;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  static from(entity: InvitationWithOrg): MyInvitationDto {
    return {
      id: entity.id,
      organizationName: entity.organization.name,
      role: entity.role,
      expiresAt: entity.expiresAt.toISOString(),
    };
  }
}
