import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  CrossPlanChangeReport,
  CrossPlanChangeRow,
  CrossPlanClassAssessment,
  CrossPlanCorrelation,
  CrossPlanCorrelationKey,
  CrossPlanCorrelationRow,
  CrossPlanCriticalPathDelta,
  CrossPlanMovedActivity,
  CrossPlanNotAssessableReason,
  CrossPlanPresenceActivity,
  CrossPlanRevisionCompare,
  CrossPlanRevisionFrame,
  CrossPlanRevisionPlan,
  RevisionChangeClass,
  RevisionNotAssessableReason,
  RevisionSettingsVerdict,
} from '@repo/types';
import {
  REVISION_FREE_CHANGE_CLASSES,
  REVISION_PAID_CHANGE_CLASSES,
  REVISION_NOT_ASSESSABLE_REASONS,
  REVISION_SETTINGS_VERDICTS,
} from '@repo/types';

import {
  RevisionCompletionDto,
  RevisionGhostBarDto,
  RevisionLinkChangeDto,
  RevisionSideDto,
} from './revision-compare.dto';

/**
 * **The cross-plan revision comparison** — a revision of one plan against a revision of another,
 * matched on activity `code`.
 *
 * It is the shipped `RevisionCompareDto` shape with three additions and nothing removed: both plans
 * named, the correlation coverage, and the measurement frame. The sub-DTOs that need no change are
 * **imported, not re-declared** — a second `RevisionGhostBarDto` would put two schemas of one shape
 * in the OpenAPI document and would drift.
 *
 * **Every activity id here is the ANCHOR plan's, or null.** The comparison is anchored in the plan
 * the reader has open — always the `to` side — so a row that exists only in the other plan has no
 * id in the plan being looked at, and inventing one would give a client a reveal control that
 * navigates nowhere (ADR-0082). That nullability is the only difference in the row shapes, and it
 * is why they are declared rather than reused.
 *
 * **The response carries no cost, rate or budget field at any depth**, so one URL produces one
 * document whatever the reader's role — which is what makes it a handover artefact. That is
 * asserted by a structural scan over this file rather than left to a reviewer's eye.
 *
 * **It reports what MOVED and never what CAUSED it.** No `cause`, `contribution` or `rank` field at
 * any depth: attribution was withdrawn on a measurement that found it order-dependent while the
 * total is order-free, so a causal field would be a claim the product measured itself unable to
 * make.
 */

export class CrossPlanRevisionPlanDto implements CrossPlanRevisionPlan {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() projectId!: string;
  @ApiProperty({
    description:
      'Named because with TWO plans on screen the reader can infer neither — and two re-imports ' +
      'of one programme routinely carry the same plan name.',
  })
  projectName!: string;
}

export class CrossPlanRevisionFrameDto implements CrossPlanRevisionFrame {
  @ApiProperty({ description: 'The OLD side’s plan — the frame every movement is measured in.' })
  planId!: string;

  @ApiProperty() planName!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Null when that plan binds no calendar, in which case every day works. Stated rather than ' +
      'omitted: a blank is indistinguishable from a defect.',
  })
  calendarName!: string | null;

  @ApiProperty({
    description:
      'The day↔minute factor the movement is measured with. **Named because two plans need not ' +
      'share one** — same-plan that goes without saying, and here a number with no frame beside ' +
      'it is a number the reader cannot check.',
  })
  hoursPerDayMinutes!: number;
}

export class CrossPlanCorrelationRowDto implements CrossPlanCorrelationRow {
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The ANCHOR plan’s id, or **null** when this row lives only in the other plan. A client ' +
      'omits its activation control rather than shading it: the action does not apply to the ' +
      'object, it is not shut by a state the reader can change.',
  })
  activityId!: string | null;

  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty() name!: string;

  @ApiProperty({
    description:
      'Which plan this row belongs to. "12 unmatched" is two different situations depending on ' +
      'which side they are on.',
  })
  planId!: string;

  @ApiProperty() planName!: string;
}

export class CrossPlanCorrelationDto implements CrossPlanCorrelation {
  @ApiProperty({
    enum: ['CODE'],
    description:
      'What the two plans were matched on. One value today, carried so a reader knows what a ' +
      'match MEANS — two independently imported plans share no ids, only codes.',
  })
  key!: CrossPlanCorrelationKey;

