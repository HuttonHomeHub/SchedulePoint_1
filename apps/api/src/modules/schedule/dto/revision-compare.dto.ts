import { ApiProperty } from '@nestjs/swagger';
import type {
  RevisionCompare,
  RevisionCompletion,
  RevisionCompletionReason,
  RevisionCriticalPathDelta,
  RevisionMovedActivity,
  RevisionPresenceActivity,
  RevisionSettingsVerdict,
  RevisionSide,
  RevisionSideKind,
} from '@repo/types';
import {
  REVISION_COMPLETION_REASONS,
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
      'True when NEITHER side has a critical non-summary activity — a scheduled plan can ' +
      'legitimately have none, and that is a fact to state rather than an error.',
  })
  noCriticalPath!: boolean;
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
   * The service already returns exactly this shape — every field, every nullability — so this is a
   * NAMING boundary rather than a mapping one, and the `implements` clauses above are what make it
   * safe: a `RevisionCompare` that stops satisfying the DTO fails to compile here rather than
   * shipping an undeclared field. Deliberately not a hand-written field copy, which is a second
   * place to forget one.
   */
  static from(model: RevisionCompare): RevisionCompareDto {
    return model;
  }
}
