import { describe, expect, it } from 'vitest';

import {
  CONFLICT_FLAGS,
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
    visualConflict: false,
    externalDriven: false,
    levelingWindowExceeded: false,
    totalFloat: 5,
    ...over,
  };
}

describe('CONFLICT_FLAGS (the v1 set, CQ-2)', () => {
  it('covers exactly the five v1 flags, near-critical excluded', () => {
    expect(CONFLICT_FLAGS.map((f) => f.key)).toEqual([
      'constraintViolated',
      'visualConflict',
      'externalDriven',
      'levelingWindowExceeded',
      'negativeFloat',
    ]);
  });

  it('maps each flag to its own reason label', () => {
    expect(orderedConflicts([activity({ id: 'x', constraintViolated: true })])[0]?.reasons).toEqual(
      ['constraint conflict'],
    );
    expect(orderedConflicts([activity({ id: 'x', visualConflict: true })])[0]?.reasons).toEqual([
      'visual placement conflict',
    ]);
    expect(orderedConflicts([activity({ id: 'x', externalDriven: true })])[0]?.reasons).toEqual([
      'external date driver',
    ]);
    expect(
      orderedConflicts([activity({ id: 'x', levelingWindowExceeded: true })])[0]?.reasons,
    ).toEqual(['levelling window exceeded']);
    expect(orderedConflicts([activity({ id: 'x', totalFloat: -3 })])[0]?.reasons).toEqual([
      'negative total float',
    ]);
  });

  it('does not flag zero or positive total float (only negative)', () => {
    expect(orderedConflicts([activity({ totalFloat: 0 }), activity({ totalFloat: 5 })])).toEqual(
      [],
    );
  });
});

describe('orderedConflicts', () => {
  it('returns an empty list when nothing is flagged', () => {
    expect(orderedConflicts([activity(), activity({ id: 'b' })])).toEqual([]);
  });

  it('lists every reason for a multi-flag activity, in flag order', () => {
    const hit = orderedConflicts([
      activity({ id: 'x', constraintViolated: true, visualConflict: true, totalFloat: -1 }),
    ])[0];
    expect(hit?.reasons).toEqual([
      'constraint conflict',
      'visual placement conflict',
      'negative total float',
    ]);
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
