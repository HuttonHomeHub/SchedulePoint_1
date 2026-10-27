import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { clearPlanTree, planDescendantModels } from './clear-plan-tree';

/**
 * The twin of `clear-activity-tree.e2e-spec.ts` for `plans`. It needs no database and is an
 * `.e2e-spec.ts` for the same reason: the helper lives in `test/`, outside the unit config's glob.
 */
describe('clearPlanTree', () => {
  it('names every descendant of Plan, children before the models they hold keys into', () => {
    const order = planDescendantModels();
    // Pinned, because "every returned model is a descendant" passes over an empty walk. A member
    // appearing or disappearing is a schema change this spec should make its author look at.
    expect(order.slice().sort()).toEqual([
      'Activity',
      'ActivityDependency',
      'ActivityHistoryEntry',
      'ActivityStep',
      'ActivitySwimlaneLane',
      'Baseline',
      'BaselineActivity',
      'BaselineActivitySwimlaneLane',
      'BaselineAssignment',
      'BaselineDependency',
      'CodeSwimlaneLane',
      'CodeType',
      'CodeValue',
      'CodeValueAssignment',
      'CrossPlanDependency',
      'CrossPlanLagMigration',
      'FmDateMigration',
      'Note',
      'PlacementMigration',
      'PlanLock',
      'PlanShare',
      'ResourceAssignment',
      'Swimlane',
    ]);
    const before = (child: string, parent: string): boolean =>
      order.indexOf(child) < order.indexOf(parent);
    expect(before('CodeValueAssignment', 'CodeValue')).toBe(true);
    expect(before('CodeValueAssignment', 'Activity')).toBe(true);
    expect(before('CodeSwimlaneLane', 'CodeType')).toBe(true);
    expect(before('CodeValue', 'CodeType')).toBe(true);
    expect(before('ActivityDependency', 'Activity')).toBe(true);
    expect(before('BaselineActivity', 'Baseline')).toBe(true);
  });

  it('clears the swimlane pointer before it deletes a code type, and the plans last', async () => {
    const calls: string[] = [];
    const delegate = (name: string) => ({
      deleteMany: vi.fn(() => {
        calls.push(`delete ${name}`);
        return Promise.resolve({ count: 0 });
      }),
    });
    const stub = Object.fromEntries(
      planDescendantModels().map((m) => [m.charAt(0).toLowerCase() + m.slice(1), delegate(m)]),
    );
    const prisma = {
      ...stub,
      plan: {
        ...delegate('Plan'),
        updateMany: vi.fn(() => {
          calls.push('clear pointer');
          return Promise.resolve({ count: 0 });
        }),
      },
    } as unknown as PrismaClient;

    await clearPlanTree(prisma);

    expect(calls[0]).toBe('clear pointer');
    expect(calls.at(-1)).toBe('delete Plan');
    expect(calls).toHaveLength(planDescendantModels().length + 2);
    expect(calls.indexOf('clear pointer')).toBeLessThan(calls.indexOf('delete CodeType'));
  });
});
