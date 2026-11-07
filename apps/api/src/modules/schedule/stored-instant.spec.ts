import { describe, expect, it } from 'vitest';

import { trustedInstantMinutes } from './stored-instant';

const AT = new Date('2026-02-01T09:00:00.000Z');
const current = { planScheduleComputedAt: AT, planInstantsComputedAt: new Date(AT) };

describe('trustedInstantMinutes (ADR-0212 D4)', () => {
  it('reads the stored UTC timestamp as the engine’s absolute minute, a pre-1970 value included', () => {
    expect(trustedInstantMinutes(new Date('1970-01-01T00:00:00.000Z'), current)).toBe(0);
    expect(trustedInstantMinutes(new Date('2026-01-10T06:00:00.000Z'), current)).toBe(
      Date.UTC(2026, 0, 10, 6) / 60_000,
    );
    expect(trustedInstantMinutes(new Date('1969-12-31T23:00:00.000Z'), current)).toBe(-60);
  });

  it('is null for a null instant', () => {
    expect(trustedInstantMinutes(null, current)).toBeNull();
  });

  it('is null unless both stamps are set and EQUAL to the millisecond', () => {
    const instant = new Date('2026-01-10T06:00:00.000Z');
    expect(trustedInstantMinutes(instant, { ...current, planInstantsComputedAt: null })).toBeNull();
    expect(trustedInstantMinutes(instant, { ...current, planScheduleComputedAt: null })).toBeNull();
    expect(
      trustedInstantMinutes(instant, {
        planScheduleComputedAt: new Date(AT.getTime() + 1),
        planInstantsComputedAt: AT,
      }),
    ).toBeNull();
    // Newer instants than the cursor are not current either: equality, not ordering (design B3).
    expect(
      trustedInstantMinutes(instant, {
        planScheduleComputedAt: AT,
        planInstantsComputedAt: new Date(AT.getTime() + 1),
      }),
    ).toBeNull();
  });

  it('refuses a value that is not a whole minute rather than reading a wrong bound', () => {
    expect(() => trustedInstantMinutes(new Date('2026-01-10T06:00:30.000Z'), current)).toThrow(
      /not a whole minute/,
    );
  });
});
