import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { deriveWbsBandSource } from './wbs-band-source';
import { wbsSwimlaneInput, wbsSwimlaneLevels } from './wbs-swimlane-membership';

import { projectSwimlanes } from '@/features/tsld/render/project-swimlanes';
import { anActivity } from '@/test/activity-fixture';

/**
 * Swimlane membership at WBS level N. The tree used throughout:
 *
 * ```
 * works (L1)
 * ├─ struct (L2)
 * │  ├─ piling (L3)
 * │  │  └─ pile        (task)
 * │  └─ slab           (task)
 * └─ services (L2)
 *    └─ ducts          (task)
 * shed                 (task, no parent)
 * ```
 */
const summary = (id: string, parentId: string | null, laneIndex = 0, name = id) =>
  anActivity({ id, name, parentId, laneIndex, type: 'WBS_SUMMARY' });
const task = (id: string, parentId: string | null, over: Partial<ActivitySummary> = {}) =>
  anActivity({ id, name: id, parentId, type: 'TASK', ...over });

const TREE = [
  summary('works', null, 0, 'The Works'),
  summary('services', 'works', 5, 'Services'),
  summary('struct', 'works', 1, 'Structure'),
  summary('piling', 'struct', 0, 'Piling'),
  task('pile', 'piling'),
  task('slab', 'struct'),
  task('ducts', 'services'),
  task('shed', null),
];

const groupOf = (input: ReturnType<typeof wbsSwimlaneInput>, id: string) =>
  input.membership.get(id) ?? null;

describe('wbsSwimlaneInput: depth and levels', () => {
  it('level 1 makes one swimlane of the top summary and files its whole subtree under it', () => {
    const input = wbsSwimlaneInput(TREE, 1);
    expect(input.swimlanes).toEqual([{ id: 'works', name: 'The Works' }]);
    for (const id of ['works', 'struct', 'services', 'piling', 'pile', 'slab', 'ducts']) {
      expect(groupOf(input, id)).toBe('works');
    }
    expect(groupOf(input, 'shed')).toBeNull();
  });

  it('level 2 lists its summaries in WBS order (laneIndex), not list order, and files at any depth', () => {
    const input = wbsSwimlaneInput(TREE, 2);
    expect(input.swimlanes.map((s) => s.name)).toEqual(['Structure', 'Services']);
    expect(groupOf(input, 'pile')).toBe('struct');
    expect(groupOf(input, 'piling')).toBe('struct');
    expect(groupOf(input, 'slab')).toBe('struct');
    expect(groupOf(input, 'ducts')).toBe('services');
    // Above the level there is no group to be in.
    expect(groupOf(input, 'works')).toBeNull();
    expect(groupOf(input, 'shed')).toBeNull();
  });

  it('a summary at the level is in its own swimlane; a shallower one and a loose task are in none', () => {
    const input = wbsSwimlaneInput(TREE, 3);
    expect(input.swimlanes).toEqual([{ id: 'piling', name: 'Piling' }]);
    expect(groupOf(input, 'piling')).toBe('piling');
    expect(groupOf(input, 'pile')).toBe('piling');
    // `slab` hangs off a level-2 summary, so it has no level-3 group.
    expect(groupOf(input, 'slab')).toBeNull();
    expect(groupOf(input, 'struct')).toBeNull();
  });

  it('says it is a WBS input, so the comparison ghosts place removed work by the right basis', () => {
    expect(wbsSwimlaneInput(TREE, 2).source).toBe('WBS');
  });

  it('treats an orphan (a parent that is not in the list) as top-level', () => {
    const list = [summary('lost', 'gone-parent', 0), task('t', 'lost')];
    const input = wbsSwimlaneInput(list, 1);
    expect(input.swimlanes.map((s) => s.id)).toEqual(['lost']);
    expect(groupOf(input, 't')).toBe('lost');
  });

  it('a name follows its summary with no write: the label is read, not stored', () => {
    const renamed = TREE.map((a) => (a.id === 'struct' ? { ...a, name: 'Substructure' } : a));
    expect(wbsSwimlaneInput(renamed, 2).swimlanes.map((s) => s.name)).toEqual([
      'Substructure',
      'Services',
    ]);
  });

  it('ignores by-hand membership entirely', () => {
    const list = TREE.map((a) => (a.id === 'pile' ? { ...a, swimlaneId: 'hand-made' } : a));
    expect(groupOf(wbsSwimlaneInput(list, 2), 'pile')).toBe('struct');
  });

  it('a cycle gives "No swimlane" and a finite answer rather than hanging', () => {
    const cyc = [summary('x', 'y'), summary('y', 'x'), task('t', 'x')];
    const input = wbsSwimlaneInput(cyc, 1);
    expect(input.swimlanes).toEqual([]);
    expect(groupOf(input, 't')).toBeNull();
  });
});

