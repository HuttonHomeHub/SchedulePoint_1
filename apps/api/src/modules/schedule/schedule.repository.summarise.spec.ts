import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';

import { ScheduleRepository } from './schedule.repository';

/**
 * `#404` (ADR-0148): the header's project finish is the latest **drawn** finish. The aggregate is one
 * SQL statement, so the assertion is on the statement the repository sends — a mock database cannot
 * say what `MAX` ranged over, but it can say which column the statement asked it to range over.
 */
function sqlOf(strings: readonly string[], values: readonly unknown[]): string {
  return strings.reduce((sql, chunk, i) => {
    const value = values[i];
    // A nested `Prisma.sql` / `Prisma.raw` fragment arrives as an object carrying its text.
    const fragment =
      typeof value === 'object' && value !== null && 'sql' in value ? String(value.sql) : '';
    return sql + chunk + fragment;
  }, '');
}

describe('summarise — the project finish is the placed finish (#404)', () => {
  it('takes the latest of the placed finish, falling back to the early finish where none is recorded', async () => {
    let statement = '';
    const prisma = {
      $queryRaw: vi.fn((strings: readonly string[], ...values: unknown[]) => {
        statement = sqlOf(strings, values);
        return Promise.resolve([
          {
            activity_count: 0n,
            critical_count: 0n,
            near_critical_count: 0n,
            constraint_violation_count: 0n,
            external_driven_count: 0n,
            constraint_warning_count: 0n,
            loe_no_span_count: 0n,
            resource_driver_missing_count: 0n,
            leveled_activity_count: 0n,
            leveling_window_exceeded_count: 0n,
            self_over_allocated_count: 0n,
            leveled_project_finish: null,
            project_finish: null,
          },
        ]);
      }),
    };
    const repo = new ScheduleRepository(prisma as unknown as PrismaService);

    await repo.summarise('org', 'plan');

    expect(statement).toContain(
      "to_char(MAX(COALESCE(visual_effective_finish, early_finish)), 'YYYY-MM-DD') AS project_finish",
    );
  });
});
