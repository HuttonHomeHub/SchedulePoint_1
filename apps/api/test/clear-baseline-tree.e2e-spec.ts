import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { baselineChildModels, clearBaselineTree } from './clear-baseline-tree';

/**
 * `docs/TECH_DEBT.md` #253 — the helper that replaced thirteen hand-written copies.
 *
 * **It uses no database, and it is an `.e2e-spec.ts` anyway** because the unit config includes
 * `src/**` only and this helper deliberately lives in `test/` (nothing in `src/` may import it).
 * Named honestly rather than moved: the alternative was putting a test-harness helper into
 * production source to make a glob happy.
 *
 * **What these cases can and cannot prove.** The behaviour — "a reset leaves no baselines" — is
 * already proven every run by the thirteen specs that call this, and by the 557 failures that
 * followed the last time a child was missed. What those thirteen structurally CANNOT catch is the
 * derivation being replaced by a literal list: a hard-coded `['BaselineActivity', …]` passes all of
 * them and then silently misses the fourteenth child table, which is the entire defect this helper
 * exists to prevent. So the assertions below watch the delegates the helper actually drives, rather
 * than re-deriving the DMMF walk and comparing it with itself — a test asserting against a private
 * mirror of the logic it is testing would pass through exactly the regression it is written for.
 */
describe('clearBaselineTree', () => {
  it('names every current child of Baseline, and BaselineDependency in particular', () => {
    // A PINNED POSITIVE CASE, not decoration. "Every model it returns is a child" would pass
    // perfectly against a walk that returns NOTHING — the shape that lets a green suite mean the
    // sweep has quietly stopped sweeping. `BaselineDependency` is named because it is the child
    // whose omission failed 557 tests at once (ADR-0126).
    expect(baselineChildModels().sort()).toEqual([
      'BaselineActivity',
      'BaselineAssignment',
      'BaselineDependency',
    ]);
  });

  it('deletes every child before the baseline itself', async () => {
    const calls: string[] = [];
    const delegate = (name: string) => ({
      deleteMany: vi.fn(() => {
        calls.push(name);
        return Promise.resolve({ count: 0 });
      }),
    });
    const stub = {
      baselineActivity: delegate('BaselineActivity'),
      baselineAssignment: delegate('BaselineAssignment'),
      baselineDependency: delegate('BaselineDependency'),
      baseline: delegate('Baseline'),
    } as unknown as PrismaClient;

    await clearBaselineTree(stub);

    // The parent goes LAST — that ordering is the whole point, since each child holds a RESTRICT
    // foreign key into it. The children's relative order is deliberately not asserted: the helper
    // proves they are independent of one another and throws if that ever stops being true, so
    // pinning an order here would fail on a harmless DMMF reordering.
    expect(calls).toHaveLength(4);
    expect(calls.at(-1)).toBe('Baseline');
    expect(calls.slice(0, 3).sort()).toEqual([
      'BaselineActivity',
      'BaselineAssignment',
      'BaselineDependency',
    ]);
  });

  it('throws rather than guessing when a delegate is missing', async () => {
    // The DMMF names a child, the client has no property for it: a naming assumption has stopped
    // holding. Failing loudly beats deleting two of three children and reporting success.
    await expect(clearBaselineTree({} as unknown as PrismaClient)).rejects.toThrow(
      /no Prisma delegate for model/,
    );
  });
});
