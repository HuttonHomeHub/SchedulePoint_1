import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
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
  useCalendar: () => query(undefined),
}));
vi.mock('@/features/baselines', () => ({ useBaselineVariance: () => query(undefined) }));
vi.mock('@/features/notes', () => ({ useActivityNoteCounts: () => query(undefined) }));
vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: vi.fn().mockResolvedValue(DEPENDENCY) }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
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

// A WBS summary (`sum-1`) with a child (`child-1`) — the cascade-delete case (ADR-0038 / ADR-0048 M2.3):
// deleting the summary truncates history rather than offering a broken partial undo.
const SUMMARY: ActivitySummary = { ...ACTIVITY, id: 'sum-1', name: 'Phase 1', type: 'WBS_SUMMARY' };
const CHILD: ActivitySummary = { ...ACTIVITY, id: 'child-1', name: 'Child', parentId: 'sum-1' };

vi.mock('@/features/activities', () => ({
  useActivities: () => query([ACTIVITY, SUMMARY, CHILD]),
  useCreateActivity: () => ({ mutateAsync: vi.fn().mockResolvedValue(ACTIVITY) }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn().mockResolvedValue(ACTIVITY) }),
  useUpdateActivity: () => ({ mutateAsync: h.updateMutateAsync }),
  useRepositionLane: () => ({ mutateAsync: h.relaneMutateAsync }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn().mockResolvedValue([ACTIVITY]) }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

const DEPENDENCY = {
  id: 'dep-1',
  planId: 'p1',
  type: 'FS',
  lagDays: 0,
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
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));

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
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', startDay: 4 });
    });

    expect(h.updateMutateAsync).toHaveBeenCalledTimes(1); // behaviour unchanged
    expect(h.record).not.toHaveBeenCalled();
  });

  it('flag ON: a pure lane move records exactly one command and issues no recalc', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', laneIndex: 2 });
    });

    expect(h.relaneMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.recalcMutateAsync).not.toHaveBeenCalled(); // a lane move never recalcs
  });

  it('flag OFF: a pure lane move records nothing', async () => {
    h.undoRedo = false;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', laneIndex: 2 });
    });

    expect(h.relaneMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('flag ON: a create records exactly one command; flag OFF records nothing', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));
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
    const off = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));
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
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));
    await act(async () => {
      await result.current.onTsldLink({ predecessorId: 'a1', successorId: 'a2', type: 'FS' });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('flag ON: an auto-arrange records exactly one command (the whole batch = one step)', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));
    await act(async () => {
      await result.current.onTsldAutoArrange([{ id: 'a1', laneIndex: 3 }]);
    });
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('flag ON: a leaf delete records one command; a cascade (summary+subtree) truncates history', () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));

    // A leaf (TASK, no children) is reversible — one command, no truncation.
    act(() => result.current.recordActivityDelete(ACTIVITY));
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.clear).not.toHaveBeenCalled();

    h.record.mockClear();
    // A WBS summary WITH a subtree is not cleanly reversible in M2 — clear the stack, record nothing.
    act(() => result.current.recordActivityDelete(SUMMARY));
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('flag OFF: neither a leaf delete nor a cascade delete touches the history', () => {
    h.undoRedo = false;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'));
    act(() => result.current.recordActivityDelete(ACTIVITY));
    act(() => result.current.recordActivityDelete(SUMMARY));
    expect(h.record).not.toHaveBeenCalled();
    expect(h.clear).not.toHaveBeenCalled();
  });
});
