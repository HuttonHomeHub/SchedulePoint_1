import { describe, expect, it } from 'vitest';

import { projectSwimlanes, type SwimlaneInput } from '../render/project-swimlanes';

import { groupListboxRows, listboxOrder, swimlaneLaneClauses } from './group-listbox';

import { wbsSwimlaneInput } from '@/features/wbs';
import { anActivity } from '@/test/activity-fixture';

const bar = (id: string, start: number, end: number) =>
  anActivity({
    id,
    laneIndex: 0,
    visualEffectiveStart: `2026-01-${String(start + 1).padStart(2, '0')}`,
    visualEffectiveFinish: `2026-01-${String(end + 1).padStart(2, '0')}`,
  });

const ACTIVITIES = [bar('a', 0, 3), bar('b', 0, 3), bar('c', 0, 3), bar('d', 5, 8)];

const input = (membership: Record<string, string | null>): SwimlaneInput => ({
  swimlanes: [
    { id: 'S1', name: 'Civil' },
    { id: 'S2', name: 'Mechanical' },
  ],
  membership: new Map(Object.entries(membership)),
  storedLanes: new Map(),
});

describe('groupListboxRows', () => {
  it('is one unlabelled group whose rows are the very array it was given, with no input', () => {
    const groups = groupListboxRows(ACTIVITIES, null);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBeNull();
    expect(groups[0]?.rows).toBe(ACTIVITIES);
    expect(listboxOrder(groups)).toBe(ACTIVITIES);
  });

  it('groups in swimlane order with "No swimlane" last, keeping plan order inside a group', () => {
    const groups = groupListboxRows(ACTIVITIES, input({ a: 'S2', b: null, c: 'S1', d: 'S2' }));
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['Civil', ['c']],
      ['Mechanical', ['a', 'd']],
      ['No swimlane', ['b']],
    ]);
    expect(listboxOrder(groups).map((r) => r.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('keeps an empty swimlane as a group and omits an empty "No swimlane"', () => {
    const groups = groupListboxRows(ACTIVITIES, input({ a: 'S1', b: 'S1', c: 'S1', d: 'S1' }));
    expect(groups.map((g) => [g.label, g.rows.length])).toEqual([
      ['Civil', 4],
      ['Mechanical', 0],
    ]);
  });

  it('puts a member of a deleted swimlane, and an activity the input does not know, under none', () => {
    const groups = groupListboxRows(ACTIVITIES, input({ a: 'gone', b: 'S1' }));
    expect(groups.find((g) => g.label === 'No swimlane')?.rows.map((r) => r.id)).toEqual([
      'a',
      'c',
      'd',
    ]);
  });

  it('puts every activity in exactly one group, whatever the membership', () => {
    const groups = groupListboxRows(ACTIVITIES, input({ a: 'S2', c: 'S1', d: 'nope' }));
    const ids = listboxOrder(groups).map((r) => r.id);
    expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('swimlaneLaneClauses', () => {
  it('words a bar’s place as "in <swimlane>, lane N of M", and says nothing of a bar it does not draw', () => {
    const scene = projectSwimlanes(
      [...ACTIVITIES, anActivity({ id: 'undrawn', laneIndex: 0 })],
      input({ a: 'S2', b: 'S2', c: null, d: 'S2' }),
      { source: 'visual', dataDate: '2026-01-01' },
    );
    const clauses = swimlaneLaneClauses(scene);
    // a and b overlap, so Mechanical needs two lanes; d (later) shares the first.
    expect(clauses.get('a')).toBe('in Mechanical, lane 1 of 2');
    expect(clauses.get('b')).toBe('in Mechanical, lane 2 of 2');
    expect(clauses.get('d')).toBe('in Mechanical, lane 1 of 2');
    expect(clauses.get('c')).toBe('in No swimlane, lane 1 of 1');
    expect(clauses.has('undrawn')).toBe(false);
  });
});

describe('a WBS source is spoken like a hand-made one (M3)', () => {
  const dated = { visualEffectiveStart: '2026-01-02', visualEffectiveFinish: '2026-01-05' };
  const TREE = [
    anActivity({ id: 'struct', name: 'Structure', type: 'WBS_SUMMARY', ...dated }),
    anActivity({ id: 'slab', parentId: 'struct', ...dated }),
    anActivity({ id: 'shed', ...dated }),
  ];

  it('groups the listbox under the summary’s name, with "No swimlane" last', () => {
    const groups = groupListboxRows(TREE, wbsSwimlaneInput(TREE, 1));
    expect(groups.map((g) => [g.label, g.rows.map((r) => r.id)])).toEqual([
      ['Structure', ['struct', 'slab']],
      ['No swimlane', ['shed']],
    ]);
  });

  it('words a bar’s place with the summary’s name', () => {
    const scene = projectSwimlanes(TREE, wbsSwimlaneInput(TREE, 1), {
      source: 'visual',
      dataDate: '2026-01-01',
    });
    expect(swimlaneLaneClauses(scene).get('slab')).toMatch(/^in Structure, lane \d of \d$/);
  });
});
