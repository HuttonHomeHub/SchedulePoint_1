import { describe, expect, it } from 'vitest';

import { isDerivedSpanType, statedDuration } from './stated-duration';

const stored = { durationDays: 3, durationMinutes: 1440 * 3 };

describe('statedDuration (ADR-0197)', () => {
  it('is the stored duration for every type that has one', () => {
    for (const type of ['TASK', 'RESOURCE_DEPENDENT', 'HAMMOCK', 'START_MILESTONE']) {
      expect(statedDuration({ type, ...stored })).toEqual(stored);
    }
  });

  it.each(['WBS_SUMMARY', 'LEVEL_OF_EFFORT'])('is the derived span for a %s', (type) => {
    expect(
      statedDuration({
        type,
        durationDays: 0,
        durationMinutes: 0,
        derivedDurationDays: 47,
        derivedDurationMinutes: 47 * 1440,
      }),
    ).toEqual({ durationDays: 47, durationMinutes: 47 * 1440 });
  });

  it.each(['WBS_SUMMARY', 'LEVEL_OF_EFFORT'])(
    'is null for a %s the engine wrote nothing for, never the stored zero',
    (type) => {
      expect(
        statedDuration({ type, durationDays: 0, durationMinutes: 0, derivedDurationMinutes: null }),
      ).toBeNull();
      expect(statedDuration({ type, durationDays: 0, durationMinutes: 0 })).toBeNull();
    },
  );

  it('keeps a derived zero, which is a measurement', () => {
    expect(
      statedDuration({
        type: 'WBS_SUMMARY',
        durationDays: 0,
        durationMinutes: 0,
        derivedDurationDays: 0,
        derivedDurationMinutes: 0,
      }),
    ).toEqual({ durationDays: 0, durationMinutes: 0 });
  });
});

describe('isDerivedSpanType', () => {
  it('names the two types whose length is derived', () => {
    expect(isDerivedSpanType('WBS_SUMMARY')).toBe(true);
    expect(isDerivedSpanType('LEVEL_OF_EFFORT')).toBe(true);
    expect(isDerivedSpanType('TASK')).toBe(false);
    expect(isDerivedSpanType('FINISH_MILESTONE')).toBe(false);
  });
});
