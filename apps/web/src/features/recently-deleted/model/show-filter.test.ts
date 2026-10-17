import type { DeletedItem } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { groupDeletions } from './group-deletions';
import { emptyFilterSentence, filterGroups, SHOW_FILTERS } from './show-filter';

function row(over: Partial<DeletedItem> & Pick<DeletedItem, 'kind' | 'id'>): DeletedItem {
  return {
    name: over.id,
    deletedAt: '2026-08-18T10:00:00.000Z',
    canRestore: true,
    deleteBatchId: over.id,
    blockedBy: null,
    subtype: null,
    expiresAt: null,
    ...over,
  };
}

const groups = groupDeletions([
  row({ kind: 'client', id: 'c' }),
  // A project that took a calendar with it: ONE group, rooted at the project.
  row({ kind: 'project', id: 'p', deleteBatchId: 'b-p' }),
  row({
    kind: 'calendar',
    id: 'pc',
    subtype: 'PROJECT',
    deleteBatchId: 'b-p',
    canRestore: false,
    blockedBy: { kind: 'project', relation: 'parent', id: 'p', name: 'p', deleteBatchId: 'b-p' },
  }),
  row({ kind: 'resource', id: 'r', subtype: 'GROUP' }),
  row({ kind: 'calendar', id: 'oc', subtype: 'ORG' }),
]);

const ids = (list: readonly { root: { id: string } }[]) => list.map((g) => g.root.id).sort();

describe('narrowing the bin by the kind of deletion', () => {
  it('shows everything for "all", by reference, so the default costs nothing', () => {
    expect(filterGroups(groups, 'all')).toBe(groups);
  });

  it('filters by the group’s ROOT, not by anything inside it', () => {
    expect(ids(filterGroups(groups, 'hierarchy'))).toEqual(['c', 'p']);
    expect(ids(filterGroups(groups, 'resources'))).toEqual(['r']);
    // The project calendar is a member of the project's row, so it is NOT here — only the ORG one.
    expect(ids(filterGroups(groups, 'calendars'))).toEqual(['oc']);
  });

  it('partitions the bin: every group is in exactly one narrowed view', () => {
    const narrowed = SHOW_FILTERS.filter((show) => show !== 'all').flatMap((show) =>
      filterGroups(groups, show),
    );
    expect(ids(narrowed)).toEqual(ids(groups));
  });

  it('names what is empty in each narrowed view, never the whole-bin sentence', () => {
    expect(emptyFilterSentence('resources')).toBe('No deleted resources.');
    expect(emptyFilterSentence('calendars')).toBe('No deleted calendars.');
    expect(emptyFilterSentence('hierarchy')).toBe('No deleted clients, projects or plans.');
    expect(emptyFilterSentence('all')).toBe('Nothing has been deleted.');
  });
});
