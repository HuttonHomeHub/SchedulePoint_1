import { ApiProperty } from '@nestjs/swagger';
import { DependencyType, LagCalendarSource } from '@prisma/client';
import type { CrossPlanDependencySummary, DependencyEndpoint } from '@repo/types';

import { minutesToDays } from '../../activities/day-factor';
import type { CrossPlanDependencyWithFactor } from '../cross-plan-dependencies.service';

/** The public shape of a cross-plan dependency's endpoint activity. */
class CrossPlanDependencyEndpointDto implements DependencyEndpoint {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  code!: string | null;

  @ApiProperty()
  name!: string;
}

/**
 * Public representation of a cross-plan dependency — a directed, typed, lagged LIVE edge from a
 * predecessor activity in one plan to a successor activity in ANOTHER plan of the same org
 * (ADR-0045). Both plan ids are surfaced (denormalised); the endpoints are embedded as light
 * summaries so a link list renders without extra fetches. Unlike a same-plan dependency it carries
 * no `isDriving` flag — the engine never consumes cross-plan edges (they are derived above it).
 */
export class CrossPlanDependencyResponseDto implements CrossPlanDependencySummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The plan the predecessor activity belongs to.' })
  predecessorPlanId!: string;

  @ApiProperty({ format: 'uuid', description: 'The plan the successor activity belongs to.' })
  successorPlanId!: string;

  @ApiProperty({ enum: DependencyType })
  type!: DependencyType;

  @ApiProperty({
    description:
      'Signed lag in working days (a lead is negative), ROUNDED from the stored minutes. A day is ' +
      'the standard working day of THIS LINK’S LAG CALENDAR (ADR-0068 §4) — an eight-hour ' +
      'calendar counts 480 minutes to the day; `TWENTY_FOUR_HOUR` is pinned at 1440.',
  })
  lagDays!: number;

  @ApiProperty({
    description:
      'Signed lag in working MINUTES on the lag calendar — what is stored and what the ' +
      'programme recalculation applies (#385). Read-only: a cross-plan link is created with ' +
      'whole `lagDays` only.',
  })
  lagMinutes!: number;

  @ApiProperty({
    enum: LagCalendarSource,
    description:
      'The calendar the lag is measured on (ADR-0036 §6). TWENTY_FOUR_HOUR = elapsed time; ' +
      'PROJECT_DEFAULT = the SUCCESSOR activity’s plan’s calendar, in both directions (#385 ' +
      'CQ-2: the link’s home plan); PREDECESSOR / SUCCESSOR = that endpoint activity’s ' +
      'scheduling calendar (its driving resource’s for a RESOURCE_DEPENDENT activity, else its ' +
      'own, else ITS OWN plan’s).',
  })
  lagCalendar!: LagCalendarSource;

  @ApiProperty({ type: CrossPlanDependencyEndpointDto })
  predecessor!: DependencyEndpoint;

  @ApiProperty({ type: CrossPlanDependencyEndpointDto })
  successor!: DependencyEndpoint;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  /**
   * Built from a link carrying its lag factor, which the service resolves before any response
   * (`withLagDayFactor(s)`, #385 M2-T3b). The type makes the factor unforgettable: `lagDays`
   * divides the stored working minutes by the factor the write multiplied them by, never by 1440.
   */
  static from(entity: CrossPlanDependencyWithFactor): CrossPlanDependencyResponseDto {
    return {
      id: entity.id,
      predecessorPlanId: entity.predecessorPlanId,
      successorPlanId: entity.successorPlanId,
      type: entity.type,
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
      version: entity.version,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
