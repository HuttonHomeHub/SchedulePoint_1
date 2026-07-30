import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { deleteActivityDescription } from './delete-activity-copy';

type Node = Pick<ActivitySummary, 'id' | 'parentId'>;
const node = (id: string, parentId: string | null = null): Node => ({ id, parentId });
const subject = (id: string, name: string, type: ActivitySummary['type']) => ({ id, name, type });

describe('deleteActivityDescription', () => {
  it('leaves a plain activity’s copy alone', () => {
    expect(deleteActivityDescription(subject('t1', 'Excavate', 'TASK'), [node('t1')])).toBe(
      'Delete “Excavate”? You can restore it later.',
    );
  });

  // The defect this exists for: a summary got the identical sentence, so a planner deleting a
  // grouping was never told the work under it was going too.
  it('names the descendant count for a summary, and offers dissolve', () => {
    const copy = deleteActivityDescription(subject('s1', 'Substructure', 'WBS_SUMMARY'), [
      node('s1'),
      node('t1', 's1'),
      node('t2', 's1'),
    ]);
    expect(copy).toContain('2 activities below it');
    expect(copy).toContain('Deleting a summary deletes everything it contains');
    expect(copy).toContain('dissolve');
  });

  it('counts the WHOLE subtree, not just the direct children', () => {
    const copy = deleteActivityDescription(subject('s1', 'Outer', 'WBS_SUMMARY'), [
      node('s1'),
      node('s2', 's1'),
      node('t1', 's2'),
      node('t2', 's2'),
    ]);
    expect(copy).toContain('3 activities below it');
  });

  it('singularises one descendant', () => {
    const copy = deleteActivityDescription(subject('s1', 'Substructure', 'WBS_SUMMARY'), [
      node('s1'),
      node('t1', 's1'),
    ]);
    expect(copy).toContain('the 1 activity below it');
  });

  it('says so plainly when a summary is empty', () => {
    expect(
      deleteActivityDescription(subject('s1', 'Substructure', 'WBS_SUMMARY'), [node('s1')]),
    ).toBe(
      'Delete the summary “Substructure”? It has nothing filed under it. You can restore it later.',
    );
  });

  // The list is loaded asynchronously, so the dialog can open before it arrives. Claiming "nothing
  // filed under it" would be a confident lie; the empty-summary sentence is only reached when the
  // subject itself is present, which it cannot be if nothing has loaded.
  it('does not claim an empty summary while the plan is still loading', () => {
    const copy = deleteActivityDescription(subject('s1', 'Substructure', 'WBS_SUMMARY'), []);
    expect(copy).not.toContain('nothing filed under it');
  });

  it('ignores a sibling subtree', () => {
    const copy = deleteActivityDescription(subject('s1', 'A', 'WBS_SUMMARY'), [
      node('s1'),
      node('t1', 's1'),
      node('s2'),
      node('t2', 's2'),
      node('t3', 's2'),
    ]);
    expect(copy).toContain('the 1 activity below it');
  });

  // Render-path code: the server forbids a cycle, but this must not hang the dialog if one exists.
  it('terminates on a malformed cycle', () => {
    const copy = deleteActivityDescription(subject('s1', 'A', 'WBS_SUMMARY'), [
      node('s1', 's2'),
      node('s2', 's1'),
    ]);
    expect(copy).toContain('the 1 activity below it');
  });
});
