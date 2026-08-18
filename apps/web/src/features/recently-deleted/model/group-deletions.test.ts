import type { DeletedHierarchyItem } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { describeMembers, groupDeletions } from './group-deletions';

/**
 * The four shapes a deletion actually takes, because the root rule is the whole design and the
 * obvious version of it ("the shallowest kind present") is wrong for two of them.
 */

function row(over: Partial<DeletedHierarchyItem> & Pick<DeletedHierarchyItem, 'kind' | 'id'>) {
  return {
    name: over.id,
    deletedAt: '2026-08-18T10:00:00.000Z',
    canRestore: true,
    deleteBatchId: 'batch-1',
    blockedBy: null,
    ...over,
  };
}

const blocker = (kind: 'client' | 'project', id: string, batch: string | null) => ({
  kind,
  id,
  name: id,
  deleteBatchId: batch,
});

describe('grouping a deletion', () => {
  it('collapses a client cascade to one entry, rooted at the client', () => {
    const groups = groupDeletions([
      row({ kind: 'client', id: 'c1' }),
      row({
        kind: 'project',
        id: 'p1',
        canRestore: false,
        blockedBy: blocker('client', 'c1', 'batch-1'),
      }),
      row({
        kind: 'plan',
        id: 'pl1',
        canRestore: false,
        blockedBy: blocker('project', 'p1', 'batch-1'),
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.root.id).toBe('c1');
    expect(groups[0]!.members.map((m) => m.id)).toEqual(['p1', 'pl1']);
    expect(groups[0]!.canRestore).toBe(true);
  });

  it('roots a PROJECT cascade at the project, which a kind-ranking rule would get wrong', () => {
    // No client in this batch at all — the client is alive. A rule that looks for the shallowest
    // kind has to special-case this; "the row whose blocker is outside the batch" does not.
    const groups = groupDeletions([
      row({ kind: 'project', id: 'p1' }),
      row({
        kind: 'plan',
        id: 'pl1',
        canRestore: false,
        blockedBy: blocker('project', 'p1', 'batch-1'),
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.root.id).toBe('p1');
    expect(groups[0]!.canRestore).toBe(true);
  });

  it('keeps a CROSS-batch blocker blocked, and roots each batch separately', () => {
    // The case grouping cannot solve: a plan deleted alone, then its project deleted later. Two
    // batches. The plan's blocker is in the OTHER batch, which is what makes it the root of its own
    // group AND still blocked.
    const groups = groupDeletions([
      row({
        kind: 'project',
        id: 'p1',
        deleteBatchId: 'batch-2',
        deletedAt: '2026-08-18T11:00:00.000Z',
      }),
      row({
        kind: 'plan',
        id: 'pl1',
        deleteBatchId: 'batch-1',
        canRestore: false,
        blockedBy: blocker('project', 'p1', 'batch-2'),
      }),
    ]);
    expect(groups).toHaveLength(2);
    const planGroup = groups.find((g) => g.key === 'batch-1')!;
    expect(planGroup.root.id).toBe('pl1');
    expect(planGroup.canRestore).toBe(false);
    expect(planGroup.root.blockedBy?.deleteBatchId).toBe('batch-2');
  });

  it('leaves a row with no batch id standing alone rather than inventing a group', () => {
    // Deleted before batch ids existed. There is no evidence it was part of a cascade, and a group
    // of one claiming otherwise would be a worse answer than showing it as it is.
    const groups = groupDeletions([
      row({ kind: 'plan', id: 'legacy', deleteBatchId: null }),
      row({ kind: 'client', id: 'c1' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.key === 'plan:legacy')!.members).toEqual([]);
  });

  it('orders newest deletion first', () => {
    const groups = groupDeletions([
      row({
        kind: 'client',
        id: 'old',
        deleteBatchId: 'b-old',
        deletedAt: '2026-08-01T10:00:00.000Z',
      }),
      row({
        kind: 'client',
        id: 'new',
        deleteBatchId: 'b-new',
        deletedAt: '2026-08-18T10:00:00.000Z',
      }),
    ]);
    expect(groups.map((g) => g.root.id)).toEqual(['new', 'old']);
  });
});

describe('describing what a deletion took', () => {
  it('names the kinds rather than counting items', () => {
    // "+ 1 project, 1 plan" says whether a one-press restore is welcome; "+ 2 items" does not.
    expect(
      describeMembers([row({ kind: 'project', id: 'p' }), row({ kind: 'plan', id: 'pl' })]),
    ).toBe('1 project, 1 plan');
  });

  it('pluralises, and reads the same way whatever order the server sent', () => {
    const a = describeMembers([
      row({ kind: 'plan', id: '1' }),
      row({ kind: 'project', id: '2' }),
      row({ kind: 'plan', id: '3' }),
    ]);
    const b = describeMembers([
      row({ kind: 'project', id: '2' }),
      row({ kind: 'plan', id: '1' }),
      row({ kind: 'plan', id: '3' }),
    ]);
    expect(a).toBe('1 project, 2 plans');
    expect(a).toBe(b);
  });

  it('says nothing when the deletion took only its root', () => {
    expect(describeMembers([])).toBeNull();
  });
});
