import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GANTT_SORT,
  UNASSIGNED_ROW_ID,
  buildRows,
  rowId,
  rowsDateSpan,
  sortActivities,
  type GanttActivityRow,
  type GanttRow,
  type GanttSort,
} from './row-model';

import { anActivity } from '@/test/activity-fixture';

const asc = (key: GanttSort['key']): GanttSort => ({ key, direction: 'asc' });
const desc = (key: GanttSort['key']): GanttSort => ({ key, direction: 'desc' });

// `rowId` handles both row kinds; the bucket's reserved id shows up as `__unassigned__`, which is
// what the bucket tests below assert against.
const ids = (rows: GanttRow[]): string[] => rows.map(rowId);
/** The activity rows only, for the assertions that are about depth/disclosure. */
const activityRows = (rows: GanttRow[]): GanttActivityRow[] =>
  rows.filter((r): r is GanttActivityRow => r.kind === 'activity');

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
    expect(activityRows(rows).map((r) => r.depth)).toEqual([0, 1, 1, 0]);
  });

  it('marks a parent as having children, and a leaf as not', () => {
    const rows = buildRows([parent, childA], DEFAULT_GANTT_SORT);
    expect(activityRows(rows)[0]?.hasChildren).toBe(true);
    expect(activityRows(rows)[0]?.expanded).toBe(true);
    expect(activityRows(rows)[1]?.hasChildren).toBe(false);
    expect(activityRows(rows)[1]?.expanded).toBeUndefined();
  });

  it('hides the subtree of a collapsed parent but keeps the parent', () => {
    const rows = buildRows([parent, childA, childB, sibling], DEFAULT_GANTT_SORT, new Set(['p']));
    expect(ids(rows)).toEqual(['p', 's']);
    expect(activityRows(rows)[0]?.expanded).toBe(false);
  });

  it('keeps children under their parent even when the sort would interleave them', () => {
    // Sorted by name alone this would be Caps, Piling, Substructure, Superstructure — a flat list
    // that says nothing about structure. Nesting must win.
    const rows = buildRows([parent, childA, childB, sibling], asc('name'));
    expect(ids(rows)).toEqual(['p', 'cb', 'ca', 's']);
    expect(activityRows(rows).map((r) => r.depth)).toEqual([0, 1, 1, 0]);
  });

  it('nests three levels deep', () => {
    const grandchild = anActivity({ id: 'g', parentId: 'ca', laneIndex: 9 });
    const rows = buildRows([parent, childA, grandchild], DEFAULT_GANTT_SORT);
    expect(activityRows(rows).map((r) => r.depth)).toEqual([0, 1, 2]);
  });

  // A row the user cannot see is worse than one indented wrongly.
  it('promotes an orphan to the root rather than dropping it', () => {
    const orphan = anActivity({ id: 'o', parentId: 'missing-parent' });
    const rows = buildRows([orphan], DEFAULT_GANTT_SORT);
    expect(ids(rows)).toEqual(['o']);
    expect(activityRows(rows)[0]?.depth).toBe(0);
  });

  it('handles an empty plan', () => {
    expect(buildRows([], DEFAULT_GANTT_SORT)).toEqual([]);
  });

  it('emits no bucket unless asked, whatever the plan looks like', () => {
    const loose = anActivity({ id: 'loose', laneIndex: 9 });
    expect(ids(buildRows([parent, childA, loose], DEFAULT_GANTT_SORT))).toEqual([
      'p',
      'ca',
      'loose',
    ]);
  });
});

/**
 * The derived **Unassigned** bucket (WBS improvements M3). What is filed is decided by
 * `features/wbs/model/wbs-groups.ts`, which has its own suite; these tests are about the ROWS —
 * where the bucket sits, what it nests, and the two conditions under which it does not appear.
 */
describe('buildRows — the Unassigned bucket', () => {
  const parent = anActivity({ id: 'p', type: 'WBS_SUMMARY', name: 'Substructure', laneIndex: 0 });
  const child = anActivity({ id: 'c', parentId: 'p', name: 'Piling', laneIndex: 1 });
  const loose = anActivity({ id: 'l1', name: 'Loose one', laneIndex: 5 });
  const looser = anActivity({ id: 'l2', name: 'Loose two', laneIndex: 6 });
  const withBucket = { unassignedBucket: true } as const;

  it('gathers unfiled work under one bucket row, after the filed structure', () => {
    const rows = buildRows(
      [parent, child, loose, looser],
      DEFAULT_GANTT_SORT,
      new Set(),
      withBucket,
    );
    expect(ids(rows)).toEqual(['p', 'c', UNASSIGNED_ROW_ID, 'l1', 'l2']);
  });

  it('indents the bucket’s members one level, like any other grouping', () => {
    const rows = buildRows([parent, child, loose], DEFAULT_GANTT_SORT, new Set(), withBucket);
    expect(activityRows(rows).map((r) => r.depth)).toEqual([0, 1, 1]);
  });

  it('collapses to hide its members, keeping the bucket row', () => {
    const rows = buildRows(
      [parent, child, loose, looser],
      DEFAULT_GANTT_SORT,
      new Set([UNASSIGNED_ROW_ID]),
      withBucket,
    );
    expect(ids(rows)).toEqual(['p', 'c', UNASSIGNED_ROW_ID]);
    expect(rows.at(-1)).toMatchObject({ kind: 'bucket', expanded: false, count: 2 });
  });

  // Two separate conditions, and each has its own reason. Nothing unfiled ⇒ nothing to bucket.
  it('emits no bucket when every activity is filed', () => {
    const rows = buildRows([parent, child], DEFAULT_GANTT_SORT, new Set(), withBucket);
    expect(ids(rows)).toEqual(['p', 'c']);
  });

  // A flat plan is already honest; heading it "Unassigned" would invent a hierarchy it has not got
  // and indent every row to say nothing.
  it('emits no bucket when the plan has no real summary at all', () => {
    const rows = buildRows([loose, looser], DEFAULT_GANTT_SORT, new Set(), withBucket);
    expect(ids(rows)).toEqual(['l1', 'l2']);
  });

  it('sorts the bucket’s members by the active sort, like any sibling set', () => {
    const rows = buildRows([parent, child, looser, loose], asc('name'), new Set(), withBucket);
    // "Loose one" before "Loose two" by name, whatever order they arrived in.
    expect(ids(rows).slice(-2)).toEqual(['l1', 'l2']);
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
