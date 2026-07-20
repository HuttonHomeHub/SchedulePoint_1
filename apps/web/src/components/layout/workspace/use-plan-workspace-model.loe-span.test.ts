import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiFetchError } from '@/lib/api/client';

/**
 * `createLoeSpan` seam coverage (Stage D, `docs/specs/canvas-activity-types/`): the workspace model
 * composes a `LEVEL_OF_EFFORT` activity + an SS (start → LOE) and an FF (LOE → finish) edge from two
 * driver ids, records ONE undoable command, and fires the coalesced recalc — and on ANY sub-mutation
 * failure it ROLLS BACK the just-created LOE (delete → cascade), refetches, and clears the redo branch
 * so no orphan LOE survives. The command builder + history store have their own unit suites; here we
 * assert the model wiring, with spies standing in for the mutations + the history store.
 */

const h = vi.hoisted(() => ({
  record: vi.fn(),
  clearRedo: vi.fn(),
  createPlaced: vi.fn(),
  createDependency: vi.fn(),
  deleteActivity: vi.fn(),
  notify: vi.fn(),
  refetch: vi.fn(),
  writeRejected: { kind: 'none' },
}));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: false,
    SCHEDULING_MODES_ENABLED: false,
    NOTES_ENABLED: false,
    UNDO_REDO_ENABLED: true,
  };
});

// Keep the real command builders (they're pure); swap only the history store for record/clearRedo spies.
vi.mock('@/features/undo-redo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanEditHistory: () => ({
    record: h.record,
    clearRedo: h.clearRedo,
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
    canUndo: false,
    canRedo: false,
  }),
}));

const query = <T>(data: T) => ({ data, isPending: false, isError: false, refetch: h.refetch });

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));
vi.mock('@/hooks/use-org-role', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useOrgRole: () => 'PLANNER',
}));
vi.mock('@/features/auth', () => ({ useSession: () => ({ data: { user: { id: 'u1' } } }) }));
vi.mock('@/features/plan-lock', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanPen: () => ({
    penManaged: false,
    holdsPen: true,
    onWriteRejected: () => h.writeRejected,
  }),
}));
vi.mock('@/features/plans', () => ({
  usePlan: () => query({ id: 'p1', projectId: 'proj1', plannedStart: '2026-01-01' }),
}));
vi.mock('@/features/projects', () => ({ useProject: () => query({ clientId: 'c1' }) }));
vi.mock('@/features/clients', () => ({ useClient: () => query({ id: 'c1' }) }));
vi.mock('@/features/calendars', () => ({
  useCalendars: () => query([]),
  useCalendar: () => query(undefined),
}));
vi.mock('@/features/baselines', () => ({ useBaselineVariance: () => query(undefined) }));
vi.mock('@/features/notes', () => ({ useActivityNoteCounts: () => query(undefined) }));
vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: h.createDependency }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/features/schedule', () => ({
  useRecalculate: () => ({ mutateAsync: vi.fn() }),
  usePlanAutoRecalc: () => ({ notify: h.notify }),
}));

