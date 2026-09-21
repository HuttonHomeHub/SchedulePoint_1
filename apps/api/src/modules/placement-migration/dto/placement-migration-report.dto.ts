import { ApiProperty } from '@nestjs/swagger';
import { ConstraintType } from '@prisma/client';
import type { PlacementMigrationReport, PlacementMigrationRow } from '@repo/types';

/** One constraint the placement migration removed, and what stood there before it. */
export class PlacementMigrationRowDto implements PlacementMigrationRow {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The activity the constraint was on. A plain correlation id with NO foreign key — the row ' +
      'survives the activity being deleted, which is when it is most wanted.',
  })
  activityId!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The activity’s code as it stood at migration time. Never refreshed by a rename.',
  })
  activityCode!: string | null;

  @ApiProperty({ description: 'The activity’s name as it stood at migration time.' })
  activityName!: string;

  /**
   * **`enum:` with the PRISMA-GENERATED runtime enum, not the `@repo/types` union.**
   *
   * This repository runs no `@nestjs/swagger` CLI plugin (`nest-cli.json` declares no `plugins`),
   * so Nest falls back to reflected `design:type` metadata — and a type-only import of a bare TS
   * union erases to `Object`. Declared that way the generated spec would not say this field is
   * restricted to the eight constraint labels at all. Every sibling gets this right by importing
   * the Prisma enum object (`activity-response.dto.ts:82`); this one did not until the M-J gate
   * pass.
   */
  @ApiProperty({
    enum: ConstraintType,
    description:
      'The removed constraint’s type — `SNET` (start no earlier than) for every row the strip ' +
      'writes, because its WHERE names that one kind and no other. The stored enum label, not a ' +
      'display string: a renderer wanting words goes through CONSTRAINT_TYPE_LABELS, as every ' +
      'other constraint read-out in the product does.',
  })
  priorConstraintType!: ConstraintType;

  @ApiProperty({
    format: 'date',
    description: 'The removed constraint’s date. The activity’s `visualStart` now carries it.',
  })
  priorConstraintDate!: string;

  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description:
      'The `visualStart` the write replaced. Expected null on every row — the migration excludes ' +
      'an activity that already carries one — so a value here means that exclusion failed and a ' +
      'hand-placement was overwritten. It is a finding, not a datum.',
  })
  priorVisualStart!: string | null;

  @ApiProperty({ format: 'date-time', description: 'One instant shared by the whole batch.' })
  migratedAt!: string;
}

/**
 * What the one-time placement migration (one-planning-surface M-I) did to this plan.
 *
 * **It reports what CHANGED and nothing else.** The migration also leaves three classes of
 * start-no-earlier-than constraint alone — inert, unclassified and already-placed — and they are absent
 * here because nothing happened to them: a constraint left in place is still a constraint doing
 * its job, so there is no change to report. Their estate-wide classification belongs to the
 * ADR-0140 staff diagnostics (`snet-inert`, `snet-unclassified`), which are addressed to an
 * operator rather than to a planner.
 */
export class PlacementMigrationReportDto implements PlacementMigrationReport {
  @ApiProperty({ format: 'uuid' })
  planId!: string;

  @ApiProperty({
    description:
      'How many constraints were converted to placements on this plan. Redundant with `rows.length` ' +
      'today, because the read is deliberately uncapped — and sent anyway, so the first cap added ' +
      'cannot silently turn the array’s length into a different quantity for a client that had been ' +
      'reading it as the total.',
  })
  count!: number;

  @ApiProperty({
    type: [PlacementMigrationRowDto],
    description:
      'Oldest first. Empty when none. **Unpaginated, and the exemption is noted here per the house ' +
      'rule in docs/API.md:** the rows are written once by a schema migration and by nothing else, ' +
      'so a plan’s count is fixed at that instant and can never grow — a cursor would be a contract ' +
      'with no subject.',
  })
  rows!: readonly PlacementMigrationRow[];

  static from(report: PlacementMigrationReport): PlacementMigrationReportDto {
    return Object.assign(new PlacementMigrationReportDto(), report);
  }
}
