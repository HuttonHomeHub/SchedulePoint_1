import { ApiProperty } from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type {
  MeResponse,
  OrganizationMembershipSummary,
  OrganizationRole,
  SessionUser,
} from '@repo/types';

import type { OrganizationMembership } from '../../../common/auth/principal';

/** The authenticated user's public profile. Credentials are never exposed. */
class SessionUserDto implements SessionUser {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty({ type: String, nullable: true })
  image!: string | null;
}

/** One organisation the user belongs to, with the permissions the role grants. */
class OrganizationMembershipSummaryDto implements OrganizationMembershipSummary {
  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ enum: ['VIEWER', 'CONTRIBUTOR', 'PLANNER', 'ORG_ADMIN'] })
  role!: OrganizationRole;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

/**
 * Response of `GET /api/v1/me`. Combines the persisted user profile with the
 * request principal's resolved organisation memberships (empty until a user
 * joins an organisation — feature B).
 */
export class MeResponseDto implements MeResponse {
  @ApiProperty({ type: SessionUserDto })
  user!: SessionUserDto;

  @ApiProperty({ type: [OrganizationMembershipSummaryDto] })
  memberships!: OrganizationMembershipSummaryDto[];

  static from(user: User, memberships: readonly OrganizationMembership[]): MeResponseDto {
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        image: user.image,
      },
      memberships: memberships.map((membership) => ({
        organizationId: membership.organizationId,
        role: membership.role,
        permissions: [...membership.permissions],
      })),
    };
  }
}
