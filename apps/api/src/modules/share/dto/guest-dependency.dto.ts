import { ApiProperty } from '@nestjs/swagger';
import { DependencyType } from '@prisma/client';

import { minutesToDays } from '../../activities/day-factor';
import type { DependencyWithEndpoints } from '../../dependencies/dependency.repository';
import type { WithLagDayFactor } from '../../dependencies/lag-day-factor';

/**
 * Guest read DTO for a dependency edge (ADR-0051 §4, F-M3; widened by ADR-0198) — the READ-ONLY
 * logic tie the TSLD needs to draw a link. Field-stripped to exactly the ADR scope: the edge id,
 * its two endpoints (by id only), the type, the lag, and the engine-owned `isDriving` link flag.
 * It references endpoints by id — it does NOT embed the endpoint name/code summaries the member
 * DTO carries (the guest already has the activity list) — and it deliberately omits
 * `lagCalendar` and ALL audit columns (version/createdAt/updatedAt/created-by). No `from` copies
 * anything else.
 *
 * `isDriving` is ONE bit per link, computed over inputs the guest cannot see (the lag and
 * successor calendars) and so recoverable into none of them (ADR-0198 D2). It is the LINK's flag
 * only: `ResourceAssignment.isDriving` (which resource drives) stays excluded.
 *
 * `lagDays` is measured on the relationship's OWN `lagCalendar` (ADR-0068 §4), the same rule the
 * member DTO applies — `from` takes a row already carrying `lagDayFactorMinutes`
 * ({@link WithLagDayFactor}, attached by `ShareGuestService` via `attachLagDayFactors`, the SAME
 * helper the member path calls) rather than hard-pinning 1440, which read an eight-hour lag calendar's
 * one-day lag as zero (`docs/TECH_DEBT.md` #316).
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

  @ApiProperty({
    description:
      'Signed lag in working days (a lead is negative), rounded from the stored minutes. A ' +
      'sub-day lag reads back here as 0 — read `lagMinutes` for the exact value.',
  })
  lagDays!: number;

  @ApiProperty({
    description:
      'Signed lag in working MINUTES — what is stored and what the engine applied (ADR-0036). ' +
      'The exact form of a field already exposed, for the same reason as `durationMinutes`.',
  })
  lagMinutes!: number;

  @ApiProperty({
    description:
      'Engine-owned: true when this link sets its successor’s early start. Not the resource ' +
      'assignment’s driving flag, which is never exposed.',
  })
  isDriving!: boolean;

  static from(entity: WithLagDayFactor<DependencyWithEndpoints>): GuestDependencyDto {
    return {
      id: entity.id,
      predecessorId: entity.predecessorId,
      successorId: entity.successorId,
      type: entity.type,
      // Stored as signed working-minutes (ADR-0036); both forms are exposed. Converted on the
      // relationship's OWN lag calendar, exactly as the member DTO does (`docs/TECH_DEBT.md` #316).
      lagDays: minutesToDays(entity.lagMinutes, entity.lagDayFactorMinutes),
      lagMinutes: entity.lagMinutes,
      isDriving: entity.isDriving,
    };
  }
}
