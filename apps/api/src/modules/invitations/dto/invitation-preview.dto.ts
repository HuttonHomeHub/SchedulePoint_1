import { ApiProperty } from '@nestjs/swagger';
import {
  ORGANIZATION_ROLES,
  type InvitationPreview,
  type InvitationStatus,
  type OrganizationRole,
} from '@repo/types';

import type { InvitationWithOrg } from '../invitation.repository';

/** Minimal, token-gated view of an invitation shown before accepting. */
export class InvitationPreviewDto implements InvitationPreview {
  @ApiProperty()
  organizationName!: string;

  @ApiProperty({ enum: ORGANIZATION_ROLES })
  role!: OrganizationRole;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REVOKED'] })
  status!: InvitationStatus;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  static from(entity: InvitationWithOrg): InvitationPreviewDto {
    return {
      organizationName: entity.organization.name,
      role: entity.role,
      email: entity.email,
      status: entity.status,
      expiresAt: entity.expiresAt.toISOString(),
    };
  }
}
