import {
  ACTIVITY_HISTORY_FIELDS,
  type ActivityHistoryAssignmentState,
  type ActivityHistoryLinkEnd,
} from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  formatHistoryEntry,
  formatHistoryItem,
  type HistoryFormatContext,
} from './format-history-item';

import { formatDurationText } from '@/lib/duration-text';

const CTX: HistoryFormatContext = { hoursPerDay: 8, currencyCode: 'GBP' };
const OTHER: ActivityHistoryLinkEnd = { id: 'a1', code: '1020', name: 'Steel erection' };
const FS = { type: 'FS', lagMinutes: 0, lagCalendar: 'PROJECT_DEFAULT' } as const;

const text = (key: string, change: Parameters<typeof formatHistoryItem>[1], ctx = CTX) =>
  formatHistoryItem(key, change, ctx).text;

describe('formatHistoryItem — fields', () => {
  it('words a duration with the editor’s own formatter, never a second spelling', () => {
    expect(text('durationMinutes', { from: 2400, to: 4320 })).toBe(
      `Duration ${formatDurationText(2400, 8)} → ${formatDurationText(4320, 8)}`,
    );
    expect(text('durationMinutes', { from: 2400, to: 4320 })).toBe('Duration 5d → 9d');
  });

  it('falls back to hours and minutes when the day length is unknown', () => {
    expect(
      text(
        'durationMinutes',
        { from: 90, to: 480 },
        { hoursPerDay: undefined, currencyCode: null },
      ),
    ).toBe('Duration 1h 30m → 8h');
  });

  it('words dates, instants, percentages, booleans and none', () => {
    expect(text('constraintDate', { from: null, to: '2026-03-04' })).toBe(
      'Constraint date none → 04 Mar 2026',
    );
    expect(text('externalEarlyStart', { from: null, to: '2026-03-04T09:30:00.000Z' })).toBe(
      'External early start none → 04 Mar 2026 09:30 UTC',
    );
    expect(text('externalEarlyStart', { from: null, to: '2026-03-04T00:00:00.000Z' })).toBe(
      'External early start none → 04 Mar 2026',
    );
    expect(text('percentComplete', { from: 40, to: 60 })).toBe('% complete 40% → 60%');
    expect(text('scheduleAsLateAsPossible', { from: false, to: true })).toBe(
      'As late as possible off → on',
    );
  });

  it('words enums by their labels and references by their names at the time', () => {
    expect(text('constraintType', { from: null, to: 'SNET' })).toContain('none →');
    expect(text('calendarId', { from: null, to: { id: 'c', name: 'Night shift' } })).toBe(
      'Calendar none → Night shift',
    );
  });

  it('words money through the money formatter, in the plan currency', () => {
    expect(text('budgetedExpense', { from: null, to: 125000 })).toBe(
      'Budgeted expense none → £1,250.00',
    );
  });

  it('says only that a description changed', () => {
    expect(text('description', { changed: true })).toBe('Description changed');
  });

  it('labels every recorded field — a key added to the vocabulary cannot render blank', () => {
    for (const key of Object.keys(ACTIVITY_HISTORY_FIELDS)) {
      const line = text(key, { from: null, to: null });
      expect(line.length, key).toBeGreaterThan(3);
      expect(line, key).not.toMatch(/undefined|\[object/);
    }
  });

  it('shows a key this build does not know by name rather than dropping it', () => {
    expect(text('futureField', { from: 1, to: 2 })).toBe('futureField changed');
  });
});

describe('formatHistoryItem — links', () => {
  it('words an add on each end with its direction and the other end as named then', () => {
    expect(text('link:1', { dir: 'IN', other: OTHER, from: null, to: FS })).toBe(
      'Link added: Finish to Start from 1020 Steel erection',
    );
    expect(
      text('link:1', { dir: 'OUT', other: OTHER, from: null, to: { ...FS, lagMinutes: 960 } }),
    ).toBe('Link added: Finish to Start +2d to 1020 Steel erection');
  });

  it('words a removal and a change of type, lag and lag calendar', () => {
    expect(text('link:1', { dir: 'IN', other: OTHER, from: FS, to: null })).toBe(
      'Link removed: Finish to Start from 1020 Steel erection',
    );
    expect(
      text('link:1', {
        dir: 'IN',
        other: OTHER,
        from: FS,
        to: { type: 'SS', lagMinutes: -240, lagCalendar: 'TWENTY_FOUR_HOUR' },
      }),
    ).toBe(
      'Link changed: type Finish to Start → Start to Start, lag none → −4h, lag calendar changed from 1020 Steel erection',
    );
  });

  it('names an activity with no code by its name alone', () => {
    expect(
      text('link:1', {
        dir: 'IN',
        other: { id: 'x', code: null, name: 'Pour' },
        from: null,
        to: FS,
      }),
    ).toBe('Link added: Finish to Start from Pour');
  });

  it('names the other plan for a cross-plan link', () => {
    expect(
      text('xlink:1', {
        dir: 'OUT',
        other: { ...OTHER, planId: 'p', planName: 'Phase 2' },
        from: null,
        to: FS,
      }),
    ).toBe('Link added: Finish to Start to 1020 Steel erection (Phase 2)');
  });
});

describe('formatHistoryItem — guards', () => {
  it('carries the stored key, and never prints a zero lag as a hard-coded 0d', () => {
    const line = formatHistoryItem('link:9', { dir: 'IN', other: OTHER, from: null, to: FS }, CTX);
    expect(line.key).toBe('link:9');
    expect(line.text).not.toContain('0d');
  });

  it('says a link changed even when no visible difference is stored', () => {
    expect(text('link:1', { dir: 'IN', other: OTHER, from: FS, to: { ...FS } })).toBe(
      'Link changed from 1020 Steel erection',
    );
  });
});

describe('formatHistoryItem — resource assignments', () => {
  const resource = { id: 'r', code: 'CR600', name: 'Tower crane' };
  const state = (
    over: Partial<ActivityHistoryAssignmentState> = {},
  ): ActivityHistoryAssignmentState => ({
    budgetedUnits: '40.0000',
    unitsPerHour: null,
    actualUnits: '0.0000',
    isDriving: false,
    curveType: 'UNIFORM',
    lagMinutes: 0,
    ...over,
  });

  it('words an add with the resource as named then and its quantity without padding', () => {
    expect(text('assignment:1', { resource, from: null, to: state() })).toBe(
      'Resource added: Tower crane — 40 units',
    );
    expect(
      text('assignment:1', {
        resource,
        from: null,
        to: state({ budgetedUnits: '2.5000', isDriving: true }),
      }),
    ).toBe('Resource added: Tower crane — 2.5 units, driving');
  });

  it('words a removal', () => {
    expect(text('assignment:1', { resource, from: state(), to: null })).toBe(
      'Resource removed: Tower crane',
    );
  });

  it('shows no dangling dash when every difference was money withheld from this reader', () => {
    // A Viewer's page: both sides arrive with the money stripped and nothing else differing.
    expect(text('assignment:1', { resource, from: state(), to: state() })).toBe(
      'Resource changed: Tower crane',
    );
  });

  it('lists exactly what changed, and shows money only when the server sent it', () => {
    expect(
      text('assignment:1', {
        resource,
        from: state(),
        to: state({ budgetedUnits: '50.0000', isDriving: true, unitsPerHour: '2.0000' }),
      }),
    ).toBe(
      'Resource changed: Tower crane — budgeted units 40 → 50; units / time none → 2; now driving',
    );
    expect(
      text('assignment:1', {
        resource,
        from: state({ budgetedCost: 1000, actualCost: 0 }),
        to: state({ budgetedCost: 2000, actualCost: 0 }),
      }),
    ).toBe('Resource changed: Tower crane — budgeted cost £10.00 → £20.00');
  });
});

describe('formatHistoryEntry', () => {
  it('lists fields in the vocabulary’s order, then links and resources', () => {
    const lines = formatHistoryEntry(
      {
        'link:1': { dir: 'IN', other: OTHER, from: null, to: FS },
        percentComplete: { from: 0, to: 10 },
        name: { from: 'a', to: 'b' },
      },
      CTX,
    ).map((l) => l.text);
    expect(lines[0]).toBe('Name a → b');
    expect(lines[1]).toBe('% complete 0% → 10%');
    expect(lines[2]).toContain('Link added');
  });
});

describe('formatHistoryItem — knock-on origins', () => {
  it('says a link went because the other end was deleted, naming it as it was then', () => {
    expect(
      formatHistoryItem(
        'link:1',
        { dir: 'IN', other: OTHER, from: FS, to: null },
        CTX,
        'ACTIVITY_DELETED',
      ).text,
    ).toBe('Link removed — 1020 Steel erection was deleted');
  });

  it('says a link came back because the other end was restored', () => {
    expect(
      formatHistoryItem(
        'link:1',
        { dir: 'OUT', other: OTHER, from: null, to: FS },
        CTX,
        'ACTIVITY_RESTORED',
      ).text,
    ).toBe('Link restored — 1020 Steel erection was restored');
  });

  it('says nothing about a cause the item does not fit, rather than a wrong one', () => {
    expect(text('link:1', { dir: 'IN', other: OTHER, from: null, to: FS })).toBe(
      'Link added: Finish to Start from 1020 Steel erection',
    );
    expect(
      formatHistoryItem(
        'link:1',
        { dir: 'IN', other: OTHER, from: null, to: FS },
        CTX,
        'ACTIVITY_DELETED',
      ).text,
    ).toBe('Link added: Finish to Start from 1020 Steel erection');
  });

  it('names the plan of a cross-plan link in the knock-on wording too', () => {
    expect(
      formatHistoryItem(
        'xlink:1',
        { dir: 'IN', other: { ...OTHER, planName: 'Phase 2' }, from: FS, to: null },
        CTX,
        'ACTIVITY_DELETED',
      ).text,
    ).toBe('Link removed — 1020 Steel erection (Phase 2) was deleted');
  });

  it('says a re-parent happened because the summary was dissolved', () => {
    const lines = formatHistoryEntry(
      { parentId: { from: { id: 's', name: 'Inner' }, to: { id: 'o', name: 'Outer' } } },
      CTX,
      'SUMMARY_DISSOLVED',
    );
    expect(lines.map((l) => l.text)).toEqual([
      'WBS parent Inner → Outer — its summary was dissolved',
    ]);
    expect(
      formatHistoryEntry({ parentId: { from: null, to: { id: 'o', name: 'Outer' } } }, CTX).map(
        (l) => l.text,
      ),
    ).toEqual(['WBS parent none → Outer']);
  });
});
