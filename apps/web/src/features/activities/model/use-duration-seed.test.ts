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

const { useDurationSeed } = await import('./use-duration-seed');

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
          open: true,
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
          open: true,
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
          open: true,
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

  it('re-arms when the dialog closes and opens again', () => {
    const setDuration = vi.fn();
    const field = { value: '0' };
    const { rerender } = renderHook(
      ({ open, hoursPerDay }: { open: boolean; hoursPerDay: number | undefined }) => {
        useDurationSeed({
          open,
          hoursPerDay,
          activity: ACTIVITY,
          readDuration: () => field.value,
          setDuration,
        });
      },
      { initialProps: { open: true, hoursPerDay: EIGHT } },
    );
    expect(setDuration).toHaveBeenCalledTimes(1);

    rerender({ open: false, hoursPerDay: EIGHT });
    setDuration.mockClear();
    // A fresh opening starts a fresh baseline, so the next subject seeds normally.
    rerender({ open: true, hoursPerDay: EIGHT });
    expect(setDuration).toHaveBeenCalledExactlyOnceWith('4h');
  });
});
