import { describe, expect, it } from 'vitest';

import { buildWorkingDayCalendar, STANDARD_WEEKDAYS } from './calendar';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type ShiftWindow,
  type TimeException,
  type WeeklyPattern,
} from './working-time-calendar';

/** A split-shift week: Mon–Fri 08:00–12:00 + 13:00–17:00 (480 working minutes/day), weekend off. */
const SPLIT: WeeklyPattern = [
  [
    { startMinute: 480, endMinute: 720 },
    { startMinute: 780, endMinute: 1020 },
  ],
  [
    { startMinute: 480, endMinute: 720 },
    { startMinute: 780, endMinute: 1020 },
  ],
  [
    { startMinute: 480, endMinute: 720 },
    { startMinute: 780, endMinute: 1020 },
  ],
  [
    { startMinute: 480, endMinute: 720 },
    { startMinute: 780, endMinute: 1020 },
  ],
  [
    { startMinute: 480, endMinute: 720 },
    { startMinute: 780, endMinute: 1020 },
  ],
  [],
  [],
];

/**
 * A deliberately naive minute-by-minute reference — the ground truth the closed-form
 * factory must match exactly (the differential test). `addWorkingTime(from, n>0)` = the
 * exclusive boundary after the n-th working minute; `workingTimeBetween` counts them.
 */
function naive(weekly: WeeklyPattern, exceptions: readonly TimeException[]) {
  const toAbs = (i: string): number => {
    const day = Math.round(new Date(`${i.slice(0, 10)}T00:00:00Z`).getTime() / 60000);
    const t = i.length > 10 ? i.slice(11) : '00:00';
    return day + Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  };
  const ranges = exceptions.map((e) => ({
    s: Math.floor(toAbs(e.startDate) / 1440),
    e: Math.floor(toAbs(e.endDate) / 1440),
    w: e.windows,
  }));
  const windowsForDay = (dayIndex: number): readonly ShiftWindow[] => {
    for (const r of ranges) if (r.s <= dayIndex && dayIndex <= r.e) return r.w;
    return weekly[(((dayIndex + 3) % 7) + 7) % 7]!;
  };
  const isWorking = (abs: number): boolean => {
    const day = Math.floor(abs / 1440);
    const mod = abs - day * 1440;
    return windowsForDay(day).some((w) => mod >= w.startMinute && mod < w.endMinute);
  };
  return {
    workingTimeBetween(from: string, to: string): number {
      const a = toAbs(from);
      const b = toAbs(to);
      const [lo, hi, sign] = a <= b ? [a, b, 1] : [b, a, -1];
      let n = 0;
      for (let k = lo; k < hi; k += 1) if (isWorking(k)) n += 1;
      return sign * n;
    },
  };
}

describe('buildWorkingTimeCalendar — split shift basics', () => {
  const cal = buildWorkingTimeCalendar(SPLIT, []);
  // 2026-01-05 is a Monday.

  it('the first working minute after midnight lands at the shift start', () => {
    expect(cal.addWorkingTime('2026-01-05', 1)).toBe('2026-01-05T08:01');
  });

  it('crosses the midday break: the 241st working minute is 13:01', () => {
    // 240 min fill 08:00–12:00; the 241st working minute is 13:00–13:01 → boundary 13:01.
    expect(cal.addWorkingTime('2026-01-05', 241)).toBe('2026-01-05T13:01');
  });

  it("a full day's 480 minutes end at the shift close (17:00)", () => {
    expect(cal.addWorkingTime('2026-01-05', 480)).toBe('2026-01-05T17:00');
  });

  it('spills into the next working day and skips the weekend', () => {
    // 480 (Mon) + 1 → first working minute Tue = 08:01.
    expect(cal.addWorkingTime('2026-01-05', 481)).toBe('2026-01-06T08:01');
    // 5 full days = 2400 min from Mon 00:00 → Fri 17:00; +1 skips weekend to Mon 08:01.
    expect(cal.addWorkingTime('2026-01-05', 2400)).toBe('2026-01-09T17:00');
    expect(cal.addWorkingTime('2026-01-05', 2401)).toBe('2026-01-12T08:01');
  });

  it('counts working minutes between instants', () => {
    expect(cal.workingTimeBetween('2026-01-05', '2026-01-05T17:00')).toBe(480);
    expect(cal.workingTimeBetween('2026-01-05T08:00', '2026-01-05T12:00')).toBe(240);
    // Across the weekend: Fri 17:00 → Mon 08:00 = 0 working minutes.
    expect(cal.workingTimeBetween('2026-01-09T17:00', '2026-01-12T08:00')).toBe(0);
  });
});

