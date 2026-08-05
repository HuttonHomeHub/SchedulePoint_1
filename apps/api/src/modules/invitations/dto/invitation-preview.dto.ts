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

  @ApiProperty({
    description:
      'Whether this server refuses an accept from an account with an unverified address ' +
      '(AUTH_REQUIRE_EMAIL_VERIFICATION). The client cannot infer it — with enforcement off every ' +
      'account is unverified, so a client branching on `emailVerified` alone blocks every invitee.',
  })
  requiresEmailVerification!: boolean;

  static from(
    entity: InvitationWithOrg,
    /**
     * The server's own `AUTH_REQUIRE_EMAIL_VERIFICATION`. **Required, not defaulted** — the same
     * reasoning as ADR-0070's `hoursPerDay`: either default is silently wrong half the time, and
     * wrong here means either blocking every invitee or offering an Accept the server will refuse.
     * The compiler makes the caller pass it.
     */
    requiresEmailVerification: boolean,
  ): InvitationPreviewDto {
    return {
      organizationName: entity.organization.name,
      role: entity.role,
      email: entity.email,
      status: entity.status,
      expiresAt: entity.expiresAt.toISOString(),
      requiresEmailVerification,
    };
  }
}
