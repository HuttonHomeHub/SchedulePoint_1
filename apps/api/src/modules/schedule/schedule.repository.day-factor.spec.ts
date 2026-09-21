import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service';

import { ScheduleRepository } from './schedule.repository';

/** One engine result, minutes as the engine emits them. */
function result(
  activityId: string,
  totalFloatMinutes: number,
  visualDriftMinutes: number | null = null,
) {
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
    // Null throughout: these fixtures are about the day-factor conversion, and a conflict reason
    // takes no factor. Present because `EngineResult` requires it (M-D), not because it is under
    // test here.
    visualConflictReason: null,
    visualDriftMinutes,
    // The engine subtracts in MINUTES; this mirrors it so the fixture cannot disagree with the
    // thing it is measuring (M-D, `docs/specs/one-planning-surface/` §4.3).
    remainingFloatMinutes: totalFloatMinutes - (visualDriftMinutes ?? 0),
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

/**
 * **FC-4 — remaining float is right exactly where the naive version is wrong** (M-D,
 * `docs/specs/one-planning-surface/falsification.md`).
 *
 * `remaining_float` could be derived two ways and they are different numbers:
 *
 * - naive, from the two day-denominated columns a client can see: `round(T/f) − round(d/f)`
 * - correct, from the engine's minute quantity, divided once: `round((T − d)/f)`
 *
 * **A fixture where they agree passes against both implementations**, which is the shape ADR-0139
 * records shipping once: its whole-day branch was output-insensitive to the factor, so a test
 * written with a whole-day value could not tell the defect from the fix. So the numbers here are
 * chosen from an enumeration of where the two forms disagree, and the case asserts the value the
 * naive form CANNOT produce.
 *
 * **Why the drift has to be sub-day for this to be reachable at all**, stated because it looks like
 * an arbitrary fixture otherwise: `visualStart` is a DATE, so a placement lands on a working-day
 * boundary. Where the activity's early start is ALSO day-aligned the drift is a whole multiple of
 * the factor, `round(d/f)` is exact, and the two forms agree identically — enumerated over 1,284
 * disagreeing pairs at 30-minute granularity, **not one** of which has a day-aligned drift. The
 * disagreement needs a non-aligned early start, which a sub-day duration (ADR-0070) produces
 * routinely: a successor of a four-hour task starts half an eight-hour day in.
 *
 * **What this case CANNOT see, measured rather than assumed.** It asserts the argument array handed
 * to `$executeRaw`, which is mocked here — so deleting `remaining_float = v.remaining_float` from
 * the `UPDATE SET` leaves it **green** while the computed value reaches no column at all. Checked by
 * doing it. Three mutations were run against this case: the naive two-column subtraction and a
 * missing factor both turn it red; the dropped assignment does not. That half is covered by
 * `placed-basis-parity.e2e-spec.ts`, which reads the value back over the real route from a real
 * database, and the two are not interchangeable.
 */
describe('writeResults — remaining float is one rounding, not two (FC-4)', () => {
  it('reports round((T − d)/f), which the naive column subtraction cannot produce', async () => {
    const captured: unknown[][] = [];
    const tx = {
      $executeRaw: vi.fn((_s: unknown, ...args: unknown[]) => {
        captured.push(args);
        return Promise.resolve(1);
      }),
    };
    const repo = new ScheduleRepository({
      $executeRaw: vi.fn(() => Promise.resolve(1)),
    } as unknown as PrismaService);

    // An eight-hour calendar (480 working minutes a day). T = 0 — a critical activity — placed
    // 720 working minutes out, which is a day and a half: the shape a four-hour predecessor and a
    // two-day placement produce (2 × 480 − 240).
    const FACTOR = 480;
    const T = 0;
    const D = 720;
    await repo.writeResults(
      'org-1',
      'plan-1',
      [result('a', T, D)],
      new Map([['a', FACTOR]]),
      tx as never,
    );

    // The arithmetic, spelled out, because the whole case is that these are different numbers.
    const naive = Math.round(T / FACTOR) - Math.round(D / FACTOR); // 0 − 2 = −2
    const correct = Math.round((T - D) / FACTOR); // round(−1.5) === −1
    expect(naive, 'the fixture must make the two forms disagree, or it tests nothing').not.toBe(
      correct,
    );
    expect(naive).toBe(-2);
    expect(correct).toBe(-1);

    // Located by INDEX, with its neighbours asserted. The first draft of this case searched for a
    // single-element array holding the expected value and would have matched `total_float` — which
    // is ALSO [0] at T = 0 — so it could have passed while reading a different column entirely.
    // These three numbers are all distinct by construction, which is why this fixture and not one
    // of the other 1,283 disagreeing pairs.
    const args = captured[0]!;
    expect(args[5], 'total_float is the 6th unnest argument').toEqual([Math.round(T / FACTOR)]);
    expect(args[16], 'visual_drift_days is the 17th').toEqual([Math.round(D / FACTOR)]);
    expect(args[17], 'remaining_float is the 18th, and it is the correct form').toEqual([correct]);
  });
});
