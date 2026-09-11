import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  RevisionChangeClass,
  RevisionChangeReport,
  RevisionChangeRow,
  RevisionClassAssessment,
  RevisionCompare,
  RevisionCompletion,
  RevisionCompletionReason,
  RevisionCriticalPathDelta,
  RevisionGhostBar,
  RevisionLinkChange,
  RevisionMovedActivity,
  RevisionNotAssessableReason,
  RevisionPresenceActivity,
  RevisionSettingsVerdict,
  RevisionSide,
  RevisionSideKind,
} from '@repo/types';
import {
  REVISION_COMPLETION_REASONS,
  REVISION_FREE_CHANGE_CLASSES,
  REVISION_PAID_CHANGE_CLASSES,
  REVISION_LINK_STATES,
  REVISION_NOT_ASSESSABLE_REASONS,
  REVISION_SETTINGS_VERDICTS,
  REVISION_SIDE_KINDS,
} from '@repo/types';

/**
 * The revision comparison (ADR-0125, revision M1).
 *
 * **It reports what MOVED and never what CAUSED it.** There is deliberately no `cause`, `class`,
 * `contribution`, `rank` or `interaction` field at any depth, and a structural gate over the delta
 * module bans those names — attribution was withdrawn on a measurement that found it order-
 * dependent while the total is order-free, so a causal field here would be a claim the product
 * measured itself unable to make.
 *
 * The response carries **no cost, rate or budget field at any depth**, so it does not vary by role:
 * one URL produces one document, which is what makes it a handover artefact. Unlike the health
 * report that invariance needs no gate here — there is no cost-shaped field to withhold, so it is
 * structural rather than defended.
 *
 * Every `enum:` is DERIVED from the `@repo/types` tuple that also derives the union type, never a
 * hand-copied array — which would compile while silently missing a member added later.
 *
 * **That sentence was an overclaim until the M4 api review found it**: three enums here were
 * hand-copied, not because anybody preferred it but because no backing tuple existed to derive
 * from. `REVISION_NOT_ASSESSABLE_REASONS` was added rather than the claim softened, and it earned
 * its keep immediately — a third reason joined that union in the same commit and reached both DTOs
 * without either being edited. The `ADDED | REMOVED | CHANGED` link state was left as the last
 * hand-copied literal and **named** here rather than silently excepted from a sentence that says
 * "every"; `REVISION_LINK_STATES` closed it on 2026-09-11 (`docs/TECH_DEBT.md` #263(d)), so the
 * sentence above is now true without a footnote. The wire values did not change — what changed is
 * that a fourth state would reach this file on its own.
 */

export class RevisionSideDto implements RevisionSide {
  @ApiProperty({ enum: REVISION_SIDE_KINDS, description: 'Which kind of revision this side is.' })
  kind!: RevisionSideKind;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The baseline id; null on the live side, which has no id of its own.',
  })
  id!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The baseline name; null on the live side, which the client labels as live.',
  })
  name!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'ISO instant: the capture time for a baseline, the last recalculation for live. Null on a ' +
      'live side that has never been calculated.',
  })
  computedAt!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'YYYY-MM-DD — the data date this side’s numbers were computed against.',
  })
  dataDate!: string | null;
}

export class RevisionMovedActivityDto implements RevisionMovedActivity {
  @ApiProperty() activityId!: string;
  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty() name!: string;

  @ApiProperty({ nullable: true, type: Number, description: 'Working days on the old side.' })
  fromTotalFloatDays!: number | null;

  @ApiProperty({ nullable: true, type: Number, description: 'Working days on the new side.' })
  toTotalFloatDays!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      '`to − from`, or **null** when either side is unknown. Absence and zero are different ' +
      'facts and this payload never collapses them.',
  })
  floatMovementDays!: number | null;

  @ApiProperty({ nullable: true, type: String }) fromEarlyStart!: string | null;
  @ApiProperty({ nullable: true, type: String }) toEarlyStart!: string | null;
  @ApiProperty({ nullable: true, type: String }) fromEarlyFinish!: string | null;
  @ApiProperty({ nullable: true, type: String }) toEarlyFinish!: string | null;

  @ApiProperty({
    description:
      'Whether the activity is on the LIVE plan — which is what decides whether a client may ' +
      'offer to reveal it. Comparing two baselines can name an activity since deleted, and a ' +
      'control that navigates nowhere is worse than one that says why.',
  })
  existsLive!: boolean;
}

export class RevisionPresenceActivityDto implements RevisionPresenceActivity {
  @ApiProperty() activityId!: string;
  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty() name!: string;

