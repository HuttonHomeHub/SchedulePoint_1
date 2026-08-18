import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(join(__dirname, 'overview.repository.ts'), 'utf8');

/**
 * The ordering key of "Recently changed" is a **derived** instant, not a stored one.
 *
 * Spec §0.1's finding: editing an activity does not stamp its plan, and the CPM
 * recalculation deliberately does not either (`ScheduleRepository.writeResults`, ADR-0022).
 * So an ordering on `plans.updated_at` ranks a plan somebody has been working in all
 * morning below one whose name was corrected last week — and it looks completely correct,
 * because every row on the screen is a real plan with a real timestamp. The screen would be
 * wrong in the one way nobody checks.
 *
 * **What this gate can and cannot do.** It reads the SQL text, so it proves the query still
 * asks the database for the right thing. It cannot prove the database answers correctly —
 * that is `overview.e2e-spec.ts`'s "ranks a plan by its newest activity" case, which builds
 * exactly the situation above against a real Postgres and fails against a naive ordering.
 * Two instruments, because either alone has a hole the other closes.
 */
describe('OverviewRepository (structural)', () => {
  it('orders by GREATEST across the plan, its activities and its dependencies', () => {
    expect(SOURCE).toMatch(/GREATEST\(\s*p\.updated_at,/);
    expect(SOURCE).toMatch(/ORDER BY changed_at DESC/);
  });

  it('reads the newest activity and the newest dependency, not just the plan row', () => {
    // Two laterals, each taking one row. Their absence is the naive ordering.
    const laterals = SOURCE.match(/LEFT JOIN LATERAL/g) ?? [];
    expect(laterals).toHaveLength(2);
    expect(SOURCE).toContain('FROM activities act');
    expect(SOURCE).toContain('FROM dependencies dep');
  });

  it('never orders the outer query by plans.updated_at alone', () => {
    // The specific wrong answer, named so a refactor towards it fails here rather than on
    // the screen.
    expect(SOURCE).not.toMatch(/ORDER BY\s+p\.updated_at/);
  });

  it('excludes soft-deleted rows from both laterals', () => {
    // A deleted activity is not a change somebody can go and look at, and its `updated_at`
    // is the instant it was deleted — so including it would rank a plan by work that is no
    // longer there.
    expect(SOURCE).toContain('act.deleted_at IS NULL');
    expect(SOURCE).toContain('dep.deleted_at IS NULL');
  });

  it('resolves actor names through org membership and never through users directly', () => {
    // The control, not a convenience: `users` alone would let this endpoint turn any user
    // id in the system into a display name.
    expect(SOURCE).toContain('this.prisma.orgMember.findMany');
    expect(SOURCE).not.toMatch(/this\.prisma\.user\.find/);
  });
});
