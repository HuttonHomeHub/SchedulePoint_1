import type { SwimlaneSummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { deleteConsequence, membersBySwimlane, movedSwimlane, orderBody } from './swimlane-order';

const row = (id: string, version = 1): SwimlaneSummary => ({
  id,
  planId: 'p',
  name: id.toUpperCase(),
  position: 0,
  version,
  createdAt: '',
  updatedAt: '',
});
const LIST = [row('a'), row('b', 4), row('c')];

describe('movedSwimlane', () => {
  it('swaps with the neighbour', () => {
    expect(movedSwimlane(LIST, 'b', -1)?.map((s) => s.id)).toEqual(['b', 'a', 'c']);
    expect(movedSwimlane(LIST, 'b', 1)?.map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('is null at either end and for a stranger', () => {
    expect(movedSwimlane(LIST, 'a', -1)).toBeNull();
    expect(movedSwimlane(LIST, 'c', 1)).toBeNull();
    expect(movedSwimlane(LIST, 'zz', 1)).toBeNull();
  });

  it('does not touch the list it was given', () => {
    movedSwimlane(LIST, 'b', 1);
    expect(LIST.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('orderBody', () => {
  it('names every swimlane once with its version', () => {
    expect(orderBody(LIST)).toEqual([
      { id: 'a', version: 1 },
      { id: 'b', version: 4 },
      { id: 'c', version: 1 },
    ]);
  });
});

describe('membersBySwimlane', () => {
  it('counts only swimlanes that are in the list, so a deleted swimlane’s members are not counted', () => {
    const counts = membersBySwimlane(
      [{ swimlaneId: 'a' }, { swimlaneId: 'a' }, { swimlaneId: 'gone' }, { swimlaneId: null }],
      new Set(['a', 'b']),
    );
    expect(counts.get('a')).toBe(2);
    expect(counts.has('gone')).toBe(false);
    expect(counts.has('b')).toBe(false);
  });
});

describe('deleteConsequence', () => {
  it('says where the members go and that Undo brings them back', () => {
    expect(deleteConsequence(12)).toBe(
      '12 activities will show under No swimlane. Undo brings them back.',
    );
    expect(deleteConsequence(1)).toBe(
      '1 activity will show under No swimlane. Undo brings it back.',
    );
    expect(deleteConsequence(0)).toBe('No activities are in this swimlane. Undo brings it back.');
  });
});