  @ApiProperty({
    description: 'Its criticality on the side it exists on — a fact, not a movement.',
  })
  isCritical!: boolean;

  @ApiProperty() existsLive!: boolean;
}

export class RevisionCompletionDto implements RevisionCompletion {
  @ApiProperty() assessable!: boolean;

  @ApiProperty({
    enum: REVISION_COMPLETION_REASONS,
    nullable: true,
    description:
      'Why the movement cannot be stated; null when it can. Prints as a sentence — a code ' +
      'reaching a screen or paper is a tested-for defect.',
  })
  reason!: RevisionCompletionReason | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The OLD side’s latest-finishing non-summary activity, ties broken by id. **Not exact**: ' +
      'both sides persist a date, so under a same-day tie this can pick a different activity ' +
      'than the engine’s own minute-denominated rule would. Name it and state the tie-break; do ' +
      'not present the movement as if the choice were unique.',
  })
  carrierActivityId!: string | null;

  @ApiProperty({ nullable: true, type: String }) carrierName!: string | null;
  @ApiProperty({ nullable: true, type: String }) fromFinish!: string | null;
  @ApiProperty({ nullable: true, type: String }) toFinish!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      '**Working days on the plan calendar**, measured with the old side’s frozen hours-per-day ' +
      'factor; positive = later. Not the carrier’s own calendar, which a snapshot does not ' +
      'record — this matches the variance read deliberately, because two numbers on one screen ' +
      'derived on different calendars is the worse defect.',
  })
  movementDays!: number | null;

  @ApiProperty({
    description:
      'True when the NEW side’s own latest-finishing activity is a different one. A fact a ' +
      'planner wants, and not a cause.',
  })
  carrierChanged!: boolean;

  @ApiProperty({ nullable: true, type: String }) newSideCarrierActivityId!: string | null;
  @ApiProperty({ nullable: true, type: String }) newSideCarrierName!: string | null;
}

export class RevisionCriticalPathDeltaDto implements RevisionCriticalPathDelta {
  @ApiProperty({ type: [RevisionMovedActivityDto] }) entered!: RevisionMovedActivityDto[];
  @ApiProperty({ type: [RevisionMovedActivityDto] }) left!: RevisionMovedActivityDto[];

  @ApiProperty({
    description:
      'The TRUE total, which may exceed the rows returned. "Showing 50 of 412" is never a ' +
      'client’s own number.',
  })
  enteredTotal!: number;

  @ApiProperty() leftTotal!: number;

  @ApiProperty({
    description: 'The server’s cap on each set — carried so a client never holds a second copy.',
  })
  cap!: number;

  @ApiProperty() remainedCriticalCount!: number;
  @ApiProperty() remainedNonCriticalCount!: number;

  @ApiProperty({
    type: [RevisionPresenceActivityDto],
    description:
      'Present only on the new side. **Appearing is not entering** — an activity added and ' +
      'critical on arrival is one ADDED row and is never also counted as having entered a path ' +
      'it was never off.',
  })
  added!: RevisionPresenceActivityDto[];

  @ApiProperty({ type: [RevisionPresenceActivityDto] }) removed!: RevisionPresenceActivityDto[];

  @ApiProperty({
    description:
      'The TRUE total, which may exceed the rows returned — the same `cap` bounds these as bounds ' +
      '`entered`/`left`. They shipped unbounded for one review cycle: a baseline predating a WBS ' +
      'reorganisation or a re-import can put most of a plan in both sets at once.',
  })
  addedTotal!: number;

  @ApiProperty() removedTotal!: number;

  @ApiProperty({
    description:
      'True when NEITHER side has a critical non-summary activity — a scheduled plan can ' +
      'legitimately have none, and that is a fact to state rather than an error.',
  })
  noCriticalPath!: boolean;

  @ApiProperty({
    enum: ['SIDE_NOT_SCHEDULED'],
    nullable: true,
    description:
      'Why the criticality delta cannot be stated, or null when it can. `SIDE_NOT_SCHEDULED` means ' +
      'one of the two revisions was never calculated — `is_critical` defaults false, so comparing ' +
      'against it would report every activity that WAS critical as having left the critical path, ' +
      'each row technically true and the picture false. When this is set the four row sets are ' +
      'empty and every total is zero: the delta is withheld here rather than patched over by one ' +
      'client, so a second consumer cannot inherit the fabricated version.',
  })
  notAssessableReason!: 'SIDE_NOT_SCHEDULED' | null;
}

