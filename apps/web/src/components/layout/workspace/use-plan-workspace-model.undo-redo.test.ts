import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M1.3 seam coverage (ADR-0048, dark): the workspace model records ONE undo command per structural
 * edit when `VITE_UNDO_REDO` is on, and NOTHING when it is off — and the edit's own behaviour (the
 * mutation it issues) is unchanged either way. The command builders + history store have their own
 * unit suites; here we assert only the seam wiring, with a spy standing in for the history store.
 */

const h = vi.hoisted(() => ({
  undoRedo: false,
  record: vi.fn(),
  clear: vi.fn(),
  updateMutateAsync: vi.fn(),
  relaneMutateAsync: vi.fn(),
  recalcMutateAsync: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: false,
    SCHEDULING_MODES_ENABLED: false,
    NOTES_ENABLED: false,
    get UNDO_REDO_ENABLED() {
      return h.undoRedo;
    },
  };
});

// Keep the real command builders (they're pure); swap only the history store for a record spy.
vi.mock('@/features/undo-redo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanEditHistory: () => ({
    record: h.record,
    undo: vi.fn(),
    redo: vi.fn(),
    clear: h.clear,
    canUndo: false,
    canRedo: false,
  }),
}));

const query = <T>(data: T) => ({ data, isPending: false, isError: false, refetch: vi.fn() });

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
    onWriteRejected: () => ({ kind: 'none' }),
  }),
}));
vi.mock('@/features/plans', () => ({
  usePlan: () => query({ id: 'p1', projectId: 'proj1', plannedStart: '2026-01-01' }),
}));
vi.mock('@/features/projects', () => ({ useProject: () => query({ clientId: 'c1' }) }));
vi.mock('@/features/clients', () => ({ useClient: () => query({ id: 'c1' }) }));
vi.mock('@/features/calendars', () => ({
  useCalendars: () => query([]),
  // The plan/activity pickers read the PROJECT-usable list behind VITE_LIBRARY_SCOPING
  // (ADR-0053 §1); flag-off it resolves to the same org library these tests already stub.
  usePlanScopedCalendars: () => query([]),
  useCalendar: () => query(undefined),
}));
vi.mock('@/features/baselines', () => ({ useBaselineVariance: () => query(undefined) }));
vi.mock('@/features/notes', () => ({ useActivityNoteCounts: () => query(undefined) }));
vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: vi.fn().mockResolvedValue(DEPENDENCY) }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
  useUpdateDependency: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/features/schedule', () => ({
  useRecalculate: () => ({ mutateAsync: h.recalcMutateAsync }),
  usePlanAutoRecalc: () => ({ notify: h.notify }),
}));

const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'p1',
  code: null,
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 5,
  durationMinutes: 2400,
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
  remainingDurationMinutes: null,
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

// A WBS summary (`sum-1`) with a child (`child-1`) — the cascade-delete case (ADR-0038). Deleting
// the summary used to truncate history rather than offer a broken partial undo; since
// `docs/TECH_DEBT.md` #230 it records one command, because the inverse is the id-stable batch
// restore and not a re-create.
const SUMMARY: ActivitySummary = { ...ACTIVITY, id: 'sum-1', name: 'Phase 1', type: 'WBS_SUMMARY' };
const CHILD: ActivitySummary = { ...ACTIVITY, id: 'child-1', name: 'Child', parentId: 'sum-1' };
// A summary with nothing under it — a shape the old predicate treated differently from `SUMMARY`
// and the new one does not, which is exactly why it needs its own case.
const EMPTY_SUMMARY: ActivitySummary = {
  ...ACTIVITY,
  id: 'sum-2',
  name: 'Phase 2',
  type: 'WBS_SUMMARY',
};

// **Partial**, not total — the `@/features/dependencies` lesson, one feature along. A total mock
// blanks every export the workspace host imports, not only the ones this suite meant to stub, so a
// host that starts importing one more symbol fails these at COLLECTION with "no export is defined
// on the mock". ADR-0095 M5-T4/T5 did exactly that twice (`useUpdateActivityParents`, then
// `ActivityCreateDialog`).
vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActivities: () => query([ACTIVITY, SUMMARY, CHILD, EMPTY_SUMMARY]),
  useCreateActivity: () => ({ mutateAsync: vi.fn().mockResolvedValue(ACTIVITY) }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn().mockResolvedValue(ACTIVITY) }),
  useUpdateActivity: () => ({ mutateAsync: h.updateMutateAsync }),
  useRepositionLane: () => ({ mutateAsync: h.relaneMutateAsync }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn().mockResolvedValue([ACTIVITY]) }),
  useBatchPlacements: () => ({ mutateAsync: vi.fn(() => Promise.resolve([])) }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

const DEPENDENCY = {
  id: 'dep-1',
  planId: 'p1',
  type: 'FS',
  lagDays: 0,
  lagMinutes: 0,
  lagCalendar: 'PROJECT_DEFAULT',
  predecessor: { id: 'a1', code: null, name: 'Excavate' },
  successor: { id: 'a2', code: null, name: 'Pour' },
  isDriving: false,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as const;

// Imported AFTER the mocks are declared.
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

// The model now composes the M3 undo/redo wrapper (`usePlanUndoRedo`), which reads the query client to
// refetch server truth on a conflict — so the hook must render inside a QueryClientProvider (the real
// wrapper is unmocked; only the history store is swapped for the record spy above).
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.undoRedo = false;
  h.updateMutateAsync.mockResolvedValue({ ...ACTIVITY, version: 4 });
  h.relaneMutateAsync.mockResolvedValue({ ...ACTIVITY, laneIndex: 2, version: 4 });
  h.recalcMutateAsync.mockResolvedValue(undefined);
});