describe('buildWorkingTimeCalendar — inverse invariant', () => {
  const cal = buildWorkingTimeCalendar(SPLIT, [
    { startDate: '2026-01-19', endDate: '2026-01-19', windows: [] }, // a Monday holiday
    {
      startDate: '2026-01-24',
      endDate: '2026-01-24',
      windows: [{ startMinute: 480, endMinute: 720 }],
    }, // worked Sat AM
  ]);

  it('workingTimeBetween(from, addWorkingTime(from, n)) === n', () => {
    for (const from of [
      '2026-01-05',
      '2026-01-05T09:30',
      '2026-01-19',
      '2026-01-24T10:00',
      '2026-02-02',
    ]) {
      for (const n of [-2400, -481, -1, 1, 60, 240, 481, 5000]) {
        expect(cal.workingTimeBetween(from, cal.addWorkingTime(from, n))).toBe(n);
      }
    }
  });
});

describe('buildWorkingTimeCalendar — differential vs naive', () => {
  const exceptions: TimeException[] = [
    { startDate: '2026-01-19', endDate: '2026-01-19', windows: [] }, // holiday
    {
      startDate: '2026-02-14',
      endDate: '2026-02-16',
      windows: [{ startMinute: 0, endMinute: 1440 }],
    }, // 24h overtime block
    {
      startDate: '2026-03-07',
      endDate: '2026-03-07',
      windows: [{ startMinute: 480, endMinute: 720 }],
    }, // worked Sat
  ];
  const cal = buildWorkingTimeCalendar(SPLIT, exceptions);
  const ref = naive(SPLIT, exceptions);

  it('matches the naive minute-by-minute reference across a swept range', () => {
    const origin = new Date('2026-01-01T00:00:00Z');
    for (let d = -20; d <= 90; d += 7) {
      const day = new Date(origin.getTime() + d * 86_400_000).toISOString().slice(0, 10);
      for (const t of ['', 'T06:15', 'T10:00', 'T15:45']) {
        const from = `${day}${t}`;
        for (const n of [-1000, -240, -1, 1, 200, 481, 1300]) {
          expect(cal.workingTimeBetween(from, cal.addWorkingTime(from, n))).toBe(n);
        }
        for (const deltaDays of [1, 5, 20]) {
          const to = new Date(new Date(`${day}T00:00:00Z`).getTime() + deltaDays * 86_400_000)
            .toISOString()
            .slice(0, 10);
          expect(cal.workingTimeBetween(from, to)).toBe(ref.workingTimeBetween(from, to));
        }
      }
    }
  });
});

describe('buildWorkingTimeCalendar — night shift crossing midnight', () => {
  // Mon–Fri 20:00–06:00 stored as two adjacent-day windows (ADR-0036 §2): a weekday works
  // [1200,1440) of its own evening plus [0,360) of the *next* calendar morning. Model it as
  // MON [20:00–24:00]; TUE–FRI [00:00–06:00, 20:00–24:00]; SAT [00:00–06:00].
  const NIGHT: WeeklyPattern = [
    [{ startMinute: 1200, endMinute: 1440 }],
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1200, endMinute: 1440 },
    ],
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1200, endMinute: 1440 },
    ],
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1200, endMinute: 1440 },
    ],
    [
      { startMinute: 0, endMinute: 360 },
      { startMinute: 1200, endMinute: 1440 },
    ],
    [{ startMinute: 0, endMinute: 360 }],
    [],
  ];
  const cal = buildWorkingTimeCalendar(NIGHT, []);

  it("a Monday night shift's 600 minutes run 20:00 → Tue 06:00 with no wrap", () => {
    // Mon [1200,1440) = 240 min, then Tue [0,360) = 360 min → 600 total, boundary Tue 06:00.
    expect(cal.workingTimeBetween('2026-01-05T20:00', '2026-01-06T06:00')).toBe(600);
    expect(cal.addWorkingTime('2026-01-05T20:00', 600)).toBe('2026-01-06T06:00');
  });
});

