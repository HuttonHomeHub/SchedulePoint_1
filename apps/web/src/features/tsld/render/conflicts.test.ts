import { describe, expect, it } from 'vitest';

import {
  CONFLICT_FLAGS,
  joinConflictReasons,
  matchingConflictFlags,
  nextConflictIndex,
  orderedConflicts,
  type ConflictableActivity,
} from './conflicts';

/** A clean (unflagged) activity; overrides flip one flag / set ordering keys. */
function activity(over: Partial<ConflictableActivity> = {}): ConflictableActivity {
  return {
    id: 'a',
    name: 'A',
    earlyStart: '2026-01-01',
    laneIndex: 0,
    constraintViolated: false,
    visualConflictReason: null,
    levelingWindowExceeded: false,
    ...over,
  };
}

describe('CONFLICT_FLAGS', () => {
  // Pinned as an ordered SET, not a count. It held five until ADR-0094 took out the two members a
  // planner cannot act on: `externalDriven` (an imported date driving an activity is normal on a
  // programme, and `ScheduleSummaryStrip` already reports it) and `negativeFloat` (one root cause
  // counted N times down a chain, and the only member with no remedy — still visible via
  // `isCritical` and `FLOAT_BUCKETS[0]`). Near-critical was never in: it is a lens, not a conflict.
  // **Four since one-planning-surface M-D, and the new member is a SPLIT rather than an addition.**
  // The placement conflict was one key because the engine flag was one-sided; it now reports which
  // side, and the two sides do not share a remedy, so collapsing them here would carry the engine
  // fix as far as the count and throw it away at the thing a planner presses.
  it('covers exactly the four actionable flags, near-critical excluded', () => {
    expect(CONFLICT_FLAGS.map((f) => f.key)).toEqual([
      'constraintViolated',
      'visualEarlierThanLogic',
      'visualLaterThanBound',
      'levelingWindowExceeded',
    ]);
  });

  // The whole point of narrowing the set: a conflict a planner can do nothing about is not counted.
  it('does not flag an activity whose only trouble is negative float', () => {
    expect(orderedConflicts([activity({ id: 'x' })])).toEqual([]);
  });

  it('maps each flag to its own reason label', () => {
    expect(orderedConflicts([activity({ id: 'x', constraintViolated: true })])[0]?.reasons).toEqual(
      ['Constraint not met'],
    );
    expect(
      orderedConflicts([activity({ id: 'x', visualConflictReason: 'EARLIER_THAN_LOGIC' })])[0]
        ?.reasons,
    ).toEqual(['Placed before its logic allows']);
    expect(
      orderedConflicts([activity({ id: 'x', visualConflictReason: 'LATER_THAN_BOUND' })])[0]
        ?.reasons,
    ).toEqual(['Placed after its constraint date']);
    expect(
      orderedConflicts([activity({ id: 'x', levelingWindowExceeded: true })])[0]?.reasons,
    ).toEqual(["Can't be levelled within its window"]);
  });

  // `keys` is what the remedy is chosen by; `reasons` is what the planner reads. Two projections of
  // ONE match, so they cannot fall out of step — pinned here because picking a remedy by matching
  // display copy is the failure this field exists to prevent (ADR-0094 M1-T3).
  it('carries the matched keys alongside the reasons, in the same order', () => {
    const hit = orderedConflicts([
      activity({ id: 'x', constraintViolated: true, levelingWindowExceeded: true }),
    ])[0];
    expect(hit?.keys).toEqual(['constraintViolated', 'levelingWindowExceeded']);
    expect(hit?.reasons).toEqual(['Constraint not met', "Can't be levelled within its window"]);
    expect(hit?.keys).toHaveLength(hit?.reasons.length ?? -1);
  });
});

