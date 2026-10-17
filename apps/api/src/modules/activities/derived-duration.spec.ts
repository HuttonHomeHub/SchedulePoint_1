import { describe, expect, it } from 'vitest';

import { derivedDuration } from './day-factor';

/**
 * The two response fields for a summary's / level-of-effort's engine-derived duration (ADR-0197).
 * `ActivityResponseDto.from` and `GuestActivityDto.from` both spread this, so the type gate is pinned
 * once here and the guest allowlist in `guest-dto.spec.ts` pins the field names.
 */
describe('derivedDuration', () => {
  it.each(['WBS_SUMMARY', 'LEVEL_OF_EFFORT'] as const)('states the figure for a %s', (type) => {
    expect(derivedDuration({ type, derivedDurationMinutes: 6720, dayFactorMinutes: 1440 })).toEqual(
      { derivedDurationMinutes: 6720, derivedDurationDays: 5 },
    );
  });

  it('divides on the row own day factor, rounding to the nearest day', () => {
    // 720 minutes on an eight-hour calendar is a day and a half; Math.round(1.5) is 2.
    expect(
      derivedDuration({
        type: 'WBS_SUMMARY',
        derivedDurationMinutes: 720,
        dayFactorMinutes: 480,
      }),
    ).toEqual({ derivedDurationMinutes: 720, derivedDurationDays: 2 });
  });

  it('is null where the engine wrote none, and a stored zero stays a zero', () => {
    expect(
      derivedDuration({
        type: 'WBS_SUMMARY',
        derivedDurationMinutes: null,
        dayFactorMinutes: 1440,
      }),
    ).toEqual({ derivedDurationMinutes: null, derivedDurationDays: null });
    expect(
      derivedDuration({ type: 'WBS_SUMMARY', derivedDurationMinutes: 0, dayFactorMinutes: 1440 }),
    ).toEqual({ derivedDurationMinutes: 0, derivedDurationDays: 0 });
  });

  it.each(['TASK', 'START_MILESTONE', 'FINISH_MILESTONE', 'RESOURCE_DEPENDENT'] as const)(
    'withholds a stale value from a %s',
    (type) => {
      expect(
        derivedDuration({ type, derivedDurationMinutes: 6720, dayFactorMinutes: 1440 }),
      ).toEqual({ derivedDurationMinutes: null, derivedDurationDays: null });
    },
  );
});