  @ApiProperty({ description: 'Codes present on both sides. Everything below rests on this.' })
  matched!: number;

  @ApiProperty({
    description:
      'Coded rows in the OLD plan with no counterpart. Removed — **or re-coded**, which is ' +
      'indistinguishable from removal when matching on code, and a client must say so.',
  })
  fromUnmatched!: number;

  @ApiProperty({
    description: 'Coded rows in the NEW plan with no counterpart. Added, or re-coded.',
  })
  toUnmatched!: number;

  @ApiProperty({
    description:
      'Rows with no code at all. **Neither added nor removed** — the product does not know which, ' +
      'and silence would be an absence a reader cannot distinguish from a fact.',
  })
  fromUncoded!: number;

  @ApiProperty() toUncoded!: number;

  @ApiProperty({
    type: [CrossPlanCorrelationRowDto],
    description:
      'The unmatched OLD rows themselves, capped at `cap` with `fromUnmatched` as the true total ' +
      'beside them. Carried so the reader can SEE what was left out rather than be told a number.',
  })
  fromUnmatchedRows!: readonly CrossPlanCorrelationRowDto[];

  @ApiProperty({ type: [CrossPlanCorrelationRowDto] })
  toUnmatchedRows!: readonly CrossPlanCorrelationRowDto[];

  @ApiProperty({
    type: [CrossPlanCorrelationRowDto],
    description:
      'Uncoded rows from BOTH sides, each naming its plan, within the same `cap` — which is ' +
      'SPLIT between the sides rather than filled from the old side first, so a side with more ' +
      'than `cap` uncoded rows can never crowd the other out of the sample entirely. A side that ' +
      'cannot fill its half yields the remainder, so a one-sided population still shows `cap` ' +
      'rows. The true totals are `fromUncoded` and `toUncoded`.',
  })
  uncodedRows!: readonly CrossPlanCorrelationRowDto[];

  @ApiProperty({ description: 'The server’s cap — carried so a client never holds a second copy.' })
  cap!: number;
}

export class CrossPlanMovedActivityDto implements CrossPlanMovedActivity {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The ANCHOR plan’s id, or null when the row lives only in the other plan.',
  })
  activityId!: string | null;

  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: Number }) fromTotalFloatDays!: number | null;
  @ApiProperty({ nullable: true, type: Number }) toTotalFloatDays!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      '`to − from`, or **null** when either side is unknown. Absence and zero are different facts ' +
      'and this payload never collapses them.',
  })
  floatMovementDays!: number | null;

  @ApiProperty({ nullable: true, type: String }) fromEarlyStart!: string | null;
  @ApiProperty({ nullable: true, type: String }) toEarlyStart!: string | null;
  @ApiProperty({ nullable: true, type: String }) fromEarlyFinish!: string | null;
  @ApiProperty({ nullable: true, type: String }) toEarlyFinish!: string | null;

  @ApiProperty({
    description:
      'Whether this row’s code is in the ANCHOR plan — which is what decides whether a client may ' +
      'offer to reveal it.',
  })
  existsLive!: boolean;
}

export class CrossPlanPresenceActivityDto implements CrossPlanPresenceActivity {
  @ApiProperty({ nullable: true, type: String }) activityId!: string | null;
  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty() name!: string;

  @ApiProperty({
    description: 'Its criticality on the side it exists on — a fact, not a movement.',
  })
  isCritical!: boolean;

  @ApiProperty() existsLive!: boolean;
}

export class CrossPlanChangeRowDto implements CrossPlanChangeRow {
  @ApiProperty({ nullable: true, type: String }) activityId!: string | null;

  @ApiProperty({
    description:
      'What the row is ABOUT, unique within its class — the key to render it under. Cross-plan ' +
      'this is the correlation key (the code, or the encoded edge triple), never a plan-local id.',
  })
  subjectId!: string;

