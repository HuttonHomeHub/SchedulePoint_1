import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { changedSwimlaneIds, diffActivity, diffFields } from './activity-history.diff';
import { NO_REFS, type ResolvedNames } from './activity-history.pending';
import { ActivityHistoryRecorder } from './activity-history.recorder';

const recorder = () => new ActivityHistoryRecorder({ debug: vi.fn() } as unknown as PinoLogger);

const names = (swimlanes: Record<string, string> = {}): ResolvedNames => ({
  calendars: new Map(),
  parents: new Map(),
  swimlanes: new Map(Object.entries(swimlanes)),
  resources: new Map(),
  activities: new Map(),
  plans: new Map(),
});

describe('swimlaneId in the activity history', () => {
  it('names both swimlanes on a move, and a move out reads as null', () => {
    const into = diffFields(
      ['swimlaneId'],
      { swimlaneId: null },
      { swimlaneId: 'sw-b' },
      { calendars: new Map(), parents: new Map(), swimlanes: new Map([['sw-b', 'Mechanical']]) },
    );
    expect(into).toEqual({ swimlaneId: { from: null, to: { id: 'sw-b', name: 'Mechanical' } } });

    const out = diffFields(
      ['swimlaneId'],
      { swimlaneId: 'sw-b' },
      { swimlaneId: null },
      { calendars: new Map(), parents: new Map(), swimlanes: new Map([['sw-b', 'Mechanical']]) },
    );
    expect(out).toEqual({ swimlaneId: { from: { id: 'sw-b', name: 'Mechanical' }, to: null } });
  });

  it('records nothing when the swimlane is the same, or absent on both sides', () => {
    expect(
      diffFields(
        ['swimlaneId'],
        { swimlaneId: 'sw' },
        { swimlaneId: 'sw' },
        { calendars: new Map(), parents: new Map() },
      ),
    ).toEqual({});
    // A caller whose row predates the column reads as "no swimlane" on both sides.
    expect(
      diffFields(['swimlaneId'], {}, {}, { calendars: new Map(), parents: new Map() }),
    ).toEqual({});
  });

  it('an editor save that moves the swimlane carries it with the other changes', () => {
    const base = {
      swimlaneId: null,
      name: 'A',
    } as Parameters<typeof diffActivity>[0];
    const changed = diffActivity(
      base,
      { ...base, swimlaneId: 'sw', name: 'B' },
      {
        calendars: new Map(),
        parents: new Map(),
      },
    );
    expect(Object.keys(changed).sort()).toEqual(['name', 'swimlaneId']);
  });

  it('asks for the names of only the swimlanes that changed', () => {
    expect(changedSwimlaneIds({ swimlaneId: 'a' }, { swimlaneId: 'a' })).toEqual([]);
    expect(changedSwimlaneIds({ swimlaneId: null }, { swimlaneId: 'b' })).toEqual(['b']);
    expect(changedSwimlaneIds({ swimlaneId: 'a' }, { swimlaneId: 'b' })).toEqual(['a', 'b']);
  });

  it('swimlaneWrites: one item per activity that moved, none for one that stayed', () => {
    const writes = recorder().swimlaneWrites('plan', [
      { id: 'moved', before: null, after: 'sw-b' },
      { id: 'stayed', before: 'sw-b', after: 'sw-b' },
    ]);
    expect(writes).toHaveLength(2);
    expect(writes[0]?.changes.keys).toEqual(['swimlaneId']);
    expect(writes[0]?.changes.refs.swimlaneIds).toEqual(['sw-b']);
    expect(writes[0]?.changes.build(names({ 'sw-b': 'Mechanical' }))).toEqual({
      swimlaneId: { from: null, to: { id: 'sw-b', name: 'Mechanical' } },
    });
    expect(writes[1]?.changes.keys).toEqual([]);
    expect(writes[1]?.changes.build(names())).toEqual({});
  });

  it('activityFieldChanges asks for the names of a swimlane move', () => {
    const before = { swimlaneId: 'a', calendarId: null } as never;
    const after = { swimlaneId: 'b', calendarId: null } as never;
    const pending = recorder().activityFieldChanges(before, after);
    expect(pending.refs).toEqual({ ...NO_REFS, swimlaneIds: ['a', 'b'] });
    expect(pending.keys).toContain('swimlaneId');
  });
});
