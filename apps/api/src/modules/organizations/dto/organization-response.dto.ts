import { ApiProperty } from '@nestjs/swagger';
import type { Organization } from '@prisma/client';
import { ORGANIZATION_ROLES } from '@repo/types';
import type { OrganizationSummary } from '@repo/types';

import type { OrganizationRole } from '../../../common/auth/principal';
import type { AppConfigService } from '../../../config/app-config.service';

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
    enum: ORGANIZATION_ROLES,
    description: "The requesting user's role in this organisation.",
  })
  role!: OrganizationRole;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({
    description:
      "Whether the recycle bin's clear-out is switched on for this installation (ADR-0096). " +
      'Installation configuration repeated on each organisation so the shell, which already ' +
      'reads this list, can word a delete confirmation honestly (docs/TECH_DEBT.md #140).',
  })
  retentionActive!: boolean;

  @ApiProperty({ description: "The SERVER's period, in days, a deleted item is kept." })
  retentionDays!: number;

  static from(
    entity: Organization,
    role: OrganizationRole,
    config: Pick<AppConfigService, 'retentionHierarchyEnabled' | 'retentionHierarchyDays'>,
  ): OrganizationResponseDto {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      role,
      createdAt: entity.createdAt.toISOString(),
      retentionActive: config.retentionHierarchyEnabled,
      retentionDays: config.retentionHierarchyDays,
    };
  }
}
