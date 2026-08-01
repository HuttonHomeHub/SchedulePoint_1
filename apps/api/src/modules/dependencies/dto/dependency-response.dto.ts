import { ApiProperty } from '@nestjs/swagger';
import { DependencyType, LagCalendarSource } from '@prisma/client';
import type { DependencyEndpoint, DependencySummary } from '@repo/types';

import { minutesToDays } from '../../activities/day-factor';
import type { DependencyWithEndpoints } from '../dependency.repository';
import type { WithLagDayFactor } from '../lag-day-factor';

/**
 * `lagDays` is measured on the calendar this relationship's `lagCalendar` names (ADR-0068 §4), so
 * the factor is attached PER ROW — one page of a plan's logic can legitimately need several.
 */

/** The public shape of a dependency's endpoint activity. */
class DependencyEndpointDto implements DependencyEndpoint {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  code!: string | null;

  @ApiProperty()
  name!: string;
}

/**
 * Public representation of a dependency — a directed, typed, lagged edge from a
 * predecessor to a successor activity in one plan. The endpoints are embedded as
 * light summaries so a predecessors/successors list renders without extra fetches.
 */
export class DependencyResponseDto implements DependencySummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The plan both endpoints belong to.' })
  planId!: string;

  @ApiProperty({ enum: DependencyType })
  type!: DependencyType;

  @ApiProperty({
    description:
      'Signed lag in working days (a lead is negative), ROUNDED from the stored minutes. A day ' +
      'is the standard working day of THIS RELATIONSHIP’S LAG CALENDAR (ADR-0068) — an ' +
      'eight-hour calendar counts 480 minutes to the day; `TWENTY_FOUR_HOUR` is pinned at 1440. ' +
      'Read `lagMinutes` for the exact value of a sub-day lag.',
  })
  lagDays!: number;

  @ApiProperty({
    description:
      'Signed lag in working MINUTES — what is stored and what the engine applies (ADR-0036). ' +
      'Exposed so a sub-day lag reads back exactly rather than as a rounded 0 (TECH_DEBT #78).',
  })
  lagMinutes!: number;

  @ApiProperty({
    enum: LagCalendarSource,
    description:
      'The calendar the lag is measured on (ADR-0036 §6). TWENTY_FOUR_HOUR = elapsed time; the rest schedule on the plan calendar today.',
  })
  lagCalendar!: LagCalendarSource;

  @ApiProperty({ type: DependencyEndpointDto })
  predecessor!: DependencyEndpoint;

  @ApiProperty({ type: DependencyEndpointDto })
  successor!: DependencyEndpoint;

  @ApiProperty({
    readOnly: true,
    description:
      'Engine-owned (read-only; ignored if sent in a request body): true when this edge drives its successor’s early start (CPM/GPM driver). False until the plan is calculated or if the edge has slack.',
  })
  isDriving!: boolean;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  static from(entity: WithLagDayFactor<DependencyWithEndpoints>): DependencyResponseDto {
    return {
      id: entity.id,
      planId: entity.planId,
      type: entity.type,
      // Stored as signed working-minutes (ADR-0036). Both exposed: days for existing clients,
      // minutes so a sub-day lag survives the round trip.
      lagDays: minutesToDays(entity.lagMinutes, entity.lagDayFactorMinutes),
      lagMinutes: entity.lagMinutes,
      lagCalendar: entity.lagCalendar,
      predecessor: {
        id: entity.predecessor.id,
        code: entity.predecessor.code,
        name: entity.predecessor.name,
      },
      successor: {
        id: entity.successor.id,
        code: entity.successor.code,
        name: entity.successor.name,
      },
      isDriving: entity.isDriving,
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