  @ApiProperty({ enum: [...REVISION_FREE_CHANGE_CLASSES, ...REVISION_PAID_CHANGE_CLASSES] })
  changeClass!: RevisionChangeClass;

  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) from!: string | null;
  @ApiProperty({ nullable: true, type: String }) to!: string | null;
  @ApiProperty({ nullable: true, type: String }) orderKey!: string | null;
  @ApiProperty() existsLive!: boolean;
}

export class CrossPlanClassAssessmentDto implements CrossPlanClassAssessment {
  @ApiProperty({ enum: [...REVISION_FREE_CHANGE_CLASSES, ...REVISION_PAID_CHANGE_CLASSES] })
  changeClass!: RevisionChangeClass;

  @ApiProperty({
    nullable: true,
    enum: REVISION_NOT_ASSESSABLE_REASONS,
    description:
      'Null when assessed; a reason when it could not be. **NEVER read a reason as "no changes"** ' +
      '— `rows` is empty and `total` is zero in both states, and only this field separates them.',
  })
  notAssessableReason!: RevisionNotAssessableReason | null;

  @ApiProperty({ type: [CrossPlanChangeRowDto] }) rows!: readonly CrossPlanChangeRowDto[];
  @ApiProperty() total!: number;
}

export class CrossPlanChangeReportDto implements CrossPlanChangeReport {
  @ApiProperty({
    type: [CrossPlanClassAssessmentDto],
    description:
      'EVERY class, assessed or not — total over the vocabulary, so a class is never simply ' +
      'missing. A reader who cannot find a class concludes nothing changed in it.',
  })
  classes!: readonly CrossPlanClassAssessmentDto[];

  @ApiProperty() cap!: number;
}

export class CrossPlanCriticalPathDeltaDto implements CrossPlanCriticalPathDelta {
  @ApiProperty({ type: [CrossPlanMovedActivityDto] })
  entered!: readonly CrossPlanMovedActivityDto[];

  @ApiProperty({ type: [CrossPlanMovedActivityDto] }) left!: readonly CrossPlanMovedActivityDto[];
  @ApiProperty() enteredTotal!: number;
  @ApiProperty() leftTotal!: number;
  @ApiProperty() cap!: number;
  @ApiProperty() remainedCriticalCount!: number;
  @ApiProperty() remainedNonCriticalCount!: number;

  @ApiProperty({
    type: [CrossPlanPresenceActivityDto],
    description:
      'Present only in the NEW plan. **Appearing is not entering** — and cross-plan a row here may ' +
      'equally be one that was RE-CODED, which the correlation block states rather than hides.',
  })
  added!: readonly CrossPlanPresenceActivityDto[];

  @ApiProperty({ type: [CrossPlanPresenceActivityDto] })
  removed!: readonly CrossPlanPresenceActivityDto[];

  @ApiProperty() addedTotal!: number;
  @ApiProperty() removedTotal!: number;
  @ApiProperty() noCriticalPath!: boolean;

  @ApiProperty({
    enum: ['SIDE_NOT_SCHEDULED', 'NO_COMMON_CODES'],
    nullable: true,
    description:
      'Why the criticality delta cannot be stated, or null when it can. Carried HERE as well as at ' +
      'the top level, and that is not redundancy: a consumer reading only this block would ' +
      'otherwise see four empty sets and a null reason, which reads as "assessed, and nothing ' +
      'changed" on a pair that was never assessed at all.',
  })
  notAssessableReason!: 'SIDE_NOT_SCHEDULED' | 'NO_COMMON_CODES' | null;
}

export class CrossPlanRevisionCompareDto implements CrossPlanRevisionCompare {
  @ApiProperty({ type: CrossPlanRevisionPlanDto }) fromPlan!: CrossPlanRevisionPlanDto;

  @ApiProperty({
    type: CrossPlanRevisionPlanDto,
    description: 'The NEW side’s plan — **the anchor**. Every id in this response resolves here.',
  })
  toPlan!: CrossPlanRevisionPlanDto;

  @ApiProperty({ type: RevisionSideDto }) from!: RevisionSideDto;
  @ApiProperty({ type: RevisionSideDto }) to!: RevisionSideDto;
  @ApiProperty() dayFactorMinutes!: number;
  @ApiProperty({ type: CrossPlanRevisionFrameDto }) frame!: CrossPlanRevisionFrameDto;

