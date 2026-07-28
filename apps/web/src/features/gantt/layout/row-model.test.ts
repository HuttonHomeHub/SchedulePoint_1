import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GANTT_SORT,
  buildRows,
  rowsDateSpan,
  sortActivities,
  type GanttSort,
} from './row-model';

import { anActivity } from '@/test/activity-fixture';

const asc = (key: GanttSort['key']): GanttSort => ({ key, direction: 'asc' });
const desc = (key: GanttSort['key']): GanttSort => ({ key, direction: 'desc' });

const ids = (rows: { activity: { id: string } }[]): string[] => rows.map((r) => r.activity.id);

describe('sortActivities', () => {
  it('orders by lane index for the default WBS sort', () => {
    const rows = sortActivities(
      [
        anActivity({ id: 'c', laneIndex: 2 }),
        anActivity({ id: 'a', laneIndex: 0 }),
        anActivity({ id: 'b', laneIndex: 1 }),
      ],
      DEFAULT_GANTT_SORT,
    );
    expect(rows.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders names naturally, so Task 10 follows Task 9', () => {
    const rows = sortActivities(
      [
        anActivity({ id: 'x', name: 'Task 10' }),
        anActivity({ id: 'y', name: 'Task 9' }),
        anActivity({ id: 'z', name: 'Task 1' }),
      ],
      asc('name'),
    );
    expect(rows.map((a) => a.name)).toEqual(['Task 1', 'Task 9', 'Task 10']);
  });

  it('reverses on descending', () => {
    const rows = sortActivities(
      [anActivity({ id: 'a', durationDays: 1 }), anActivity({ id: 'b', durationDays: 9 })],
      desc('duration'),
    );
    expect(rows.map((a) => a.id)).toEqual(['b', 'a']);
  });

  // The failure this prevents: sorting descending by early start and finding the un-scheduled
  // rows — the ones carrying the least information — at the very top of the chart.
  it.each([
    ['ascending', asc('earlyStart')],
    ['descending', desc('earlyStart')],
  ])('sinks activities with no dates to the bottom when %s', (_label, sort) => {
    const rows = sortActivities(
      [
        anActivity({ id: 'none', earlyStart: null, earlyFinish: null }),
        anActivity({ id: 'early', earlyStart: '2026-01-01' }),
        anActivity({ id: 'late', earlyStart: '2026-09-01' }),
      ],
      sort,
    );
    expect(rows[rows.length - 1]?.id).toBe('none');
  });

  it('sinks a missing code in both directions', () => {
    for (const sort of [asc('code'), desc('code')]) {
      const rows = sortActivities(
        [anActivity({ id: 'n', code: null }), anActivity({ id: 'c', code: 'A1' })],
        sort,
      );
      expect(rows[1]?.id).toBe('n');
    }
  });

  it('sinks a null total float in both directions', () => {
    for (const sort of [asc('totalFloat'), desc('totalFloat')]) {
      const rows = sortActivities(
        [anActivity({ id: 'n', totalFloat: null }), anActivity({ id: 'f', totalFloat: 3 })],
        sort,
      );
      expect(rows[1]?.id).toBe('n');
    }
  });

  it('sorts negative float below zero float — it is a number, not a missing value', () => {
    const rows = sortActivities(
      [
        anActivity({ id: 'zero', totalFloat: 0 }),
        anActivity({ id: 'neg', totalFloat: -12 }),
        anActivity({ id: 'pos', totalFloat: 5 }),
      ],
      asc('totalFloat'),
    );
    expect(rows.map((a) => a.id)).toEqual(['neg', 'zero', 'pos']);
  });

  // The input is a network response whose order we do not control, so stability alone is not
  // enough: two runs over the same set must agree, which needs a tiebreak of our own.
  it('is deterministic for equal keys regardless of input order', () => {
    const a = anActivity({ id: 'aaa', laneIndex: 0 });
    const b = anActivity({ id: 'bbb', laneIndex: 0 });
    expect(sortActivities([a, b], DEFAULT_GANTT_SORT).map((x) => x.id)).toEqual(
      sortActivities([b, a], DEFAULT_GANTT_SORT).map((x) => x.id),
    );
  });

  it('does not mutate its input', () => {
    const input = [anActivity({ id: 'b', laneIndex: 1 }), anActivity({ id: 'a', laneIndex: 0 })];
    sortActivities(input, DEFAULT_GANTT_SORT);
    expect(input.map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('handles an empty list', () => {
    expect(sortActivities([], DEFAULT_GANTT_SORT)).toEqual([]);
  });
});

describe('buildRows', () => {
  const parent = anActivity({ id: 'p', type: 'WBS_SUMMARY', name: 'Substructure', laneIndex: 0 });
  const childA = anActivity({ id: 'ca', parentId: 'p', name: 'Piling', laneIndex: 1 });
  const childB = anActivity({ id: 'cb', parentId: 'p', name: 'Caps', laneIndex: 2 });
  const sibling = anActivity({ id: 's', name: 'Superstructure', laneIndex: 3 });

  it('nests children under their parent, depth-first', () => {
    const rows = buildRows([sibling, childB, childA, parent], DEFAULT_GANTT_SORT);
    expect(ids(rows)).toEqual(['p', 'ca', 'cb', 's']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0]);
  });

  it('marks a parent as having children, and a leaf as not', () => {
    const rows = buildRows([parent, childA], DEFAULT_GANTT_SORT);
    expect(rows[0]?.hasChildren).toBe(true);
    expect(rows[0]?.expanded).toBe(true);
    expect(rows[1]?.hasChildren).toBe(false);
    expect(rows[1]?.expanded).toBeUndefined();
  });

  it('hides the subtree of a collapsed parent but keeps the parent', () => {
    const rows = buildRows([parent, childA, childB, sibling], DEFAULT_GANTT_SORT, new Set(['p']));
    expect(ids(rows)).toEqual(['p', 's']);
    expect(rows[0]?.expanded).toBe(false);
  });

  it('keeps children under their parent even when the sort would interleave them', () => {
    // Sorted by name alone this would be Caps, Piling, Substructure, Superstructure — a flat list
    // that says nothing about structure. Nesting must win.
    const rows = buildRows([parent, childA, childB, sibling], asc('name'));
    expect(ids(rows)).toEqual(['p', 'cb', 'ca', 's']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0]);
  });

  it('nests three levels deep', () => {
    const grandchild = anActivity({ id: 'g', parentId: 'ca', laneIndex: 9 });
    const rows = buildRows([parent, childA, grandchild], DEFAULT_GANTT_SORT);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2]);
  });

  // A row the user cannot see is worse than one indented wrongly.
  it('promotes an orphan to the root rather than dropping it', () => {
    const orphan = anActivity({ id: 'o', parentId: 'missing-parent' });
    const rows = buildRows([orphan], DEFAULT_GANTT_SORT);
    expect(ids(rows)).toEqual(['o']);
    expect(rows[0]?.depth).toBe(0);
  });

  it('handles an empty plan', () => {
    expect(buildRows([], DEFAULT_GANTT_SORT)).toEqual([]);
  });
});

