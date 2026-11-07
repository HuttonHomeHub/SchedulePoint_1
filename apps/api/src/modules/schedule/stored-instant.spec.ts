import { describe, expect, it, vi } from 'vitest';

import { trustedInstantMinutes } from './stored-instant';

const AT = new Date('2026-02-01T09:00:00.000Z');
const current = {
  id: 'act-1',
  planId: 'plan-1',
  planScheduleComputedAt: AT,
  planInstantsComputedAt: new Date(AT),
};
const onCorrupt = vi.fn();

describe('trustedInstantMinutes (ADR-0212 D4)', () => {
  it('reads the stored UTC timestamp as the engine’s absolute minute, a pre-1970 value included', () => {
    expect(trustedInstantMinutes(new Date('1970-01-01T00:00:00.000Z'), current, onCorrupt)).toBe(0);
    expect(trustedInstantMinutes(new Date('2026-01-10T06:00:00.000Z'), current, onCorrupt)).toBe(
      Date.UTC(2026, 0, 10, 6) / 60_000,
    );
    expect(trustedInstantMinutes(new Date('1969-12-31T23:00:00.000Z'), current, onCorrupt)).toBe(
      -60,
    );
  });

  it('is null for a null instant', () => {
    expect(trustedInstantMinutes(null, current, onCorrupt)).toBeNull();
  });

  it('is null unless both stamps are set and EQUAL to the millisecond', () => {
    const instant = new Date('2026-01-10T06:00:00.000Z');
    expect(
      trustedInstantMinutes(instant, { ...current, planInstantsComputedAt: null }, onCorrupt),
    ).toBeNull();
    expect(
      trustedInstantMinutes(instant, { ...current, planScheduleComputedAt: null }, onCorrupt),
    ).toBeNull();
    expect(
      trustedInstantMinutes(
        instant,
        {
          ...current,
          planScheduleComputedAt: new Date(AT.getTime() + 1),
          planInstantsComputedAt: AT,
        },
        onCorrupt,
      ),
    ).toBeNull();
    // Newer instants than the cursor are not current either: equality, not ordering (design B3).
    expect(
      trustedInstantMinutes(
        instant,
        {
          ...current,
          planScheduleComputedAt: AT,
          planInstantsComputedAt: new Date(AT.getTime() + 1),
        },
        onCorrupt,
      ),
    ).toBeNull();
  });

  it('falls back to the date and names the remote row for a value that is not a whole minute', () => {
    const onNotWholeMinute = vi.fn();
    expect(
      trustedInstantMinutes(new Date('2026-01-10T06:00:30.000Z'), current, onNotWholeMinute),
    ).toBeNull();
    expect(onNotWholeMinute).toHaveBeenCalledExactlyOnceWith({
      remotePlanId: 'plan-1',
      remoteActivityId: 'act-1',
      instant: '2026-01-10T06:00:30.000Z',
    });
  });

  it('does not report a whole-minute value, a stale stamp or a null instant', () => {
    const onNotWholeMinute = vi.fn();
    trustedInstantMinutes(new Date('2026-01-10T06:00:00.000Z'), current, onNotWholeMinute);
    trustedInstantMinutes(null, current, onNotWholeMinute);
    trustedInstantMinutes(
      new Date('2026-01-10T06:00:30.000Z'),
      { ...current, planInstantsComputedAt: null },
      onNotWholeMinute,
    );
    expect(onNotWholeMinute).not.toHaveBeenCalled();
  });
});