describe('buildWorkingTimeCalendar — window-only calendar (empty base week)', () => {
  // The CAL-05 turnaround: no weekly working time, all work from a positive exception range.
  const cal = buildWorkingTimeCalendar(fullDayWeek([]), [
    {
      startDate: '2026-10-05',
      endDate: '2026-10-16',
      windows: [{ startMinute: 360, endMinute: 1110 }],
    },
  ]);

  it('is valid and schedules entirely inside the exception window', () => {
    // First working minute is 06:00 on the range's first day.
    expect(cal.addWorkingTime('2026-09-01', 1)).toBe('2026-10-05T06:01');
    // 750 min = one full window day → boundary at 18:30 (1110).
    expect(cal.addWorkingTime('2026-10-05', 750)).toBe('2026-10-05T18:30');
  });
});

describe('buildWorkingTimeCalendar — guards', () => {
  it('throws when there is no working time at all (the N11 hang-test analogue)', () => {
    expect(() => buildWorkingTimeCalendar(fullDayWeek([]), [])).toThrow(
      /at least one working minute/,
    );
  });

  it('rejects malformed windows', () => {
    expect(() => buildWorkingTimeCalendar(fullDayWeek([0]), [])).not.toThrow();
    expect(() =>
      buildWorkingTimeCalendar(
        [[{ startMinute: 600, endMinute: 500 }], [], [], [], [], [], []],
        [],
      ),
    ).toThrow(/start < end/);
    expect(() =>
      buildWorkingTimeCalendar([[{ startMinute: 0, endMinute: 2000 }], [], [], [], [], [], []], []),
    ).toThrow(/bounds/);
  });

  it('handles an enormous lag quickly and finitely (the N16 analogue)', () => {
    const cal = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);
    // 6,000,000 working minutes (100,000 h) ≈ 4,167 working days ≈ 16 years on a Mon–Fri 24h week —
    // must return a far-future finite instant, computed instantly (no per-minute walk / hang).
    const out = cal.addWorkingTime('2026-01-05', 6_000_000);
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(Number(out.slice(0, 4))).toBeGreaterThan(2038);
  });
});

describe('day-equivalence — the goldens’ safety net', () => {
  // A full-day (24h) Mon–Fri minute calendar with durations ×1440 must reproduce the SAME dates
  // as the working-DAY calendar (ADR-0036 §4.2 / the M0 golden invariant).
  const dayCal = buildWorkingDayCalendar(STANDARD_WEEKDAYS, []);
  const minCal = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);

  it('a whole-day offset lands on the same calendar day (the inclusive-finish invariant)', () => {
    for (const [from, days] of [
      ['2026-01-05', 1],
      ['2026-01-05', 5],
      ['2026-01-01', 3],
      ['2026-06-15', 20],
    ] as const) {
      // compute.ts derives an activity's inclusive finish DATE from offset (days*1440 − 1); it must
      // equal the working-DAY model's last working day = addWorkingDays(from, days − 1). This is the
      // exact identity that keeps the M0 goldens green under the days→minutes rework.
      const inclusive = minCal.addWorkingTime(from, days * 1440 - 1).slice(0, 10);
      expect(inclusive).toBe(dayCal.addWorkingDays(from, days - 1));
    }
  });

  it('allMinutesWorkCalendar advances one calendar day per 1440 minutes', () => {
    expect(allMinutesWorkCalendar.addWorkingTime('2026-01-05', 1440)).toBe('2026-01-06');
    expect(allMinutesWorkCalendar.workingTimeBetween('2026-01-05', '2026-01-10')).toBe(5 * 1440);
  });
});
