import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The flag on, because the whole point of the re-seed is the sub-day path: flag-off
 * `seedDurationText` returns the rounded day and there is nothing here to protect.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SUB_DAY_DURATIONS_ENABLED: true,
}));

const { useDurationSeed, useLateSeed } = await import('./use-duration-seed');
const { seedRemainingText } = await import('./remaining-field');

/**
 * The late-arriving factor must never overwrite what a planner typed (ADR-0070; `TECH_DEBT` #83).
 *
 * The case that matters is a **race**, so it is set up as one: the field's value changes without any
 * accompanying re-render carrying a "dirty" flag, and *then* the calendar list resolves. The first
 * implementation asked a captured `isDirty` prop and lost exactly here — `4h` became the seeded
 * default, silently. These assert against the field's live value instead.
 */

/** An eight-hour working day — 480 minutes, not 1440 (ADR-0068). */
const EIGHT = 8;

const ACTIVITY = { durationDays: 0, durationMinutes: 240 };

describe('useDurationSeed', () => {
  it('re-seeds from the exact minutes once the factor lands on an untouched field', () => {
    const setDuration = vi.fn();
    // The degraded seed a whole-days field would have shown: a four-hour activity as "0".
    const field = { value: '0' };
    const { rerender } = renderHook(
      ({ hoursPerDay }: { hoursPerDay: number | undefined }) => {
        useDurationSeed({
          hoursPerDay,
          activity: ACTIVITY,
          readDuration: () => field.value,
          setDuration,
        });
      },
      { initialProps: { hoursPerDay: undefined as number | undefined } },
    );
    expect(setDuration).not.toHaveBeenCalled();

    rerender({ hoursPerDay: EIGHT });
    expect(setDuration).toHaveBeenCalledExactlyOnceWith('4h');
  });

  it('does NOT overwrite a value typed before the factor arrives', () => {
    const setDuration = vi.fn();
    const field = { value: '0' };
    const { rerender } = renderHook(
      ({ hoursPerDay }: { hoursPerDay: number | undefined }) => {
        useDurationSeed({
          hoursPerDay,
          activity: ACTIVITY,
          readDuration: () => field.value,
          setDuration,
        });
      },
      { initialProps: { hoursPerDay: undefined as number | undefined } },
    );

    // The planner types. Deliberately with NO re-render and no dirty flag — that is the race: a
    // keystroke and a network response are independent, and the old code trusted a prop that the
    // keystroke had not yet updated.
    field.value = '4h';
    rerender({ hoursPerDay: EIGHT });

    expect(setDuration).not.toHaveBeenCalled();
  });

  it('fires at most once per opening, so a later calendar change cannot discard an edit', () => {
    const setDuration = vi.fn();
    const field = { value: '0' };
    const { rerender } = renderHook(
      ({ hoursPerDay }: { hoursPerDay: number | undefined }) => {
        useDurationSeed({
          hoursPerDay,
          activity: ACTIVITY,
          readDuration: () => field.value,
          setDuration,
        });
      },
      { initialProps: { hoursPerDay: undefined as number | undefined } },
    );
    rerender({ hoursPerDay: EIGHT });
    setDuration.mockClear();

    // The planner picks a different calendar — a legitimate factor change, and NOT an invitation to
    // throw away the duration they may have typed since.
    rerender({ hoursPerDay: 24 });
    expect(setDuration).not.toHaveBeenCalled();
  });

  it('seeds again for a fresh opening, which is a fresh mount', () => {
    // The hook has no `open` any more: its host is mounted per opening, so "re-arming" is simply a
    // new instance starting from clean refs.
    const setDuration = vi.fn();
    const field = { value: '0' };
    const opening = () =>
      renderHook(() => {
        useDurationSeed({
          hoursPerDay: EIGHT,
          activity: ACTIVITY,
          readDuration: () => field.value,
          setDuration,
        });
      });
    const first = opening();
    expect(setDuration).toHaveBeenCalledTimes(1);

    first.unmount();
    setDuration.mockClear();
    opening();
    expect(setDuration).toHaveBeenCalledExactlyOnceWith('4h');
  });
});

/**
 * The Progress tab's Remaining field takes the same treatment (ADR-0169 M4): a sub-day remainder
 * opens as whole days before the calendar list lands, and must not stay that way — but a value the
 * planner typed meanwhile wins, whatever order the two events arrive in.
 */
describe('useLateSeed — the Remaining field', () => {
  const ROW = { remainingDurationDays: 1, remainingDurationMinutes: 240 };

  function mountRemaining(field: { value: string }, write: (text: string) => void) {
    return renderHook(
      ({ hoursPerDay }: { hoursPerDay: number | undefined }) => {
        useLateSeed({
          hoursPerDay,
          read: () => field.value,
          write,
          seed: (factor) => seedRemainingText(ROW, factor),
        });
      },
      { initialProps: { hoursPerDay: undefined as number | undefined } },
    );
  }

  it('re-seeds a sub-day remainder once the factor lands on an untouched field', () => {
    const write = vi.fn();
    const field = { value: '1' };
    const { rerender } = mountRemaining(field, write);

    rerender({ hoursPerDay: EIGHT });
    expect(write).toHaveBeenCalledExactlyOnceWith('4h');
  });

  it('does NOT overwrite a remainder typed before the factor arrives', () => {
    const write = vi.fn();
    const field = { value: '1' };
    const { rerender } = mountRemaining(field, write);

    field.value = '2h';
    rerender({ hoursPerDay: EIGHT });
    expect(write).not.toHaveBeenCalled();
  });
});
