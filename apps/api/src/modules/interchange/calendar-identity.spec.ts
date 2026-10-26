import { describe, expect, it } from 'vitest';

import {
  calendarIdentityKey,
  type CalendarIdentityInput,
  type IdentityException,
} from './calendar-identity';
import { firstFreeImportedName, isImportedVariantOf } from './imported-name';

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

const week = [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 420, endMinute: 930 }));

const holiday = (iso: string, label: string | null = 'Bank holiday'): IdentityException => ({
  startDate: d(iso),
  endDate: d(iso),
  label,
  windows: [],
});

const base = (over: Partial<CalendarIdentityInput> = {}): CalendarIdentityInput => ({
  hoursPerDayMinutes: 480,
  shifts: week,
  exceptions: [holiday('2026-12-25'), holiday('2026-12-26')],
  ...over,
});

describe('calendarIdentityKey (ADR-0208 D1)', () => {
  it('is equal for the same calendar however its rows are ordered', () => {
    const shuffled = base({
      shifts: [...week].reverse(),
      exceptions: [
        holiday('2026-12-26'),
        {
          ...holiday('2026-12-25'),
          windows: [],
        },
      ],
    });
    expect(calendarIdentityKey(shuffled)).toBe(calendarIdentityKey(base()));
  });

  it('is equal for windows listed in a different order', () => {
    const windows = [
      { startMinute: 600, endMinute: 700 },
      { startMinute: 300, endMinute: 400 },
    ];
    const a = base({ exceptions: [{ ...holiday('2026-12-25'), windows }] });
    const b = base({ exceptions: [{ ...holiday('2026-12-25'), windows: [...windows].reverse() }] });
    expect(calendarIdentityKey(a)).toBe(calendarIdentityKey(b));
  });

  it.each([
    [
      'one shift window minute',
      base({ shifts: [{ ...week[0]!, endMinute: 931 }, ...week.slice(1)] }),
    ],
    ['hours per day', base({ hoursPerDayMinutes: 450 })],
    ['one exception fewer', base({ exceptions: [holiday('2026-12-25')] })],
    [
      'an exception on another day',
      base({ exceptions: [holiday('2026-12-25'), holiday('2026-12-27')] }),
    ],
    [
      'a label only',
      base({ exceptions: [holiday('2026-12-25'), holiday('2026-12-26', 'Boxing Day')] }),
    ],
    ['a label dropped', base({ exceptions: [holiday('2026-12-25'), holiday('2026-12-26', null)] })],
    [
      'one exception window minute',
      base({
        exceptions: [
          holiday('2026-12-25'),
          { ...holiday('2026-12-26'), windows: [{ startMinute: 0, endMinute: 1 }] },
        ],
      }),
    ],
  ])('differs by %s', (_what, other) => {
    expect(calendarIdentityKey(other)).not.toBe(calendarIdentityKey(base()));
  });

  it('compares a window-only calendar (no weekly shifts) like any other', () => {
    const a = base({ shifts: [] });
    expect(calendarIdentityKey(a)).toBe(calendarIdentityKey(base({ shifts: [] })));
    expect(calendarIdentityKey(a)).not.toBe(calendarIdentityKey(base()));
  });

  it('is equal for two calendars with no exceptions', () => {
    expect(calendarIdentityKey(base({ exceptions: [] }))).toBe(
      calendarIdentityKey(base({ exceptions: [] })),
    );
  });

  it('does not equate a multi-day range with the same days stored singly', () => {
    const range = base({
      exceptions: [
        {
          startDate: d('2026-12-25'),
          endDate: d('2026-12-26'),
          label: 'Bank holiday',
          windows: [],
        },
      ],
    });
    expect(calendarIdentityKey(range)).not.toBe(calendarIdentityKey(base()));
  });
});

describe('isImportedVariantOf (ADR-0208 D1 lineage)', () => {
  const SOURCE = 'Site 6-Day';

  it('accepts the source name itself', () => {
    expect(isImportedVariantOf(SOURCE, SOURCE, 120)).toBe(true);
  });

  it('accepts a variant, and a variant with an ordinal', () => {
    expect(isImportedVariantOf('Site 6-Day (imported 2026-10-20)', SOURCE, 120)).toBe(true);
    expect(isImportedVariantOf('Site 6-Day (imported 2026-10-20) (3)', SOURCE, 120)).toBe(true);
  });

  it('accepts every name the builder produces, so the two rules cannot drift', () => {
    const long = 'y'.repeat(118);
    for (const name of [SOURCE, long, 'z'.repeat(120)]) {
      const taken = new Set<string>([name]);
      for (let i = 0; i < 4; i += 1) {
        const built = firstFreeImportedName(name, taken, '2026-10-20', 120);
        expect(built).not.toBeNull();
        expect(built!.length).toBeLessThanOrEqual(120);
        expect(isImportedVariantOf(built!, name, 120)).toBe(true);
        taken.add(built!);
      }
    }
  });

  it('refuses an unrelated name that shares the prefix', () => {
    expect(isImportedVariantOf('Site 6-Day North', SOURCE, 120)).toBe(false);
    expect(isImportedVariantOf('Site 6-Day North (imported 2026-10-20)', SOURCE, 120)).toBe(false);
    expect(isImportedVariantOf('Site 6-Day (imported soon)', SOURCE, 120)).toBe(false);
  });

  it('refuses an ordinal the builder never emits', () => {
    expect(isImportedVariantOf('Site 6-Day (imported 2026-10-20) (1)', SOURCE, 120)).toBe(false);
  });

  it('refuses a variant of a different source', () => {
    expect(isImportedVariantOf('Site 5-Day (imported 2026-10-20)', SOURCE, 120)).toBe(false);
  });
});
