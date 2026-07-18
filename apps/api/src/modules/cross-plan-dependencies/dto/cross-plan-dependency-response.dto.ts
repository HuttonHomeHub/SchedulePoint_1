import { ApiProperty } from '@nestjs/swagger';
import { DependencyType, LagCalendarSource } from '@prisma/client';
import type { CrossPlanDependencySummary, DependencyEndpoint } from '@repo/types';

import type { CrossPlanDependencyWithEndpoints } from '../cross-plan-dependency.repository';

/** Day↔minute factor (ADR-0036 §4.2): lag is stored in signed minutes, exposed as signed days. */
const MINUTES_PER_DAY = 1440;

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

  @ApiProperty({ description: 'Signed lag in working days (a lead is negative).' })
  lagDays!: number;

  @ApiProperty({
    enum: LagCalendarSource,
    description:
      'The calendar the lag is measured on (ADR-0036 §6). TWENTY_FOUR_HOUR = elapsed time; the rest schedule on the plan calendar today.',
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

  static from(entity: CrossPlanDependencyWithEndpoints): CrossPlanDependencyResponseDto {
    return {
      id: entity.id,
      predecessorPlanId: entity.predecessorPlanId,
      successorPlanId: entity.successorPlanId,
      type: entity.type,
      // Stored as signed working-minutes (ADR-0036); the public field stays signed days.
      lagDays: Math.round(entity.lagMinutes / MINUTES_PER_DAY),
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
