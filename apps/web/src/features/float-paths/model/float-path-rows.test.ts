import { describe, expect, it } from 'vitest';

import {
  buildFloatPathRows,
  floatPathAnnouncement,
  floatPathEmphasisIds,
  formatRelativeFloat,
  type FloatPathActivityInput,
} from './float-path-rows';

const EIGHT_HOUR_DAY = 480;

function activity(
  id: string,
  overrides: Partial<FloatPathActivityInput> = {},
): FloatPathActivityInput {
  return {
    id,
    code: id.toUpperCase(),
    name: `Activity ${id}`,
    earlyStart: '2026-01-05',
    earlyFinish: '2026-01-09',
    totalFloat: 0,
    calendarId: null,
    ...overrides,
  };
}

describe('formatRelativeFloat', () => {
  it('renders one working day on an eight-hour calendar as a day, not zero', () => {
    // The defect this whole epic exists downstream of: 480 / 1440 rounds to 0. Read on the
    // calendar the figure was measured on and it is exactly one day.
    expect(formatRelativeFloat(EIGHT_HOUR_DAY, 8)).toBe('+1d');
  });

  it('renders a sub-day float in hours', () => {
    expect(formatRelativeFloat(240, 8)).toBe('+4h');
  });

  it('renders a compound float largest-unit-first', () => {
    expect(formatRelativeFloat(2 * EIGHT_HOUR_DAY + 240, 8)).toBe('+2d 4h');
  });

  it('renders a negative relative float with a typographic minus', () => {
    // A branch MORE critical than a floating target is a real signal (a constraint-broken
    // predecessor), not an error. It must read as a number, never as breakage.
    expect(formatRelativeFloat(-EIGHT_HOUR_DAY, 8)).toBe('−1d');
  });

  it('renders zero as 0d', () => {
    expect(formatRelativeFloat(0, 8)).toBe('0d');
  });

  it('degrades to hours and minutes when the day factor is unresolved', () => {
    // Never 24, never 8 — after ADR-0068 both are silently wrong on the other kind of calendar.
    expect(formatRelativeFloat(150, undefined)).toBe('+2h 30m');
    expect(formatRelativeFloat(-45, undefined)).toBe('−45m');
    expect(formatRelativeFloat(120, 0)).toBe('+2h');
  });
});

describe('buildFloatPathRows', () => {
  const activities = [
    activity('t'),
    activity('a'),
    activity('b', { totalFloat: 1 }),
    activity('c', { totalFloat: 1 }),
  ];

  const base = {
    targetActivityId: 't',
    hasMorePaths: false,
    activities,
    planCalendarId: 'cal-8h',
    targetHoursPerDay: 8,
  };

  it('labels path 0 Driving and gives it no relative-float text', () => {
    const model = buildFloatPathRows({
      ...base,
      paths: [{ index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] }],
    });
    expect(model.rows[0]?.label).toBe('Driving');
    expect(model.rows[0]?.relativeFloatText).toBeNull();
  });

  it('labels a branch path with its signed relative float on the target calendar', () => {
    const model = buildFloatPathRows({
      ...base,
      paths: [
        { index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] },
        { index: 1, relativeFloatMinutes: EIGHT_HOUR_DAY, activityIds: ['b', 'c'] },
      ],
    });
    expect(model.rows[1]?.label).toBe('+1d');
    expect(model.rows[1]?.relativeFloatMinutes).toBe(EIGHT_HOUR_DAY);
  });

  it('preserves the API order of both the ranking and each chain', () => {
    const model = buildFloatPathRows({
      ...base,
      paths: [
        { index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] },
        { index: 1, relativeFloatMinutes: 480, activityIds: ['c', 'b'] },
      ],
    });
    expect(model.rows.map((row) => row.index)).toEqual([0, 1]);
    expect(model.rows[1]?.activities.map((row) => row.id)).toEqual(['c', 'b']);
    expect(model.rows[1]?.entryName).toBe('Activity c');
  });

  it('keeps an activity the client does not hold, and marks it', () => {
    const model = buildFloatPathRows({
      ...base,
      paths: [{ index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'unpaged'] }],
    });
    const rows = model.rows[0]?.activities ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ id: 'unpaged', name: null, missing: true });
    // The count reflects the chain, not what happened to be loaded.
    expect(model.rows[0]?.activityCount).toBe(2);
    // And it still contributes to the emphasis set — the canvas may hold what the panel's page did not.
    expect(model.rows[0]?.activityIds).toEqual(['t', 'unpaged']);
  });

  it('does not report mixed calendars merely because a member is unknown', () => {
    const model = buildFloatPathRows({
      ...base,
      paths: [{ index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'unpaged'] }],
    });
    expect(model.mixedCalendars).toBe(false);
  });

  it('reports mixed calendars when a member is measured on a different one', () => {
    const model = buildFloatPathRows({
      ...base,
      activities: [activity('t'), activity('a', { calendarId: 'cal-24h' })],
      paths: [{ index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] }],
    });
    expect(model.mixedCalendars).toBe(true);
  });

  it('treats an inherited calendar as the plan calendar, not as different', () => {
    const model = buildFloatPathRows({
      ...base,
      activities: [activity('t', { calendarId: 'cal-8h' }), activity('a', { calendarId: null })],
      paths: [{ index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] }],
    });
    expect(model.mixedCalendars).toBe(false);
  });

  it('carries hasMorePaths through and resolves the target name', () => {
    const model = buildFloatPathRows({ ...base, hasMorePaths: true, paths: [] });
    expect(model.hasMorePaths).toBe(true);
    expect(model.targetName).toBe('Activity t');
  });

  it('reports a null target name when the client does not hold the target', () => {
    const model = buildFloatPathRows({ ...base, targetActivityId: 'gone', paths: [] });
    expect(model.targetName).toBeNull();
  });

  it('degrades every label to hours and minutes when the factor is unresolved', () => {
    const model = buildFloatPathRows({
      ...base,
      targetHoursPerDay: undefined,
      paths: [{ index: 1, relativeFloatMinutes: 480, activityIds: ['b'] }],
    });
    expect(model.rows[0]?.label).toBe('+8h');
  });
});

