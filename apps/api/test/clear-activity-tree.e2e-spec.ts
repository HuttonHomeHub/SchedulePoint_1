import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { activityChildModels, clearActivityTree } from './clear-activity-tree';

/**
 * The twin of `clear-baseline-tree.e2e-spec.ts` for `activities`. It needs no database and is an
 * `.e2e-spec.ts` for the same reason: the helper lives in `test/`, outside the unit config's glob.
 * The assertions watch the delegates the helper drives, so a hard-coded list that silently misses
 * the next child table fails here rather than passing alongside the thirteen callers.
 */
describe('clearActivityTree', () => {
  it('names every current child of Activity, and the history table in particular', () => {
    // Pinned, because "every returned model is a child" passes over an empty walk.
    expect(activityChildModels().sort()).toEqual([
      'ActivityDependency',
      'ActivityHistoryEntry',
      'ActivityStep',
      'CrossPlanDependency',
      'Note',
      'ResourceAssignment',
    ]);
  });

  it('deletes every child before the activities themselves', async () => {
    const calls: string[] = [];
    const delegate = (name: string) => ({
      deleteMany: vi.fn(() => {
        calls.push(name);
        return Promise.resolve({ count: 0 });
      }),
    });
    const stub = {
      activityDependency: delegate('ActivityDependency'),
      activityHistoryEntry: delegate('ActivityHistoryEntry'),
      activityStep: delegate('ActivityStep'),
      crossPlanDependency: delegate('CrossPlanDependency'),
      note: delegate('Note'),
      resourceAssignment: delegate('ResourceAssignment'),
      activity: delegate('Activity'),
    } as unknown as PrismaClient;

    await clearActivityTree(stub);

    expect(calls).toHaveLength(7);
    expect(calls.at(-1)).toBe('Activity');
    expect(calls.slice(0, 6).sort()).toEqual([
      'ActivityDependency',
      'ActivityHistoryEntry',
      'ActivityStep',
      'CrossPlanDependency',
      'Note',
      'ResourceAssignment',
    ]);
  });
});
