import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { PlanStatus } from '@prisma/client';

import type { BaselineMovement } from '../plan-standing';

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
    format: 'date-time',
    nullable: true,
    description:
      'When this plan’s schedule was last computed, or `null` if it never has been. `null` is a ' +
      'STATE — "never calculated" and "calculated then edited" are different facts a planner acts ' +
      'on differently, so they are not collapsed into one staleness flag.',
  })
  scheduleComputedAt!: string | null;

  @ApiProperty({
    description:
      'Whether the plan has been touched since that computation, so its dates answer an older ' +
      'question. `false` for a plan that has never been calculated — there is no "since" — which ' +
      'that plan reports through a null `scheduleComputedAt` instead.',
  })
  editedSinceCalculated!: boolean;

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
    description:
      'Invitations still awaiting an answer that can still be accepted. Omitted entirely — ' +
      'together with `expiredInvitationCount` — unless the caller may read invitations.',
    example: 2,
  })
  liveInvitationCount?: number;

  @ApiPropertyOptional({
    description:
      'Invitations still marked PENDING whose `expiresAt` has passed. They are listed by ' +
      '`GET …/invitations` and refused by accept, so they need re-sending rather than chasing. ' +
      'A separate count rather than a subtraction: the two are different actions, and a ' +
      'subtraction of two separately-read numbers can go negative under concurrency.',
    example: 1,
  })
  expiredInvitationCount?: number;

  @ApiPropertyOptional({
    description:
      'Omitted entirely unless the caller is a writer AND hierarchy retention is armed ' +
      'on this host. On an unarmed host nothing expires, so a count would be a promise ' +
      'the product does not keep (ADR-0096).',
    example: 1,
  })
  expiringDeletedCount?: number;
}

/**
 * One remembered plan, resolved to its **current** name.
 *
 * It carries no timestamp and no actor: this section answers "where was I?", not "what happened?",
 * and the browser already knows the order it asked in. Adding a "you were here 20 minutes ago"
 * would also be the one fact on this screen the server cannot actually attest to — the store is
 * per-browser, so it would be a claim about a device rather than about the plan.
 */
export class RecentPlanDto {
  @ApiProperty({ format: 'uuid' })
  planId!: string;

  @ApiProperty({ example: 'Northgate — Phase 1' })
  planName!: string;

  @ApiProperty({ example: 'Northgate Quarter' })
  projectName!: string;

  @ApiProperty({ example: 'Bellway Homes' })
  clientName!: string;
}

/** The finish has moved against the active baseline. `workingDays` is signed: positive is later. */
export class MovementMovedDto {
  @ApiProperty({ enum: ['MOVED'], example: 'MOVED' }) kind!: 'MOVED';

  @ApiProperty({
    example: 12,
    description:
      'Signed working days on the PLAN’s calendar, converted with the BASELINE’s frozen ' +
      'hours-per-day factor — the frame the revision comparison already uses (ADR-0125 D4). ' +
      'Positive means the finish is later than the baseline’s.',
  })
  workingDays!: number;

  @ApiProperty({ format: 'date' }) baselineFinish!: string;
  @ApiProperty({ example: 'Contract award' }) baselineName!: string;
}

/** The finish is exactly where the active baseline froze it. */
export class MovementUnchangedDto {
  @ApiProperty({ enum: ['UNCHANGED'], example: 'UNCHANGED' }) kind!: 'UNCHANGED';
  @ApiProperty({ format: 'date' }) baselineFinish!: string;
  @ApiProperty({ example: 'Contract award' }) baselineName!: string;
}

/**
 * There is no movement to report, and the reason says which of five situations this is — each with
 * a different remedy, which is why they are not one absence.
 *
 * **Listed in the order `baselineMovementOf` evaluates them** (`plan-standing.ts`), not
 * alphabetically and not in the order they were added. That function is a ladder — the first
 * condition that holds wins — so the sequence carries information: a plan with no activities is
 * `PLAN_EMPTY` and never `NO_BASELINE`, whatever else is also true of it. The API review of this
 * epic caught the two orders disagreeing, and the reason it is worth a line rather than a shrug is
 * that this file's own comments are unusually careful about ordering being load-bearing, so a
 * reader of the generated Swagger page would reasonably read the enum as the ladder.
 */