describe('wbsSwimlaneInput: dissolve, delete and restore', () => {
  it('dissolving a summary files its children under the parent’s swimlane', () => {
    // `struct` dissolved: its children are re-filed under `works`, and it leaves the list.
    const dissolved = TREE.filter((a) => a.id !== 'struct').map((a) =>
      a.parentId === 'struct' ? { ...a, parentId: 'works' } : a,
    );
    const input = wbsSwimlaneInput(dissolved, 2);
    // `piling` moved up a level with its subtree; `slab` is now directly under the level-1
    // summary, so it has no level-2 group.
    expect(input.swimlanes.map((s) => s.id)).toEqual(['piling', 'services']);
    expect(groupOf(input, 'pile')).toBe('piling');
    expect(groupOf(input, 'slab')).toBeNull();
    expect(groupOf(input, 'ducts')).toBe('services');
  });

  it('dissolving a top-level summary sends its children to No swimlane', () => {
    const dissolved = TREE.filter((a) => a.id !== 'works').map((a) =>
      a.parentId === 'works' ? { ...a, parentId: null } : a,
    );
    const input = wbsSwimlaneInput(dissolved, 1);
    // The former level-2 summaries are now level 1, and their subtrees follow them.
    expect(input.swimlanes.map((s) => s.id)).toEqual(['struct', 'services']);
    expect(groupOf(input, 'pile')).toBe('struct');
  });

  it('deleting a summary takes its subtree out of the list, and restoring brings every member back', () => {
    const deleted = TREE.filter((a) => !['struct', 'piling', 'pile', 'slab'].includes(a.id));
    const gone = wbsSwimlaneInput(deleted, 2);
    expect(gone.swimlanes.map((s) => s.id)).toEqual(['services']);
    expect(gone.membership.has('pile')).toBe(false);

    const restored = wbsSwimlaneInput([...deleted, ...TREE.filter((a) => !deleted.includes(a))], 2);
    expect(restored.swimlanes.map((s) => s.id)).toEqual(['struct', 'services']);
    expect(groupOf(restored, 'pile')).toBe('struct');
  });
});

describe('wbsSwimlaneInput: stored lanes', () => {
  const row = (over: Partial<ActivitySummary['swimlaneLanes'][number]>) => ({
    basis: 'WBS_SUMMARY' as const,
    swimlaneId: null,
    summaryActivityId: 'struct',
    wbsLevel: null,
    laneIndex: 3,
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...over,
  });

  it('reads the row written against the activity’s own WBS group, whatever the level', () => {
    const list = TREE.map((a) =>
      a.id === 'pile'
        ? {
            ...a,
            swimlaneLanes: [
              row({}),
              row({ summaryActivityId: 'works', laneIndex: 9 }),
              // A by-hand row for the same activity is another basis, never read here.
              row({ basis: 'SWIMLANE', summaryActivityId: null, swimlaneId: 's1', laneIndex: 7 }),
            ],
          }
        : a,
    );
    expect(wbsSwimlaneInput(list, 2).storedLanes.get('pile')).toEqual({
      lane: 3,
      updatedAt: Date.parse('2026-01-02T00:00:00.000Z'),
    });
    // At level 1 the same activity is in `works`, and its row for that group is the one read.
    expect(wbsSwimlaneInput(list, 1).storedLanes.get('pile')?.lane).toBe(9);
  });

  it('reads the "No WBS group" row for the level in force, and only that level’s', () => {
    const none = (wbsLevel: number, laneIndex: number) =>
      row({ basis: 'NO_WBS_SUMMARY', summaryActivityId: null, wbsLevel, laneIndex });
    const list = TREE.map((a) =>
      a.id === 'shed' ? { ...a, swimlaneLanes: [none(1, 4), none(2, 6)] } : a,
    );
    expect(wbsSwimlaneInput(list, 1).storedLanes.get('shed')?.lane).toBe(4);
    expect(wbsSwimlaneInput(list, 2).storedLanes.get('shed')?.lane).toBe(6);
    expect(wbsSwimlaneInput(list, 3).storedLanes.has('shed')).toBe(false);
  });

  it('is one build per data change', () => {
    expect(wbsSwimlaneInput(TREE, 2)).toBe(wbsSwimlaneInput(TREE, 2));
    expect(wbsSwimlaneInput(TREE, 2)).not.toBe(wbsSwimlaneInput(TREE, 3));
  });
});

describe('wbsSwimlaneLevels', () => {
  it('counts the summaries at each level', () => {
    expect(wbsSwimlaneLevels(TREE).counts).toEqual([1, 2, 1]);
  });

  it('suggests the shallowest level with at least two summaries, skipping a lone "The Works"', () => {
    expect(wbsSwimlaneLevels(TREE).suggested).toBe(2);
  });

  it('falls back to the shallowest level with any summary when none has two', () => {
    const lone = [summary('a', null), summary('b', 'a'), task('t', 'b')];
    expect(wbsSwimlaneLevels(lone).suggested).toBe(1);
  });

  it('suggests nothing for a plan with no summaries', () => {
    expect(wbsSwimlaneLevels([task('t', null)])).toEqual({
      counts: [0, 0, 0],
      suggested: null,
    });
  });

  it('does not count a fourth level', () => {
    const deep = [summary('a', null), summary('b', 'a'), summary('c', 'b'), summary('d', 'c')];
    expect(wbsSwimlaneLevels(deep).counts).toEqual([1, 1, 1]);
  });
});

describe('the WBS band and WBS swimlanes together', () => {
  const dated = TREE.map((a) => ({
    ...a,
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-09',
  }));

  it('a summary the band lifts out takes no lane, so it is not drawn twice, while its swimlane stays', () => {
    const band = deriveWbsBandSource(dated, { enabled: true, toggleOn: true, source: 'early' });
    expect(band.sceneActivities.some((a) => a.id === 'struct')).toBe(false);

    const input = wbsSwimlaneInput(dated, 2);
    const projection = projectSwimlanes(band.sceneActivities, input, {
      source: 'early',
      dataDate: '2026-01-01',
    });
    expect(projection.displayLanes.has('struct')).toBe(false);
    expect(projection.extents.map((e) => e.name)).toContain('Structure');
    // The members of the lifted summary are still placed, in its swimlane.
    expect(projection.displayLanes.has('pile')).toBe(true);
  });

  it('with the band off the same summary is a member of its own swimlane', () => {
    const projection = projectSwimlanes(dated, wbsSwimlaneInput(dated, 2), {
      source: 'early',
      dataDate: '2026-01-01',
    });
    expect(projection.displayLanes.has('struct')).toBe(true);
  });
});
