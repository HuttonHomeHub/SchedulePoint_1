import { ApiProperty } from '@nestjs/swagger';
import type { Invitation } from '@prisma/client';
import {
  ORGANIZATION_ROLES,
  type CreatedInvitation,
  type InvitationStatus,
  type InvitationSummary,
  type OrganizationRole,
} from '@repo/types';

const INVITATION_STATUSES: InvitationStatus[] = ['PENDING', 'ACCEPTED', 'REVOKED'];

/** Public representation of an invitation. The token hash is never exposed. */
export class InvitationResponseDto implements InvitationSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: ORGANIZATION_ROLES })
  role!: OrganizationRole;

  @ApiProperty({ enum: INVITATION_STATUSES })
  status!: InvitationStatus;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static from(entity: Invitation): InvitationResponseDto {
    return {
      id: entity.id,
      email: entity.email,
      role: entity.role,
      status: entity.status,
      expiresAt: entity.expiresAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
    };
  }
}

/** The create-invitation response: the summary plus the one-time accept URL. */
export class CreatedInvitationDto extends InvitationResponseDto implements CreatedInvitation {
  @ApiProperty({ description: 'One-time accept URL (also emailed). Show it so onboarding works.' })
  acceptUrl!: string;

  static fromWithUrl(entity: Invitation, acceptUrl: string): CreatedInvitationDto {
    return { ...InvitationResponseDto.from(entity), acceptUrl };
  }
}