export class MovementNotAssessableDto {
  @ApiProperty({ enum: ['NOT_ASSESSABLE'], example: 'NOT_ASSESSABLE' }) kind!: 'NOT_ASSESSABLE';

  @ApiProperty({
    enum: [
      'PLAN_EMPTY',
      'PLAN_NOT_SCHEDULED',
      'NO_BASELINE',
      'BASELINE_HAS_NO_FINISH',
      'CALENDAR_UNUSABLE',
    ],
    example: 'NO_BASELINE',
  })
  reason!:
    | 'PLAN_EMPTY'
    | 'PLAN_NOT_SCHEDULED'
    | 'NO_BASELINE'
    | 'BASELINE_HAS_NO_FINISH'
    | 'CALENDAR_UNUSABLE';
}

/**
 * Where one programme stands: its finish, how far that has moved against what was committed, and
 * what the last recalculation flagged.
 *
 * **Every field here is a column the last recalculation already persisted.** The CPM engine is not
 * invoked to build this — `computeSchedule` is not imported by the read or by the pure derivation
 * beside it, pinned structurally — so the ADR-0034 recalculation parity gate is untouched **by
 * construction** rather than by argument.
 */
@ApiExtraModels(MovementMovedDto, MovementUnchangedDto, MovementNotAssessableDto)
export class PlanStandingDto {
  @ApiProperty({ format: 'uuid' }) planId!: string;
  @ApiProperty({ example: 'Tower B — Substructure' }) planName!: string;
  @ApiProperty({ example: 'Riverside Phase 2' }) projectName!: string;
  @ApiProperty({ example: 'Riverside Developments' }) clientName!: string;
  @ApiProperty({ enum: PlanStatus }) status!: PlanStatus;

  @ApiProperty({
    example: 24,
    description: 'Active activities on the plan. Zero is a real state and is reported as one.',
  })
  activityCount!: number;

  @ApiProperty({
    format: 'date',
    nullable: true,
    description:
      'The latest computed finish across the plan’s active activities (`MAX(early_finish)`), or ' +
      '`null` when the plan has none or was never calculated.',
  })
  projectFinish!: string | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'When this plan’s schedule was last computed, or `null` if it never has been.',
  })
  scheduleComputedAt!: string | null;

  @ApiProperty({
    description: 'The plan has been touched since that calculation, so its figures are behind.',
  })
  editedSinceCalculated!: boolean;

  @ApiProperty({
    description:
      'How far the finish has moved against the active baseline — a three-valued union, never a ' +
      'nullable number. `NOT_ASSESSABLE` carries a reason, because "nothing to measure against" ' +
      'and "has not moved" are different facts a planner acts on differently.',
    oneOf: [
      { $ref: getSchemaPath(MovementMovedDto) },
      { $ref: getSchemaPath(MovementUnchangedDto) },
      { $ref: getSchemaPath(MovementNotAssessableDto) },
    ],
  })
  baselineMovement!: BaselineMovement;

  @ApiProperty({
    description:
      'Engine-flagged counts, with zero-valued keys OMITTED. A row printing four zeroes buries ' +
      'the one that is not zero; absence here means "nothing to report".',
    example: { constraintViolated: 2 },
    additionalProperties: { type: 'integer' },
  })
  flags!: Record<string, number>;
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

  @ApiProperty({
    type: [RecentPlanDto],
    description:
      'The subset of `recentPlanIds` the caller may read, in the order they were sent. Absent ' +
      'ids are absent for indistinguishable reasons — deleted, another organisation’s, ' +
      'unreadable, or never real. Empty when the parameter was not sent.',
  })
  recentPlans!: RecentPlanDto[];

  @ApiProperty({ type: AttentionDto })
  attention!: AttentionDto;

  @ApiPropertyOptional({
    type: [PlanStandingDto],
    description:
      'Where each recently-changed programme stands. **Omitted entirely** — not an empty array — ' +
      'when the caller may not read schedules, because a zero is a fact about the organisation ' +
      'and an absence is a fact about the reader (ADR-0098). Present and empty when the caller ' +
      'may read but there is nothing to stand on. **Ordered: rows carrying any `flags` first, ' +
      'then the `recentlyChanged` order, stable within each group.** The promotion is a boolean ' +
      'rather than a count or a severity — a plan with four conflicts is not more urgent than one ' +
      'with a broken constraint, and the flag kinds are not comparable.',
  })
  planStanding?: PlanStandingDto[];
}
