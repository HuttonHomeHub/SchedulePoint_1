import { ApiProperty } from '@nestjs/swagger';
import {
  ActivityStatus,
  ActivityType,
  ConstraintType,
  DurationType,
  PercentCompleteType,
  type Activity,
} from '@prisma/client';
import type { ActivitySummary } from '@repo/types';

import { formatCalendarDate } from '../../../common/validation/calendar-date';

/** Day↔minute factor (ADR-0036 §4.2): storage is minutes, the public field stays days. */
const MINUTES_PER_DAY = 1440;

/**
 * Public representation of an activity (the leaf of Client → Project → Plan →
 * Activity). Calendar-day fields (constraint date, actuals, CPM early/late
 * dates) are serialised as `YYYY-MM-DD`; the CPM output fields are engine-owned
 * and null/false until the CPM engine slice computes them.
 */
export class ActivityResponseDto implements ActivitySummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The parent plan.' })
  planId!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Human-facing code (unique per plan).',
  })
  code!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: ActivityType })
  type!: ActivityType;

  @ApiProperty({ description: 'Working days (milestones are 0).' })
  durationDays!: number;

  @ApiProperty({
    enum: DurationType,
    description:
      'Duration type (ADR-0040): which of {duration, units, units/time} recomputes when a planner ' +
      'edits another. Default FIXED_DURATION_AND_UNITS_TIME; FIXED_UNITS/FIXED_UNITS_TIME let a ' +
      'driving resource’s units drive the duration.',
  })
  durationType!: DurationType;

  @ApiProperty({ enum: ConstraintType, nullable: true })
  constraintType!: ConstraintType | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  constraintDate!: string | null;

  @ApiProperty({
    enum: ConstraintType,
    nullable: true,
    description: 'Secondary constraint (ADR-0035 §10); drives the backward pass.',
  })
  secondaryConstraintType!: ConstraintType | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  secondaryConstraintDate!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'External / inter-project early start (ADR-0043 / ADR-0035 §30.1): an SNET-shaped forward bound imported from another project, or null.',
  })
  externalEarlyStart!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'External / inter-project late finish (ADR-0043 / ADR-0035 §30.2): an FNLT-shaped backward bound imported from another project, or null.',
  })
  externalLateFinish!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'Expected-finish target (ADR-0035 §9), or null.',
  })
  expectedFinish!: string | null;

  @ApiProperty({
    enum: PercentCompleteType,
    description:
      'The %-complete measure that feeds Earned Value (EV1, ADR-0042): DURATION (default), UNITS, or ' +
      'PHYSICAL. Selects the EV performance measure only — it never changes a CPM date.',
  })
  percentCompleteType!: PercentCompleteType;

  @ApiProperty({
    minimum: 0,
    maximum: 100,
    nullable: true,
    type: Number,
    description:
      'Hand-entered physical % complete (EV1, ADR-0042), used only when percentCompleteType = PHYSICAL, or null.',
  })
  physicalPercentComplete!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Activity budgeted expense in minor currency units (EV1/EV4a, ADR-0042). Conditionally included: ' +
      'returned ONLY to a caller holding `cost:read` (Planner/Org Admin) in this org; every other ' +
      'caller (Viewer/Contributor) sees null (fail-closed). Null thus means unset OR not-permitted.',
  })
  budgetedExpense!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Activity actual expense in minor currency units (EV1/EV4a, ADR-0042). Conditionally included: ' +
      'returned ONLY to a caller holding `cost:read` (Planner/Org Admin) in this org; others see null.',
  })
  actualExpense!: number | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: "The activity's own calendar (ADR-0037), or null to inherit the plan default.",
  })
  calendarId!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'WBS parent (ADR-0038): the WBS_SUMMARY activity this rolls up into, or null for top-level.',
  })
  parentId!: string | null;

  @ApiProperty({ description: 'Graphical y-lane for the TSLD canvas.' })
  laneIndex!: number;

  @ApiProperty({ enum: ActivityStatus })
  status!: ActivityStatus;

  @ApiProperty({ minimum: 0, maximum: 100 })
  percentComplete!: number;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  actualStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String })
  actualFinish!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Explicit remaining work in whole days for an in-progress activity (M2, ADR-0035); null derives it from percent complete.',
  })
  remainingDurationDays!: number | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'Suspend day for a paused in-progress activity (M2, ADR-0035 §4), or null.',
  })
  suspendDate!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Resume day; the remaining work is floored at max(data date, resume) (M2), or null.',
  })
  resumeDate!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM (engine-owned).' })
  earlyStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM (engine-owned).' })
  earlyFinish!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM (engine-owned).' })
  lateStart!: string | null;

  @ApiProperty({ format: 'date', nullable: true, type: String, description: 'CPM (engine-owned).' })
  lateFinish!: string | null;

  @ApiProperty({ nullable: true, type: Number, description: 'CPM total float (engine-owned).' })
  totalFloat!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'CPM free float in working days (engine-owned, ADR-0035 §17–§20): slip that delays no successor. Always ≤ total float.',
  })
  freeFloat!: number | null;

  @ApiProperty({ description: 'CPM critical flag (engine-owned).' })
  isCritical!: boolean;

  @ApiProperty({ description: 'CPM near-critical flag (engine-owned).' })
  isNearCritical!: boolean;

  @ApiProperty({
    description:
      'Mandatory produce-and-flag (engine-owned, ADR-0035 §7): true when a mandatory pin drove the start earlier than logic allowed.',
  })
  constraintViolated!: boolean;

  @ApiProperty({
    description:
      'LOE no-span produce-and-flag (engine-owned, ADR-0035 §21): true when a Level-of-Effort activity has no resolvable span (missing an SS predecessor or FF successor).',
  })
  loeNoSpan!: boolean;

  @ApiProperty({
    description:
      'Resource-dependent driver-missing produce-and-flag (engine-owned, ADR-0035 §23 / ADR-0039): true when a RESOURCE_DEPENDENT activity has no driving resource assignment (scheduled on the fallback calendar and flagged).',
  })
  resourceDriverMissing!: boolean;

  @ApiProperty({
    description:
      'Schedule As-Late-As-Possible (ADR-0035 §11): display-only placement preference; does not change early/late/float.',
  })
  scheduleAsLateAsPossible!: boolean;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'Visual-Planning placement (ADR-0033): hand-placed start, or null if unplaced.',
  })
  visualStart!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Effective-Visual start (engine-owned, ADR-0033): where the bar renders in VISUAL mode.',
  })
  visualEffectiveStart!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'Effective-Visual finish (engine-owned).',
  })
  visualEffectiveFinish!: string | null;

  @ApiProperty({
    description: 'True when the placement is before the earliest feasible start (engine-owned).',
  })
  visualConflict!: boolean;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Working-day drift of the placement from early start (signed, engine-owned).',
  })
  visualDriftDays!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Resource-levelling tie-break (ADR-0041 §1): LOWER = HIGHER priority. Client-settable; null = unset.',
  })
  levelingPriority!: number | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Resource-levelling delayed start (engine-owned, ADR-0041 §3), or null until levelled.',
  })
  leveledStart!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Resource-levelling delayed finish (engine-owned, ADR-0041 §3), or null until levelled.',
  })
  leveledFinish!: string | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Resource-levelling applied delay in whole working days (engine-owned, ADR-0041 §3), or null.',
  })
  levelingDelayDays!: number | null;

  @ApiProperty({
    description:
      'Levelling window-exceeded produce-and-flag (engine-owned, ADR-0041 §6): serialising pushed the activity past a resource availability window.',
  })
  levelingWindowExceeded!: boolean;

  @ApiProperty({
    description:
      'Self over-allocated produce-and-flag (engine-owned, ADR-0041 §2): the activity’s own demand exceeds the resource capacity (a delay cannot fix it).',
  })
  selfOverAllocated!: boolean;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  /**
   * Map an activity to its public shape. `canReadCost` is the caller's org-scoped `cost:read`
   * decision (EV4a, ADR-0042), computed in the service from the resolved organisation — the money
   * expense amounts are included ONLY when it is true, otherwise null (fail-closed, no cross-tenant
   * leak). The %-complete measures stay in every read (they are not commercially sensitive money).
   */
  static from(entity: Activity, canReadCost: boolean): ActivityResponseDto {
    const day = (value: Date | null): string | null => (value ? formatCalendarDate(value) : null);
    return {
      id: entity.id,
      planId: entity.planId,
      code: entity.code,
      name: entity.name,
      description: entity.description,
      type: entity.type,
      // Stored in working-minutes (ADR-0036); the public field stays whole working days.
      durationDays: Math.round(entity.durationMinutes / MINUTES_PER_DAY),
      durationType: entity.durationType,
      constraintType: entity.constraintType,
      constraintDate: day(entity.constraintDate),
      secondaryConstraintType: entity.secondaryConstraintType,
      secondaryConstraintDate: day(entity.secondaryConstraintDate),
      // External / inter-project bounds (ADR-0043): stored absolutely (Timestamptz at UTC midnight),
      // echoed as a calendar day exactly like constraintDate/expectedFinish.
      externalEarlyStart: day(entity.externalEarlyStart),
      externalLateFinish: day(entity.externalLateFinish),
      calendarId: entity.calendarId,
      parentId: entity.parentId,
      laneIndex: entity.laneIndex,
      scheduleAsLateAsPossible: entity.scheduleAsLateAsPossible,
      status: entity.status,
      percentComplete: entity.percentComplete,
      actualStart: day(entity.actualStart),
      actualFinish: day(entity.actualFinish),
      // Stored in working-minutes (ADR-0036); the public field stays whole working days. Null when
      // unset (the engine then derives remaining from percent complete).
      remainingDurationDays:
        entity.remainingDurationMinutes === null
          ? null
          : Math.round(entity.remainingDurationMinutes / MINUTES_PER_DAY),
      suspendDate: day(entity.suspendDate),
      resumeDate: day(entity.resumeDate),
      expectedFinish: day(entity.expectedFinish),
      // Earned-Value progress measures (EV1, ADR-0042): passthrough echo — not money, always readable.
      percentCompleteType: entity.percentCompleteType,
      physicalPercentComplete: entity.physicalPercentComplete,
      // Money expense amounts (BigInt minor units → number) are gated on `cost:read` (EV4a, ADR-0042):
      // null unless the caller may read cost AND the amount is set. A Viewer/Contributor always sees null.
      budgetedExpense:
        canReadCost && entity.budgetedExpense !== null ? Number(entity.budgetedExpense) : null,
      actualExpense:
        canReadCost && entity.actualExpense !== null ? Number(entity.actualExpense) : null,
      earlyStart: day(entity.earlyStart),
      earlyFinish: day(entity.earlyFinish),
      lateStart: day(entity.lateStart),
      lateFinish: day(entity.lateFinish),
      totalFloat: entity.totalFloat,
      freeFloat: entity.freeFloat,
      isCritical: entity.isCritical,
      isNearCritical: entity.isNearCritical,
      constraintViolated: entity.constraintViolated,
      loeNoSpan: entity.loeNoSpan,
      resourceDriverMissing: entity.resourceDriverMissing,
      visualStart: day(entity.visualStart),
      visualEffectiveStart: day(entity.visualEffectiveStart),
      visualEffectiveFinish: day(entity.visualEffectiveFinish),
      visualConflict: entity.visualConflict,
      visualDriftDays: entity.visualDriftDays,
      // Resource-levelling overlay (ADR-0041) — client-settable priority + engine-owned overlay.
      levelingPriority: entity.levelingPriority,
      leveledStart: day(entity.leveledStart),
      leveledFinish: day(entity.leveledFinish),
      // Stored in working-minutes (ADR-0036 §7); the public field stays whole working days. Null
      // until levelled — the same day↔minute conversion this DTO uses for durationDays/remaining.
      levelingDelayDays:
        entity.levelingDelayMinutes === null
          ? null
          : Math.round(entity.levelingDelayMinutes / MINUTES_PER_DAY),
      levelingWindowExceeded: entity.levelingWindowExceeded,
      selfOverAllocated: entity.selfOverAllocated,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
