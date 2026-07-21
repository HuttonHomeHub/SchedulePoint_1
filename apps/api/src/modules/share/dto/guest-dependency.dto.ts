import { ApiProperty } from '@nestjs/swagger';
import { DependencyType } from '@prisma/client';

import type { DependencyWithEndpoints } from '../../dependencies/dependency.repository';

/** Day↔minute factor (ADR-0036 §4.2): lag is stored in signed minutes, exposed as signed days. */
const MINUTES_PER_DAY = 1440;

/**
 * Guest read DTO for a dependency edge (ADR-0051 §4, F-M3) — the READ-ONLY logic tie the
 * TSLD needs to draw a link. Field-stripped to exactly the ADR scope: the edge id, its two
 * endpoints (by id only), the type, and the lag. It references endpoints by id — it does NOT
 * embed the endpoint name/code summaries the member DTO carries (the guest already has the
 * activity list) — and it deliberately omits the engine-owned `isDriving`, `lagCalendar`, and
 * ALL audit columns (version/createdAt/updatedAt/created-by). No `from` copies anything else.
 */
export class GuestDependencyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The predecessor activity id.' })
  predecessorId!: string;

  @ApiProperty({ format: 'uuid', description: 'The successor activity id.' })
  successorId!: string;

  @ApiProperty({ enum: DependencyType })
  type!: DependencyType;

  @ApiProperty({ description: 'Signed lag in working days (a lead is negative).' })
  lagDays!: number;

  static from(entity: DependencyWithEndpoints): GuestDependencyDto {
    return {
      id: entity.id,
      predecessorId: entity.predecessorId,
      successorId: entity.successorId,
      type: entity.type,
      // Stored as signed working-minutes (ADR-0036); the public field stays signed days.
      lagDays: Math.round(entity.lagMinutes / MINUTES_PER_DAY),
    };
  }
}
