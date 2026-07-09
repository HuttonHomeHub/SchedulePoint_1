import { ApiProperty } from '@nestjs/swagger';
import { ORGANIZATION_ROLES, type OrganizationRole, type OrgMemberSummary } from '@repo/types';

import type { OrgMemberWithUser } from '../../organizations/org-member.repository';

class MemberUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty()
  name!: string;
}

/** Public representation of an organisation member (membership + user profile). */
export class MemberResponseDto implements OrgMemberSummary {
  @ApiProperty({ format: 'uuid', description: 'The membership id (not the user id).' })
  id!: string;

  @ApiProperty({ type: MemberUserDto })
  user!: MemberUserDto;

  @ApiProperty({ enum: ORGANIZATION_ROLES })
  role!: OrganizationRole;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  static from(entity: OrgMemberWithUser): MemberResponseDto {
    return {
      id: entity.id,
      user: {
        id: entity.user.id,
        email: entity.user.email,
        name: entity.user.name,
      },
      role: entity.role,
      joinedAt: entity.createdAt.toISOString(),
      version: entity.version,
    };
  }
}