describe('usePlanWorkspaceModel undo/redo recording seam', () => {
  it('flag ON: a day reposition issues its update AND records exactly one command', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', startDay: 4 });
    });

    expect(h.updateMutateAsync).toHaveBeenCalledTimes(1); // the edit itself still fired
    expect(h.record).toHaveBeenCalledTimes(1); // exactly one command — not the recalc
    const command = h.record.mock.calls[0]![0];
    expect(command).toMatchObject({ label: expect.any(String) });
    expect(typeof command.undo).toBe('function');
    expect(typeof command.redo).toBe('function');
  });

  it('flag OFF: the same reposition issues its update but records nothing', async () => {
    h.undoRedo = false;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', startDay: 4 });
    });

    expect(h.updateMutateAsync).toHaveBeenCalledTimes(1); // behaviour unchanged
    expect(h.record).not.toHaveBeenCalled();
  });

  it('flag ON: a pure lane move records exactly one command and issues no recalc', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', laneIndex: 2 });
    });

    expect(h.relaneMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.recalcMutateAsync).not.toHaveBeenCalled(); // a lane move never recalcs
  });

  it('flag OFF: a pure lane move records nothing', async () => {
    h.undoRedo = false;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', laneIndex: 2 });
    });

    expect(h.relaneMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('flag ON: a create records exactly one command; flag OFF records nothing', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldCreate({
        name: 'Dig',
        type: 'TASK',
        startDay: 0,
        endDay: 2,
        laneIndex: 1,
      });
    });
    expect(h.record).toHaveBeenCalledTimes(1);

    h.undoRedo = false;
    h.record.mockClear();
    const off = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await off.result.current.onTsldCreate({
        name: 'Dig',
        type: 'TASK',
        startDay: 0,
        endDay: 2,
        laneIndex: 1,
      });
    });
    expect(h.record).not.toHaveBeenCalled();
  });

  it('flag ON: a dependency link records exactly one command', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldLink({ predecessorId: 'a1', successorId: 'a2', type: 'FS' });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('flag ON: an auto-arrange records exactly one command (the whole batch = one step)', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldAutoArrange([{ id: 'a1', laneIndex: 3 }]);
    });
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  /**
   * **A cascade delete is one undo step like any other** (`docs/TECH_DEBT.md` #230, ADR-0048's M2
   * boundary lifted by its own M4). It used to truncate, on the stated grounds that an undo could
   * only re-create the summary and "a partial re-create would be a broken undo". That reason
   * lapsed when the leaf inverse moved to `POST …/activities/restore-batch/:batchId`: a cascade
   * stamps ONE `deleteBatchId` across the whole subtree, and restoring that batch brings the
   * phase, its work, its nesting and its internal links back with their original ids.
   *
   * This asserts the capability, not the absence of a branch — which is why it counts `clear` as
   * well as `record`. What it CANNOT see is the server: the mutation is mocked, so the pen, the
   * optimistic version and the parent-active guard are all invisible here. `apps/web/e2e-undo/`
   * is where those are proven.
   */
  it('flag ON: a cascade delete records one command, exactly like a leaf', () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    // A leaf (TASK, no children) is reversible — one command, no truncation.
    act(() => result.current.recordActivityDelete(ACTIVITY, 'batch-1'));
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.clear).not.toHaveBeenCalled();

    h.record.mockClear();
    // …and so is a WBS summary WITH a subtree. This is the capability.
    act(() => result.current.recordActivityDelete(SUMMARY, 'batch-2'));
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.clear).not.toHaveBeenCalled();
  });

  /**
   * A summary with NOTHING under it, recorded the same way — a guard against a "fix" that keeps
   * branching on `type` and only stops looking at the subtree. Before #230 this case already
   * recorded, so it is the one member of this group that was green throughout.
   */
  it('flag ON: an empty summary records one command', () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.recordActivityDelete(EMPTY_SUMMARY, 'batch-3'));
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.clear).not.toHaveBeenCalled();
  });

  it('flag OFF: neither a leaf delete nor a cascade delete touches the history', () => {
    h.undoRedo = false;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.recordActivityDelete(ACTIVITY, 'batch-1'));
    act(() => result.current.recordActivityDelete(SUMMARY, 'batch-2'));
    expect(h.record).not.toHaveBeenCalled();
    expect(h.clear).not.toHaveBeenCalled();
  });

  /**
   * Dissolve (WBS improvements M2) takes the cascade-delete branch's rule for the same reason: the
   * client cannot compose its inverse from the existing mutations, so a recorded command would
   * rebuild a *different* summary under a new id and strand the original in Recently deleted. It
   * truncates, and it never records — an "undo" that quietly does something else is worse than
   * none.
   */
  it('flag ON: a dissolve truncates the history and records nothing', () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.recordDissolveBoundary());
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('flag OFF: a dissolve does not touch the history', () => {
    h.undoRedo = false;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.recordDissolveBoundary());
    expect(h.clear).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });
});