/**
 * One row of the change list. **Declared, not inferred** — the M8 api review found the five tier-1
 * and tier-2 fields shipping on the wire and absent from the generated schema, because
 * `RevisionCompareDto.from` is a pass-through and `implements` constrains the floor rather than the
 * ceiling (the docblock on that method says so, and this is that trap sprung one epic later).
 */
export class RevisionChangeRowDto implements RevisionChangeRow {
  @ApiProperty({ description: 'The activity a client may reveal. For a logic row, the SUCCESSOR.' })
  activityId!: string;

  @ApiProperty({
    description:
      'What the row is ABOUT, unique within its class — and therefore the key to render it under. ' +
      'Equal to `activityId` for an activity-subject class, and to the dependency id for ' +
      '`RELOGICKED`, because two changed links into one successor are two rows with one activity.',
  })
  subjectId!: string;

  @ApiProperty({ enum: [...REVISION_FREE_CHANGE_CLASSES, ...REVISION_PAID_CHANGE_CLASSES] })
  changeClass!: RevisionChangeClass;

  @ApiProperty({ nullable: true, type: String }) code!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true, type: String }) from!: string | null;
  @ApiProperty({ nullable: true, type: String }) to!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The instant the row is ordered by. Ordering is by TIME and never by magnitude.',
  })
  orderKey!: string | null;

  @ApiProperty({
    description:
      'Whether the activity is in the LIVE plan, and therefore whether a client may offer to ' +
      'reveal it. Answered by the SERVER: an activity moved to another lane or progressed enters ' +
      'and leaves nothing, so it is in no delta list, and inferring absence from that would put a ' +
      'false sentence on screen about a bar the reader can see.',
  })
  existsLive!: boolean;
}

export class RevisionClassAssessmentDto implements RevisionClassAssessment {
  @ApiProperty({ enum: [...REVISION_FREE_CHANGE_CLASSES, ...REVISION_PAID_CHANGE_CLASSES] })
  changeClass!: RevisionChangeClass;

  @ApiProperty({
    nullable: true,
    enum: REVISION_NOT_ASSESSABLE_REASONS,
    description:
      'Null when assessed; a reason when it could not be. **NEVER read a reason as "no ' +
      'changes"** — `rows` is empty and `total` is zero in both states, and only this field ' +
      'separates them. `NOT_SNAPSHOTTED` is PERMANENT for the two revisions involved: a baseline ' +
      'captured before the snapshot extension recorded no logic, constraints, calendar, WBS ' +
      'parent, lane or progress, and no backfill is possible.',
  })
  notAssessableReason!: RevisionNotAssessableReason | null;

  @ApiProperty({ type: [RevisionChangeRowDto] }) rows!: readonly RevisionChangeRowDto[];

  @ApiProperty({
    description: 'Rows found BEFORE the cap. "Showing N of M" is never the client’s arithmetic.',
  })
  total!: number;
}

export class RevisionChangeReportDto implements RevisionChangeReport {
  @ApiProperty({
    type: [RevisionClassAssessmentDto],
    description:
      'EVERY class, assessed or not — total over the vocabulary, so a class is never simply ' +
      'missing. A reader who cannot find a class concludes nothing changed in it.',
  })
  classes!: readonly RevisionClassAssessmentDto[];

  @ApiProperty() cap!: number;
}

export class RevisionGhostBarDto implements RevisionGhostBar {
  @ApiProperty() activityId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: '`YYYY-MM-DD`. Both non-null: no old dates ⇒ no ghost.' })
  fromStart!: string;
  @ApiProperty() fromFinish!: string;

  @ApiProperty({
    description:
      'The FROZEN lane, never the live one and never a guess — which is what makes removed work ' +
      'drawable at all, since it has no live bar to sit behind.',
  })
  laneIndex!: number;

  @ApiProperty() isMilestone!: boolean;
  @ApiProperty({ description: 'In the old revision and not in the new.' }) removed!: boolean;
}

export class RevisionLinkChangeDto implements RevisionLinkChange {
  @ApiProperty() dependencyId!: string;
  @ApiProperty({ description: 'Carried because a REMOVED edge is in no live edge list.' })
  predecessorId!: string;
  @ApiProperty() successorId!: string;
  @ApiProperty({ enum: REVISION_LINK_STATES })
  state!: RevisionLinkChange['state'];
}

export class RevisionCompareDto implements RevisionCompare {
  @ApiProperty() planId!: string;
  @ApiProperty() planName!: string;
  @ApiProperty({ type: RevisionSideDto }) from!: RevisionSideDto;
  @ApiProperty({ type: RevisionSideDto }) to!: RevisionSideDto;