describe('floatPathEmphasisIds', () => {
  const paths = [
    { index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] },
    { index: 1, relativeFloatMinutes: 480, activityIds: ['b'] },
  ];

  it('is exactly the selected path members', () => {
    expect([...floatPathEmphasisIds(paths, 0)]).toEqual(['t', 'a']);
    expect([...floatPathEmphasisIds(paths, 1)]).toEqual(['b']);
  });

  it('is empty with no selection, no response, or an index that is not present', () => {
    expect(floatPathEmphasisIds(paths, null).size).toBe(0);
    expect(floatPathEmphasisIds(undefined, 0).size).toBe(0);
    expect(floatPathEmphasisIds(paths, 7).size).toBe(0);
  });

  it('returns a stable identity for the empty case, so downstream memos hold', () => {
    expect(floatPathEmphasisIds(paths, null)).toBe(floatPathEmphasisIds(undefined, null));
  });

  it('does not re-identify when the activity list gets a fresh reference', () => {
    // The trap the response-keyed derivation exists to avoid: react-query hands a NEW
    // `activities.data` array after every recalculation. The emphasis set must not notice.
    const before = floatPathEmphasisIds(paths, 1);
    const after = floatPathEmphasisIds(paths, 1);
    expect([...before]).toEqual([...after]);
    // The same response object ⇒ the same members. (Identity is held by the caller's `useMemo`,
    // whose deps are `[query.data, selectedPathIndex]` — neither of which the recalc touches.)
  });
});

describe('floatPathAnnouncement', () => {
  const model = buildFloatPathRows({
    targetActivityId: 't',
    hasMorePaths: false,
    activities: [activity('t'), activity('a'), activity('b')],
    planCalendarId: null,
    targetHoursPerDay: 8,
    paths: [
      { index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] },
      { index: 1, relativeFloatMinutes: 480, activityIds: ['b'] },
    ],
  });

  it('names path 0 the driving path rather than reading a zero ordinal aloud', () => {
    expect(floatPathAnnouncement(model.rows[0]!, 2)).toBe(
      'Showing the driving path — 2 activities.',
    );
  });

  it('announces a branch path one-indexed, with its relative float', () => {
    expect(floatPathAnnouncement(model.rows[1]!, 2)).toBe(
      'Showing path 2 of 2 — 1 activity, +1d above the driving path.',
    );
  });
});