describe('rowsDateSpan', () => {
  const span = (activities: Parameters<typeof buildRows>[0]) =>
    rowsDateSpan(buildRows(activities, DEFAULT_GANTT_SORT));

  it('spans the earliest start to the latest finish', () => {
    expect(
      span([
        anActivity({ id: 'a', earlyStart: '2026-03-01', earlyFinish: '2026-03-10' }),
        anActivity({ id: 'b', earlyStart: '2026-01-05', earlyFinish: '2026-01-20' }),
        anActivity({ id: 'c', earlyStart: '2026-02-01', earlyFinish: '2026-12-31' }),
      ]),
    ).toEqual({ start: '2026-01-05', finish: '2026-12-31' });
  });

  it('ignores activities with no dates', () => {
    expect(
      span([
        anActivity({ id: 'a', earlyStart: '2026-03-01', earlyFinish: '2026-03-10' }),
        anActivity({ id: 'b', earlyStart: null, earlyFinish: null }),
      ]),
    ).toEqual({ start: '2026-03-01', finish: '2026-03-10' });
  });

  // Without this the chart would anchor on an arbitrary date and draw a timeline for a plan that
  // has none — the caller must render its "not calculated" state instead.
  it('is null when nothing is scheduled', () => {
    expect(span([anActivity({ id: 'a', earlyStart: null, earlyFinish: null })])).toBeNull();
  });

  it('is null for an empty plan', () => {
    expect(rowsDateSpan([])).toBeNull();
  });
});