const ACTIVITY: ActivitySummary = {
  id: 'start',
  planId: 'p1',
  code: null,
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 5,
  constraintType: null,
  constraintDate: null,
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: null,
  laneIndex: 0,
  scheduleAsLateAsPossible: false,
  expectedFinish: null,
  status: 'NOT_STARTED',
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  remainingDurationDays: null,
  suspendDate: null,
  resumeDate: null,
  earlyStart: null,
  earlyFinish: null,
  lateStart: null,
  lateFinish: null,
  totalFloat: null,
  freeFloat: null,
  isCritical: false,
  isNearCritical: false,
  constraintViolated: false,
  externalDriven: false,
  loeNoSpan: false,
  resourceDriverMissing: false,
  externalEarlyStart: null,
  externalLateFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  parentId: null,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
  levelingPriority: null,
  leveledStart: null,
  leveledFinish: null,
  levelingDelayDays: null,
  levelingWindowExceeded: false,
  selfOverAllocated: false,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  physicalPercentComplete: null,
  budgetedExpense: null,
  actualExpense: null,
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};
const FINISH: ActivitySummary = { ...ACTIVITY, id: 'finish', name: 'Pour', laneIndex: 1 };
const LOE: ActivitySummary = {
  ...ACTIVITY,
  id: 'loe-1',
  name: 'Level of effort',
  type: 'LEVEL_OF_EFFORT',
  durationDays: 0,
};
const DEPENDENCY = {
  id: 'dep-1',
  planId: 'p1',
  type: 'SS',
  lagDays: 0,
  lagCalendar: 'PROJECT_DEFAULT',
  predecessor: { id: 'start', code: null, name: 'Excavate' },
  successor: { id: 'loe-1', code: null, name: 'Level of effort' },
  isDriving: false,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as const;

vi.mock('@/features/activities', () => ({
  useActivities: () => query([ACTIVITY, FINISH]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: h.createPlaced }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useDeleteActivity: () => ({ mutateAsync: h.deleteActivity }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

// Imported AFTER the mocks are declared (so the model sees the mocked hooks/env).
// eslint-disable-next-line import/order -- must load after the vi.mock() calls above
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

const conflict = (status: number) =>
  new ApiFetchError(status, { message: 'That link would create a loop', code: 'CONFLICT' });

beforeEach(() => {
  vi.clearAllMocks();
  h.writeRejected = { kind: 'none' };
  h.createPlaced.mockResolvedValue(LOE);
  h.createDependency.mockResolvedValue(DEPENDENCY);
  h.deleteActivity.mockResolvedValue(undefined);
});

describe('usePlanWorkspaceModel.createLoeSpan', () => {
  it('happy path: composes LOE + SS + FF, records ONE command, and fires the recalc', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: { applied: boolean; conflict: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.createLoeSpan({
        startDriverId: 'start',
        finishDriverId: 'finish',
      });
    });

    expect(outcome).toEqual({ applied: true, conflict: null });
    // The LOE is created (duration derived → 0) in its start driver's lane.
    expect(h.createPlaced).toHaveBeenCalledExactlyOnceWith({
      name: 'Level of effort',
      type: 'LEVEL_OF_EFFORT',
      durationDays: 0,
      laneIndex: 0,
    });
    // Then the SS (start → LOE) and FF (LOE → finish) edges, in order.
    expect(h.createDependency).toHaveBeenCalledTimes(2);
    expect(h.createDependency).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ predecessorId: 'start', successorId: 'loe-1', type: 'SS' }),
    );
    expect(h.createDependency).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ predecessorId: 'loe-1', successorId: 'finish', type: 'FF' }),
    );
    // Exactly one undo command for the whole compose, and the coalesced recalc fired. No rollback.
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.deleteActivity).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('the single recorded command undoes the LOE (its edges cascade with it)', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.createLoeSpan({ startDriverId: 'start', finishDriverId: 'finish' });
    });

    const command = h.record.mock.calls[0]![0];
    await command.undo();
    // Undo deletes the LOE; the SS + FF edges cascade with it — no separate edge deletes.
    expect(h.deleteActivity).toHaveBeenCalledExactlyOnceWith('loe-1');
  });

  it('rolls back the LOE and clears redo when an edge create fails (no orphan)', async () => {
    // SS succeeds, FF fails with a 409 conflict.
    h.createDependency.mockResolvedValueOnce(DEPENDENCY).mockRejectedValueOnce(conflict(409));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: { applied: boolean; conflict: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.createLoeSpan({
        startDriverId: 'start',
        finishDriverId: 'finish',
      });
    });

    expect(outcome).toEqual({ applied: false, conflict: 'That link would create a loop' });
    // The just-created LOE is deleted (rollback → cascade removes the partial SS edge) — no orphan.
    expect(h.deleteActivity).toHaveBeenCalledExactlyOnceWith('loe-1');
    // Abort-and-refetch + clear redo; nothing recorded.
    expect(h.refetch).toHaveBeenCalled();
    expect(h.clearRedo).toHaveBeenCalledTimes(1);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('aborts on a 423 pen-loss mid-compose: rolls back, clears redo, no conflict banner', async () => {
    h.writeRejected = { kind: 'lock' };
    h.createDependency.mockRejectedValueOnce(conflict(423));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: { applied: boolean; conflict: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.createLoeSpan({
        startDriverId: 'start',
        finishDriverId: 'finish',
      });
    });

    // A pen loss is handled by the shared pen banner — no inline conflict message here.
    expect(outcome).toEqual({ applied: false, conflict: null });
    expect(h.deleteActivity).toHaveBeenCalledExactlyOnceWith('loe-1'); // rolled back
    expect(h.clearRedo).toHaveBeenCalledTimes(1);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('a failed LOE create (before any edge) records nothing and rolls back nothing', async () => {
    h.createPlaced.mockRejectedValueOnce(conflict(409));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: { applied: boolean; conflict: string | null } | undefined;
    await act(async () => {
      outcome = await result.current.createLoeSpan({
        startDriverId: 'start',
        finishDriverId: 'finish',
      });
    });

    expect(outcome).toEqual({ applied: false, conflict: 'That link would create a loop' });
    expect(h.createDependency).not.toHaveBeenCalled();
    expect(h.deleteActivity).not.toHaveBeenCalled(); // nothing to roll back
    expect(h.clearRedo).toHaveBeenCalledTimes(1);
    expect(h.record).not.toHaveBeenCalled();
  });
});
