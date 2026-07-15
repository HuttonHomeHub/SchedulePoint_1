import { ApiProperty } from '@nestjs/swagger';
import { DependencyType } from '@prisma/client';
import type { DependencyEndpoint, DependencySummary } from '@repo/types';

import type { DependencyWithEndpoints } from '../dependency.repository';

/** Day↔minute factor (ADR-0036 §4.2): lag is stored in signed minutes, exposed as signed days. */
const MINUTES_PER_DAY = 1440;

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

  @ApiProperty({ description: 'Signed lag in working days (a lead is negative).' })
  lagDays!: number;

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

  static from(entity: DependencyWithEndpoints): DependencyResponseDto {
    return {
      id: entity.id,
      planId: entity.planId,
      type: entity.type,
      // Stored as signed working-minutes (ADR-0036); the public field stays signed days.
      lagDays: Math.round(entity.lagMinutes / MINUTES_PER_DAY),
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
