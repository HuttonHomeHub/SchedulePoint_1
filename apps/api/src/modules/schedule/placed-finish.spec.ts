import { describe, expect, it } from 'vitest';

import { computeSchedule } from './engine/compute';
import { levelSchedule } from './engine/level';
import type { EngineActivity } from './engine/types';
import { allMinutesWorkCalendar } from './engine/working-time-calendar';
import {
  LEVELLED_FINISH_EXCLUDED_TYPES_SQL,
  leveledFinishSql,
  leveledProjectFinishOf,
  placedFinishSql,
  placedProjectFinishOf,
} from './placed-finish';

describe('placedFinishSql', () => {
  it('is the drawn finish, falling back to the early finish', () => {
    expect(placedFinishSql().sql).toBe('COALESCE(visual_effective_finish, early_finish)');
  });

  it('qualifies both columns with a table alias', () => {
    expect(placedFinishSql('act').sql).toBe(
      'COALESCE(act.visual_effective_finish, act.early_finish)',
    );
  });

  it('refuses an alias that is not a bare identifier', () => {
    expect(() => placedFinishSql('act; DROP TABLE plans')).toThrow();
  });
});

describe('placedProjectFinishOf', () => {
  it('is the latest drawn finish, even when it is later than every early finish', () => {
    expect(
      placedProjectFinishOf([
        { earlyFinish: '2026-01-03', visualEffectiveFinish: '2026-01-03' },
        { earlyFinish: '2026-01-01', visualEffectiveFinish: '2026-01-20' },
      ]),
    ).toBe('2026-01-20');
  });

  it('is null when there is nothing to draw', () => {
    expect(placedProjectFinishOf([])).toBeNull();
  });
});

describe('leveledFinishSql', () => {
  it('is the levelled finish, falling back to the drawn finish and then the early finish', () => {
    expect(leveledFinishSql().sql).toBe(
      'COALESCE(leveled_finish, COALESCE(visual_effective_finish, early_finish))',
    );
  });

  it('qualifies every column with a table alias', () => {
    expect(leveledFinishSql('act').sql).toBe(
      'COALESCE(act.leveled_finish, COALESCE(act.visual_effective_finish, act.early_finish))',
    );
  });

  it('refuses an alias that is not a bare identifier', () => {
    expect(() => leveledFinishSql('act; DROP TABLE plans')).toThrow();
  });

  it('excludes level-of-effort and summary activities, as literals', () => {
    expect(LEVELLED_FINISH_EXCLUDED_TYPES_SQL.sql).toBe("'LEVEL_OF_EFFORT', 'WBS_SUMMARY'");
  });
});

describe('leveledProjectFinishOf', () => {
  const row = (o: Partial<Parameters<typeof leveledProjectFinishOf>[0][number]>) => ({
    type: 'TASK',
    leveledFinish: null,
    visualEffectiveFinish: '2026-01-02',
    earlyFinish: '2026-01-02',
    ...o,
  });

  it('counts a hand-placed bar with no levelled finish at its drawn finish, not its early one', () => {
    expect(
      leveledProjectFinishOf([
        row({ leveledFinish: '2026-01-06' }),
        row({ visualEffectiveFinish: '2026-01-21' }),
      ]),
    ).toBe('2026-01-21');
  });

  it('skips level-of-effort and summary activities', () => {
    expect(
      leveledProjectFinishOf([
        row({ leveledFinish: '2026-01-06' }),
        row({ type: 'LEVEL_OF_EFFORT', visualEffectiveFinish: '2026-02-01' }),
        row({ type: 'WBS_SUMMARY', visualEffectiveFinish: '2026-03-01' }),
      ]),
    ).toBe('2026-01-06');
  });

  it('is null when nothing counts', () => {
    expect(leveledProjectFinishOf([])).toBeNull();
    expect(leveledProjectFinishOf([row({ type: 'WBS_SUMMARY' })])).toBeNull();
  });

  it('agrees with the engine roll-up on a levelled plan with a hand-placed non-participant', () => {
    const DAY = 1440;
    const activities: EngineActivity[] = [
      { id: 'X', durationMinutes: 3 * DAY, type: 'TASK', levelingPriority: 1 },
      { id: 'Y', durationMinutes: 3 * DAY, type: 'TASK', levelingPriority: 2 },
      { id: 'Z', durationMinutes: 2 * DAY, type: 'TASK', visualStart: '2026-01-20' },
    ];
    const calendar = allMinutesWorkCalendar;
    const output = computeSchedule(activities, [], { dataDate: '2026-01-01', calendar });
    const leveled = levelSchedule(
      activities,
      output,
      [
        { activityId: 'X', resourceId: 'R', unitsPerHour: 1 },
        { activityId: 'Y', resourceId: 'R', unitsPerHour: 1 },
      ],
      [{ id: 'R', capacity: 1 }],
      {
        levelWithinFloatOnly: false,
        dataDate: '2026-01-01',
        planCalendar: calendar,
        anchor: 'PLACED',
      },
    );
    const typeById = new Map(activities.map((a) => [a.id, a.type]));
    const twin = leveledProjectFinishOf(
      leveled.results.map((r) => ({
        type: typeById.get(r.activityId) ?? 'TASK',
        leveledFinish: r.leveledFinish ?? null,
        visualEffectiveFinish: r.visualEffectiveFinish,
        earlyFinish: r.earlyFinish,
      })),
    );
    expect(leveled.summary.leveledProjectFinish).toBe('2026-01-21');
    expect(twin).toBe(leveled.summary.leveledProjectFinish);
  });
});