  @ApiProperty({
    description:
      'The day↔minute factor the movement is measured over — the OLD side’s frozen ' +
      'hours-per-day. Carried so a client formatting a sub-day quantity uses the same factor the ' +
      'server did rather than defaulting to one, which reads a planner’s `1d` on an eight-hour ' +
      'calendar as three days’ work.',
  })
  dayFactorMinutes!: number;

  @ApiProperty({
    enum: REVISION_SETTINGS_VERDICTS,
    description:
      'Whether both sides’ numbers came from the same criticality RULE. **Three-valued, and ' +
      'UNKNOWN must never be rendered as MATCH**: `isCritical` and `totalFloat` are the OUTPUT ' +
      'of a rule, so a comparison across a changed rule reports a large, real-looking set as ' +
      'having entered the critical path while every bar sits where it did. UNKNOWN is what a ' +
      'side that never recorded its rule reports — permanent on a baseline, self-clearing on the ' +
      'live plan at its next recalculation.',
  })
  settingsVerdict!: RevisionSettingsVerdict;

  @ApiProperty({ type: RevisionCompletionDto }) completion!: RevisionCompletionDto;
  @ApiProperty({ type: RevisionCriticalPathDeltaDto })
  criticalPath!: RevisionCriticalPathDeltaDto;

  /**
   * A naming boundary rather than a mapping one: the service already returns exactly this shape.
   *
   * **What is actually load-bearing is the SERVICE's typed object literal, not the `implements`
   * clauses** — corrected here after the M4 api review pointed out that `implements` constrains the
   * floor (the class cannot be missing or mistype a member) and says nothing about the ceiling (it
   * does not stop a wider value carrying an undeclared field). The guarantee comes from
   * `revisionCompare` building `const result: RevisionCompare = { … }`, where TypeScript's
   * excess-property check on an object literal rejects anything extra at that one site.
   *
   * **That was an overclaim until 2026-09-11, and the sibling DTO said so first**
   * (`docs/TECH_DEBT.md` #263(c)). The declared type checks this literal and each branch of a
   * ternary assigned as a property value, and does **not** fire inside `...(cond ? { … } : {})` —
   * which is precisely how the seven optional projection fields are attached. Each of those three
   * branches now carries its own `satisfies Pick<RevisionCompare, …>`, so the sentence above is
   * true of the whole shape rather than of the part that never needed it. Verified by injecting a
   * `cost` key into every branch and reading the six `TS2353` errors back, not by reasoning.
   *
   * That is a service-discipline guarantee standing in for a DTO-boundary one, and it is the only
   * `.from` in this directory that works that way — the siblings copy fields explicitly. It is kept
   * because a hand-written copy of a 30-field nested shape is a second place to forget a field, and
   * because there is no cost-shaped field here to withhold; the trade is written down rather than
   * left for a reader to infer from the absence of a mapping.
   */
  @ApiPropertyOptional({
    type: RevisionChangeReportDto,
    description:
      'The change list — present ONLY with `?include=changes`. Absent rather than empty when not ' +
      'asked for, so a caller that did not opt in receives byte-identically the prior response.',
  })
  changes?: RevisionChangeReportDto | undefined;

  @ApiPropertyOptional({
    type: [RevisionGhostBarDto],
    description:
      'The change picture’s geometry — where the CHANGED bars were — present ONLY with ' +
      '`?include=ghosts`, which also returns `links`. Capped like every other array here, with ' +
      '`ghostsTotal` beside it.',
  })
  ghosts?: readonly RevisionGhostBarDto[] | undefined;

  @ApiPropertyOptional({ description: 'Changed bars found BEFORE the cap.' })
  ghostsTotal?: number | undefined;

  @ApiPropertyOptional({
    description:
      'Changed activities the overlay CANNOT draw, because the old side never recorded where they ' +
      'were. A fact a client must render: a diagram has no "showing N of M", so a picture ' +
      'quietly missing rows is unnoticeable.',
  })
  ghostsUndrawable?: number | undefined;

  @ApiPropertyOptional({ type: [RevisionLinkChangeDto], description: 'The changed logic.' })
  links?: readonly RevisionLinkChangeDto[] | undefined;

  @ApiPropertyOptional({ description: 'Changed links found BEFORE the cap.' })
  linksTotal?: number | undefined;

  @ApiPropertyOptional({
    description:
      'Changed links the overlay cannot draw, because an endpoint is not in the live plan and a ' +
      'link has no geometry of its own — it is anchored to two bars.',
  })
  linksUndrawable?: number | undefined;

  static from(model: RevisionCompare): RevisionCompareDto {
    return model;
  }
}
