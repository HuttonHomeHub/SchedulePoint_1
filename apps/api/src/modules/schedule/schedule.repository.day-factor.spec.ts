import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';

import { ScheduleRepository } from './schedule.repository';

/** One engine result, minutes as the engine emits them. */
function result(activityId: string, totalFloatMinutes: number) {
  return {
    activityId,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    lateStart: '2026-01-05',
    lateFinish: '2026-01-09',
    earlyStartOffset: 0,
    earlyFinishOffset: 0,
    lateStartOffset: 0,
    lateFinishOffset: 0,
    totalFloat: totalFloatMinutes,
    freeFloat: totalFloatMinutes,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    visualEffectiveStart: '2026-01-05',
    visualEffectiveFinish: '2026-01-09',
    visualConflict: false,
    visualDriftMinutes: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayMinutes: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
  };
}

/**
 * ADR-0068 §3a. `total_float` and `free_float` are persisted **in days** by the recalculation's own
 * batched write, so they take the same factor the activity's duration does — otherwise one span
 * reads as "3 days of work with 1 day of float", which is not a smaller change than converting them.
 */
describe('writeResults — float is persisted in the activity’s own calendar days', () => {
  function repositoryCapturing(): {
    repo: ScheduleRepository;
    params: () => unknown[];
  } {
    const calls: unknown[][] = [];
    const prisma = {
      $executeRaw: vi.fn((_strings: unknown, ...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve(1);
      }),
    };
    const db = prisma as unknown as PrismaService;
    return {
      repo: new ScheduleRepository(db),
      params: () => calls[0] ?? [],
    };
  }

  it('divides by each activity’s own factor, not by a constant', async () => {
    const { repo, params } = repositoryCapturing();
    const tx = {
      $executeRaw: vi.fn(() => Promise.resolve(1)),
    };
    const captured: unknown[][] = [];
    tx.$executeRaw = vi.fn((_s: unknown, ...args: unknown[]) => {
      captured.push(args);
      // The write asserts it touched one row per result.
      return Promise.resolve(2);
    }) as never;

    await repo.writeResults(
      'org-1',
      'plan-1',
      // 1080 minutes of float: three days on a 6-hour calendar, one on a 24-hour one.
      [result('a-short', 1080), result('a-full', 1080)],
      new Map([
        ['a-short', 360],
        ['a-full', 1440],
      ]),
      tx as never,
    );

    const args = captured[0]!;
    const twoNumberArrays = args.filter(
      (a): a is number[] =>
        Array.isArray(a) && a.length === 2 && a.every((v) => typeof v === 'number'),
    );
    // total_float and free_float both carry 1080 minutes: 3 days at 360 min/day, 1 at 1440.
    expect(twoNumberArrays).toContainEqual([3, 1]);
    // And the old behaviour — a flat 1440 for both — must not appear anywhere in the write.
    expect(twoNumberArrays).not.toContainEqual([1, 1]);
    void params;
  });
});
