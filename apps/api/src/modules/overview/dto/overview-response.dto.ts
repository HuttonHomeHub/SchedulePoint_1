import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { PlanStatus } from '@prisma/client';

/**
 * Who made a change.
 *
 * A **discriminated union, not a nullable string** — deliberately. "Sarah", "somebody who
 * has left this organisation" and "we do not know" are three different facts, and a
 * nullable name collapses the last two into an absence a reader cannot tell from a bug.
 * That is the ADR-0073 C3.1 finding in miniature: absence a reader cannot distinguish
 * from a fact is the defect, not the missing name.
 */
export class ActorMemberDto {
  @ApiProperty({ enum: ['MEMBER'], example: 'MEMBER' })
  kind!: 'MEMBER';

  @ApiProperty({ example: 'Sarah Okonkwo' })
  name!: string;
}

/** The id resolved to nobody in this organisation's current membership. */
export class ActorFormerMemberDto {
  @ApiProperty({ enum: ['FORMER_MEMBER'], example: 'FORMER_MEMBER' })
  kind!: 'FORMER_MEMBER';
}

/** The winning row carried no `updated_by` at all (a pre-attribution or system write). */
export class ActorUnknownDto {
  @ApiProperty({ enum: ['UNKNOWN'], example: 'UNKNOWN' })
  kind!: 'UNKNOWN';
}

export type OverviewActor = ActorMemberDto | ActorFormerMemberDto | ActorUnknownDto;

@ApiExtraModels(ActorMemberDto, ActorFormerMemberDto, ActorUnknownDto)
export class RecentlyChangedPlanDto {
  @ApiProperty({ format: 'uuid' }) planId!: string;
  @ApiProperty({ example: 'Tower B — Substructure' }) planName!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty({ example: 'Riverside Phase 2' }) projectName!: string;
  @ApiProperty({ example: 'Riverside Developments' }) clientName!: string;
  @ApiProperty({ enum: PlanStatus }) status!: PlanStatus;

  @ApiProperty({
    format: 'date-time',
    description:
      'The latest of the plan row, its newest activity and its newest dependency — not ' +
      '`plans.updated_at`, which does not move when an activity is edited.',
  })
  changedAt!: string;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(ActorMemberDto) },
      { $ref: getSchemaPath(ActorFormerMemberDto) },
      { $ref: getSchemaPath(ActorUnknownDto) },
    ],
  })
  changedBy!: OverviewActor;
}

@ApiExtraModels(ActorMemberDto, ActorFormerMemberDto, ActorUnknownDto)
export class HeldLockDto {
  @ApiProperty({ format: 'uuid' }) planId!: string;
  @ApiProperty({ example: 'Tower B — Substructure' }) planName!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'The peer waiting for this pen, or null when nobody has asked for it.',
    oneOf: [
      { $ref: getSchemaPath(ActorMemberDto) },
      { $ref: getSchemaPath(ActorFormerMemberDto) },
      { $ref: getSchemaPath(ActorUnknownDto) },
    ],
  })
  requestedBy!: OverviewActor | null;
}

/**
 * The things waiting on this reader.
 *
 * **The two counts are omitted for readers who may not see them, never sent as `0`.** A
 * zero is a fact about the organisation; an absence is a fact about the reader. Sending
 * `0` to a Contributor would tell them there is an answer they are not allowed to have.
 */
export class AttentionDto {
  @ApiProperty({ type: [HeldLockDto] })
  heldLocks!: HeldLockDto[];

  @ApiPropertyOptional({
    description: 'Omitted entirely unless the caller may read invitations.',
    example: 2,
  })
  pendingInvitationCount?: number;

  @ApiPropertyOptional({
    description:
      'Omitted entirely unless the caller is a writer AND hierarchy retention is armed ' +
      'on this host. On an unarmed host nothing expires, so a count would be a promise ' +
      'the product does not keep (ADR-0096).',
    example: 1,
  })
  expiringDeletedCount?: number;
}

export class OverviewResponseDto {
  @ApiProperty({ example: 'Acme Construction' })
  organisationName!: string;

  @ApiProperty({ description: 'No active clients — the organisation has not been set up yet.' })
  isNewOrganisation!: boolean;

  @ApiProperty({ description: 'Any active, non-archived plan exists.' })
  hasPlans!: boolean;

  @ApiProperty({ type: [RecentlyChangedPlanDto] })
  recentlyChanged!: RecentlyChangedPlanDto[];

  @ApiProperty({ type: AttentionDto })
  attention!: AttentionDto;
}
