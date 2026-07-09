import { ApiProperty } from '@nestjs/swagger';
import type { Organization } from '@prisma/client';
import type { OrganizationSummary } from '@repo/types';

import type { OrganizationRole } from '../../../common/auth/principal';

/**
 * Public representation of an organisation, including the caller's role in it.
 * Internal/audit columns (`version`, `deletedAt`, `createdBy`, `updatedBy`) are
 * intentionally not exposed.
 */
export class OrganizationResponseDto implements OrganizationSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({
    enum: ['VIEWER', 'CONTRIBUTOR', 'PLANNER', 'ORG_ADMIN'],
    description: "The requesting user's role in this organisation.",
  })
  role!: OrganizationRole;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  static from(entity: Organization, role: OrganizationRole): OrganizationResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      role,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