describe('orderedConflicts', () => {
  it('returns an empty list when nothing is flagged', () => {
    expect(orderedConflicts([activity(), activity({ id: 'b' })])).toEqual([]);
  });

  it('lists every reason for a multi-flag activity, in flag order', () => {
    const hit = orderedConflicts([
      activity({ id: 'x', constraintViolated: true, visualConflictReason: 'EARLIER_THAN_LOGIC' }),
    ])[0];
    expect(hit?.reasons).toEqual(['Constraint not met', 'Placed before its logic allows']);
  });

  it('orders by earlyStart → laneIndex → id', () => {
    const hits = orderedConflicts([
      activity({ id: 'later', earlyStart: '2026-02-01', constraintViolated: true }),
      activity({ id: 'z', earlyStart: '2026-01-01', laneIndex: 1, constraintViolated: true }),
      activity({ id: 'a', earlyStart: '2026-01-01', laneIndex: 1, constraintViolated: true }),
      activity({ id: 'lane0', earlyStart: '2026-01-01', laneIndex: 0, constraintViolated: true }),
    ]);
    // Same earlyStart: lower lane first (lane0), then within a lane by id (a before z); later date last.
    expect(hits.map((h) => h.id)).toEqual(['lane0', 'a', 'z', 'later']);
  });

  it('sorts a null earlyStart last', () => {
    const hits = orderedConflicts([
      activity({ id: 'uncomputed', earlyStart: null, constraintViolated: true }),
      activity({ id: 'dated', earlyStart: '2026-01-01', constraintViolated: true }),
    ]);
    expect(hits.map((h) => h.id)).toEqual(['dated', 'uncomputed']);
  });
});

describe('nextConflictIndex', () => {
  const hits = orderedConflicts([
    activity({ id: 'a', earlyStart: '2026-01-01', constraintViolated: true }),
    activity({ id: 'b', earlyStart: '2026-01-02', constraintViolated: true }),
    activity({ id: 'c', earlyStart: '2026-01-03', constraintViolated: true }),
  ]);

  it('starts from the first when no cursor is set', () => {
    expect(nextConflictIndex(null, hits)).toBe(0);
  });

  it('advances to the next after the cursor', () => {
    expect(nextConflictIndex('a', hits)).toBe(1);
    expect(nextConflictIndex('b', hits)).toBe(2);
  });

  it('wraps after the last', () => {
    expect(nextConflictIndex('c', hits)).toBe(0);
  });

  it('resumes from the start when the cursor is no longer flagged', () => {
    expect(nextConflictIndex('gone', hits)).toBe(0);
  });

  it('re-selects the same single conflict each press', () => {
    const single = [hits[0]!];
    expect(nextConflictIndex('a', single)).toBe(0);
    expect(nextConflictIndex(null, single)).toBe(0);
  });

  it('returns -1 for an empty list', () => {
    expect(nextConflictIndex(null, [])).toBe(-1);
  });
});

describe('matchingConflictFlags', () => {
  // The bar's reason line, the announcer, the remedy's lead and the Next-conflict keys all read this
  // one match. Every valid combination is checked rather than a sample: the two placement flags
  // are one engine field, so they are mutually exclusive and 2 x 3 x 2 = 12 states exist.
  const combos: ConflictableActivity[] = [];
  for (const constraintViolated of [false, true]) {
    for (const visualConflictReason of [null, 'EARLIER_THAN_LOGIC', 'LATER_THAN_BOUND'] as const) {
      for (const levelingWindowExceeded of [false, true]) {
        combos.push(
          activity({ id: 'x', constraintViolated, visualConflictReason, levelingWindowExceeded }),
        );
      }
    }
  }

  it('covers all twelve valid combinations', () => {
    expect(combos).toHaveLength(12);
  });

  it.each(combos.map((a, i) => [i, a] as const))(
    'combination %i: labels and keys equal what the cycle announces',
    (_i, a) => {
      const matched = matchingConflictFlags(a);
      const hit = orderedConflicts([a])[0];
      expect(matched.map((f) => f.label)).toEqual(hit?.reasons ?? []);
      expect(matched.map((f) => f.key)).toEqual(hit?.keys ?? []);
    },
  );

  it('returns an empty list for an unflagged activity', () => {
    expect(matchingConflictFlags(activity())).toEqual([]);
  });
});

describe('joinConflictReasons', () => {
  const two = ['Constraint not met', "Can't be levelled within its window"];

  it("'start' keeps only the first capital", () => {
    expect(joinConflictReasons(two, 'start')).toBe(
      "Constraint not met, can't be levelled within its window",
    );
  });

  it("'mid' lower-cases every first character, because words precede the line", () => {
    expect(joinConflictReasons(two, 'mid')).toBe(
      "constraint not met, can't be levelled within its window",
    );
  });

  it('changes only the first character of a label', () => {
    expect(joinConflictReasons(['Placed After ITS Date'], 'mid')).toBe('placed After ITS Date');
  });

  it('returns an empty string for no reasons', () => {
    expect(joinConflictReasons([], 'start')).toBe('');
  });
});
