import { ApiProperty } from '@nestjs/swagger';
import {
  CriticalPathDefinition,
  EacMethod,
  PlanStatus,
  ProgressRecalcMode,
  SwimlaneSource,
  TotalFloatMode,
  type Plan,
} from '@prisma/client';
import type { PlanSummary } from '@repo/types';

import type { Principal } from '../../../common/auth/principal';
import { isEditedSinceCalculated } from '../../../common/schedule-inputs/edited-since-calculated';
import { formatCalendarDate } from '../../../common/validation/calendar-date';

/** Public representation of a plan (scoped to a project). */
export class PlanResponseDto implements PlanSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The parent project.' })
  projectId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ enum: PlanStatus })
  status!: PlanStatus;

  @ApiProperty({
    enum: ProgressRecalcMode,
    description:
      'Out-of-sequence recalc mode (M2, ADR-0035): RETAINED_LOGIC, PROGRESS_OVERRIDE, or ACTUAL_DATES.',
  })
  progressRecalcMode!: ProgressRecalcMode;

  @ApiProperty({
    description:
      'Expected-finish scheduling option (M4, ADR-0035 §9): when on, in-progress remaining work is resized to each activity’s expectedFinish.',
  })
  useExpectedFinishDates!: boolean;

  @ApiProperty({
    enum: CriticalPathDefinition,
    description:
      'Critical-path definition (M6, ADR-0035 §17): TOTAL_FLOAT (float ≤ threshold, default) or LONGEST_PATH (driving chain).',
  })
  criticalPathDefinition!: CriticalPathDefinition;

  @ApiProperty({
    description:
      'Total-float threshold in whole working days (M6, ADR-0035 §17): at/below this an activity is critical under TOTAL_FLOAT. Default 0.',
  })
  criticalFloatThresholdMinutes!: number;

  @ApiProperty({
    enum: TotalFloatMode,
    description: 'Total-float measure (M6, ADR-0035 §18): FINISH (default), START, or SMALLEST.',
  })
  totalFloatMode!: TotalFloatMode;

  @ApiProperty({
    description:
      'Make open-ended activities critical (M6, ADR-0035 §20): when on, activities with no predecessors/successors are flagged critical. Default false.',
  })
  makeOpenEndsCritical!: boolean;

  @ApiProperty({
    description:
      'Resource-levelling opt-in switch (ADR-0041 §7): when on, the recalc runs the opt-in levelling pass. Default false (byte-parity).',
  })
  levelResources!: boolean;

  @ApiProperty({
    description:
      'Level-within-float-only option (ADR-0041 §4): when on, levelling delays only within total float and never extends the schedule. Default false.',
  })
  levelWithinFloatOnly!: boolean;

  @ApiProperty({
    description:
      'Ignore external / inter-project relationships (ADR-0043 / ADR-0035 §30.4): when on, the recalc drops every activity’s external early-start and late-finish bounds. Default false (byte-parity).',
  })
  ignoreExternalRelationships!: boolean;

  @ApiProperty({
    enum: EacMethod,
    description:
      'The Earned-Value EAC forecast method (EV1, ADR-0042): CPI (default), REMAINING_AT_BUDGET, or ' +
      'CPI_TIMES_SPI. Read by the EV read (EV2b); dark in EV1.',
  })
  eacMethod!: EacMethod;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      "The plan's ISO-4217 currency code (three upper-case letters) for all money columns (EV1, " +
      'ADR-0042), or null when unset (inherit the org default at read time).',
  })
  currencyCode!: string | null;

  @ApiProperty({
    enum: SwimlaneSource,
    enumName: 'SwimlaneSource',
    description:
      'Where the plan’s swimlanes come from (swimlanes spec §4.6): NONE, MANUAL, WBS or ACTIVITY_CODE. ' +
      'Presentation only — never a scheduling input.',
  })
  swimlaneSource!: SwimlaneSource;

  @ApiProperty({
    nullable: true,
    type: Number,
    minimum: 1,
    maximum: 3,
    description: 'The WBS level (1 to 3) when the source is WBS, null otherwise.',
  })
  swimlaneWbsLevel!: number | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description:
      'The code type the swimlanes are made from when the source is ACTIVITY_CODE, null otherwise.',
  })
  swimlaneCodeTypeId!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description:
      'Planned start as a calendar day (YYYY-MM-DD). The mandatory data date (ADR-0033 M1).',
  })
  plannedStart!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: "The plan's default working-day calendar, or null for all-days-work.",
  })
  calendarId!: string | null;

  @ApiProperty({
    description:
      'True when a scheduling input changed after the last recalculation, so the computed dates may ' +
      'be behind the plan. False for a plan that has never been calculated. The same rule the ' +
      "organisation overview's 'Edited since it was calculated' uses.",
  })
  editedSinceCalculated!: boolean;

  @ApiProperty({
    description:
      "Whether the caller may read this plan's cost fields — the same `cost:read` check the " +
      'activity and resource reads redact with. Those fields come back `null` both when unset and ' +
      'when withheld, so this is the only way to tell a hidden cost from an empty one. Per caller, ' +
      'not per plan (TECH_DEBT #62).',
  })
  canReadCost!: boolean;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: Plan, canReadCost: boolean): PlanResponseDto {
    return {
      id: entity.id,
      projectId: entity.projectId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      progressRecalcMode: entity.progressRecalcMode,
      useExpectedFinishDates: entity.useExpectedFinishDates,
      criticalPathDefinition: entity.criticalPathDefinition,
      criticalFloatThresholdMinutes: entity.criticalFloatThresholdMinutes,
      totalFloatMode: entity.totalFloatMode,
      makeOpenEndsCritical: entity.makeOpenEndsCritical,
      levelResources: entity.levelResources,
      levelWithinFloatOnly: entity.levelWithinFloatOnly,
      // Ignore external / inter-project relationships (ADR-0043 / ADR-0035 §30.4): passthrough echo.
      ignoreExternalRelationships: entity.ignoreExternalRelationships,
      // Earned-Value plan options (EV1, ADR-0042): passthrough echo; currencyCode null = inherit.
      eacMethod: entity.eacMethod,
      currencyCode: entity.currencyCode,
      swimlaneSource: entity.swimlaneSource,
      swimlaneWbsLevel: entity.swimlaneWbsLevel,
      swimlaneCodeTypeId: entity.swimlaneCodeTypeId,
      plannedStart: entity.plannedStart ? formatCalendarDate(entity.plannedStart) : null,
      calendarId: entity.calendarId,
      editedSinceCalculated: isEditedSinceCalculated(
        entity.scheduleComputedAt,
        entity.scheduleInputsChangedAt,
      ),
      canReadCost,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

/**
 * A plan as one caller reads it. `canReadCost` is that caller's own `cost:read` in the plan's
 * organisation — the check `ActivitiesService` redacts cost with — so the flag and the redaction
 * cannot disagree about who sees money.
 */
export function planResponse(principal: Principal, entity: Plan): PlanResponseDto {
  return PlanResponseDto.from(entity, principal.can('cost:read', entity.organizationId));
}
