import { describe, expect, it } from 'vitest';

import { nodeActions } from './tree-actions';

describe('nodeActions', () => {
  it('offers nothing to a non-writer, whatever the kind', () => {
    expect(nodeActions('client', false)).toEqual([]);
    expect(nodeActions('project', false)).toEqual([]);
    expect(nodeActions('plan', false)).toEqual([]);
  });

  it('lets a writer create a project under a client, then rename/delete', () => {
    expect(nodeActions('client', true).map((a) => a.kind)).toEqual([
      'create-project',
      'rename',
      'delete',
    ]);
  });

  it('lets a writer create a plan under a project, then rename/delete', () => {
    expect(nodeActions('project', true).map((a) => a.kind)).toEqual([
      'create-plan',
      'rename',
      'delete',
    ]);
  });

  it('offers only rename/delete on a plan (a leaf has no child to create)', () => {
    expect(nodeActions('plan', true).map((a) => a.kind)).toEqual(['rename', 'delete']);
  });

  it('marks only delete as destructive', () => {
    const destructive = nodeActions('client', true)
      .filter((a) => a.destructive)
      .map((a) => a.kind);
    expect(destructive).toEqual(['delete']);
  });
});