  @ApiProperty({
    enum: REVISION_SETTINGS_VERDICTS,
    description:
      'Whether both sides’ numbers came from the same criticality RULE. **Three-valued, and ' +
      'UNKNOWN must never be rendered as MATCH.**',
  })
  settingsVerdict!: RevisionSettingsVerdict;

  @ApiProperty({
    type: CrossPlanCorrelationDto,
    description:
      'How well the two plans matched. **Render this BEFORE anything derived from it** — every ' +
      'number below is worth exactly what this block says it is.',
  })
  correlation!: CrossPlanCorrelationDto;

  @ApiProperty({
    enum: ['NO_COMMON_CODES'],
    nullable: true,
    description:
      'Non-null ⇒ no comparison was possible and every derived block is empty. `NO_COMMON_CODES` ' +
      'is a **200, not a 422**: the question was well formed and the answer is a fact about the ' +
      'data. Running the delta anyway would report every old activity as removed and every new ' +
      'one as added — each row technically true and the picture a lie.',
  })
  notAssessableReason!: CrossPlanNotAssessableReason | null;

  @ApiProperty({ type: RevisionCompletionDto }) completion!: RevisionCompletionDto;

  @ApiProperty({ type: CrossPlanCriticalPathDeltaDto })
  criticalPath!: CrossPlanCriticalPathDeltaDto;

  @ApiPropertyOptional({
    type: CrossPlanChangeReportDto,
    description: 'The change list — present ONLY with `?include=changes`.',
  })
  changes?: CrossPlanChangeReportDto | undefined;

  @ApiPropertyOptional({
    type: [RevisionGhostBarDto],
    description:
      'The change picture’s geometry, present ONLY with `?include=ghosts`. **Cross-plan, ' +
      '`laneIndex` is the ANCHOR plan’s** — two independently imported plans do not share a lane ' +
      'space, so the old side’s index would place a bar somewhere arbitrary. Work that has no ' +
      'honest lane is counted in `ghostsUndrawable` and drawn nowhere.',
  })
  ghosts?: readonly RevisionGhostBarDto[] | undefined;

  @ApiPropertyOptional({ description: 'Changed bars found BEFORE the cap.' })
  ghostsTotal?: number | undefined;

  @ApiPropertyOptional({
    description:
      'Changed activities the overlay CANNOT draw. A fact a client must render: a diagram has no ' +
      '"showing N of M", so a picture quietly missing rows is unnoticeable.',
  })
  ghostsUndrawable?: number | undefined;

  @ApiPropertyOptional({ type: [RevisionLinkChangeDto], description: 'The changed logic.' })
  links?: readonly RevisionLinkChangeDto[] | undefined;

  @ApiPropertyOptional({ description: 'Changed links found BEFORE the cap.' })
  linksTotal?: number | undefined;

  @ApiPropertyOptional({ description: 'Changed links with an endpoint not in the anchor plan.' })
  linksUndrawable?: number | undefined;

  /**
   * A naming boundary, not a mapping one — the same trade the sibling DTO documents.
   *
   * What is load-bearing is the SERVICE's typed object literal: `implements` constrains the floor
   * (this class cannot be missing or mistype a member) and says nothing about the ceiling.
   *
   * **The excess-property check covers less than the sibling's docblock claims, and this says so.**
   * TypeScript rejects an extra key in an object literal assigned to a declared type, and in each
   * branch of a ternary assigned as a property value — so `criticalPath` and the required fields
   * are covered. It does **not** fire inside `...(cond ? { … } : {})`, which is how `changes`,
   * `ghosts`/`ghostsTotal`/`ghostsUndrawable` and `links`/`linksTotal`/`linksUndrawable` are
   * attached. Demonstrated by compiling the shape rather than reasoned about (M4 api review), and
   * inherited unchanged from the shipped route, which uses the same idiom under the same claim.
   *
   * What genuinely covers those seven fields is the **G4-style scan** over this file and the
   * service's method slice: it reads source text, so a spread branch is not a hiding place for the
   * concrete harm the check is invoked against — a cost-shaped field making a handover artefact
   * role-dependent.
   */
  static from(model: CrossPlanRevisionCompare): CrossPlanRevisionCompareDto {
    return model;
  }
}
