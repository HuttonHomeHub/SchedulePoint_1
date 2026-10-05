import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * M1.3 seam coverage (ADR-0048): the workspace model records ONE undo command per structural
 * edit, and the edit's own behaviour (the mutation it issues) is unchanged by the recording. The command builders + history store have their own
 * unit suites; here we assert only the seam wiring, with a spy standing in for the history store.
 */

const h = vi.hoisted(() => ({
  record: vi.fn(),
  clear: vi.fn(),
  updateMutateAsync: vi.fn(),
  // **Captured and resolving a row** (M-F-T3). It was an anonymous `vi.fn()` returning `undefined`
  // while a reposition went through the definition seam; a day change now writes a placement, and
  // the command built from one reads `saved.version` eagerly — so an untracked stub both throws
  // inside the model and leaves these cases asserting a mutation nothing calls.
  setVisualStartMutateAsync: vi.fn(),
  relaneMutateAsync: vi.fn(),
  recalcMutateAsync: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: false,
    NOTES_ENABLED: false,
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
  drivingResourceCalendarId: null,
  resourceAssignmentCount: null,
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
  visualConflictReason: null,
  visualDriftDays: null,
  remainingFloat: null,
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
  useSetActivityVisualStart: () => ({ mutateAsync: h.setVisualStartMutateAsync }),
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

import { activityKeys } from '@/lib/query/hierarchy-keys';
import { aCrossPlanLink, anAssignment, aStep } from '@/test/fake-plan-server';

// The model now composes the M3 undo/redo wrapper (`usePlanUndoRedo`), which reads the query client to
// refetch server truth on a conflict — so the hook must render inside a QueryClientProvider (the real
// wrapper is unmocked; only the history store is swapped for the record spy above).
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.updateMutateAsync.mockResolvedValue({ ...ACTIVITY, version: 4 });
  h.setVisualStartMutateAsync.mockResolvedValue({ ...ACTIVITY, version: 4 });
  h.relaneMutateAsync.mockResolvedValue({ ...ACTIVITY, laneIndex: 2, version: 4 });
  h.recalcMutateAsync.mockResolvedValue(undefined);
});

describe('usePlanWorkspaceModel undo/redo recording seam', () => {
  it('a day reposition issues its placement AND records exactly one command', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', startDay: 4 });
    });

    // **The placement seam, not the definition one** (M-F-T3): a day reposition hand-places and
    // writes no constraint, so a full-definition PATCH is not merely unnecessary here — its
    // absence is what guarantees nothing else on the row was disturbed.
    expect(h.setVisualStartMutateAsync).toHaveBeenCalledTimes(1); // the edit itself still fired
    expect(h.updateMutateAsync).not.toHaveBeenCalled();
    expect(h.record).toHaveBeenCalledTimes(1); // exactly one command — not the recalc
    const command = h.record.mock.calls[0]![0];
    expect(command).toMatchObject({ label: expect.any(String) });
    expect(typeof command.undo).toBe('function');
    expect(typeof command.redo).toBe('function');
  });

  it('a pure lane move records exactly one command and issues no recalc', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', laneIndex: 2 });
    });

    expect(h.relaneMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.recalcMutateAsync).not.toHaveBeenCalled(); // a lane move never recalcs
  });

  it('a create records exactly one command', async () => {
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
  });

  it('a dependency link records exactly one command', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldLink({ predecessorId: 'a1', successorId: 'a2', type: 'FS' });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('an auto-arrange records exactly one command (the whole batch = one step)', async () => {
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
  it('a cascade delete records one command, exactly like a leaf', () => {
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
  it('an empty summary records one command', () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.recordActivityDelete(EMPTY_SUMMARY, 'batch-3'));
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.clear).not.toHaveBeenCalled();
  });

  /**
   * Dissolve is one undo step (undo-redo M6). It used to truncate — "the client has no inverse" —
   * until the response carried the batch the summary went in; a recorded command now restores that
   * batch and files the children back, and the rest of the session's history survives.
   */
  it('a dissolve records one step and does not clear the history', () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() =>
      result.current.recordActivityDissolve(SUMMARY, {
        promoted: [{ id: 'child-1', parentId: null, version: 2 }],
        deleteBatchId: 'batch-9',
      }),
    );
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]?.[0]).toMatchObject({ label: 'Dissolve “Phase 1”' });
    expect(h.clear).not.toHaveBeenCalled();
  });
});

/**
 * The records beside the bar (undo-redo M3): each surface reports what landed through a `record*`
 * seam, and the model turns it into ONE step — or none, when nothing changed. Only the seam wiring is
 * asserted here; the commands have their own matrix (`record-commands.test.ts`) and the server-side
 * behaviour is the journey's (`apps/web/e2e-undo/undo.spec.ts`).
 */
describe('usePlanWorkspaceModel records beside the bar', () => {
  const FILED: ActivitySummary = { ...ACTIVITY, parentId: 'sum-1', version: 4 };
  const ASSIGNED = anAssignment({ id: 'as1', activityId: 'a1', resourceId: 'r1' });

  /**
   * The model with the plan's activity list in the query cache — where the seams read
   * names from at the moment of a record (the hook that normally fills it is stubbed above).
   */
  function seams() {
    const client = new QueryClient();
    client.setQueryData(activityKeys.listByPlan('acme', 'p1'), [
      ACTIVITY,
      SUMMARY,
      CHILD,
      EMPTY_SUMMARY,
    ]);
    const seeded = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    return renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper: seeded }).result;
  }

  it('a dialog create records exactly one command', () => {
    const result = seams();
    act(() => result.current.recordActivityCreate(ACTIVITY));
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].label).toBe('Add “Excavate”');
  });

  it('a re-parenting batch of several rows is ONE step, named for where they went', () => {
    const result = seams();
    const other = { ...ACTIVITY, id: 'a9', name: 'Pour' };
    act(() =>
      result.current.recordReparent([ACTIVITY, other], [FILED, { ...other, parentId: 'sum-1' }]),
    );
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].label).toBe('Move 2 activities under “Phase 1”');
  });

  it('a surface that names the step keeps its name', () => {
    const result = seams();
    act(() => result.current.recordReparent([ACTIVITY], [FILED], 'Change members of “Phase 1”'));
    expect(h.record.mock.calls[0]![0].label).toBe('Change members of “Phase 1”');
  });

  it('a batch that moved nothing records nothing', () => {
    const result = seams();
    act(() => result.current.recordReparent([ACTIVITY], [{ ...ACTIVITY, version: 4 }]));
    expect(h.record).not.toHaveBeenCalled();
  });

  it('a steps save records one command, and a save that changed nothing records none', () => {
    const result = seams();
    const before = [aStep({ name: 'Form' })];
    act(() => result.current.recordStepsSaved(ACTIVITY, before, [aStep({ name: 'Form' })]));
    expect(h.record).not.toHaveBeenCalled();
    act(() =>
      result.current.recordStepsSaved(ACTIVITY, before, [
        aStep({ name: 'Form', percentComplete: 50 }),
      ]),
    );
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].label).toBe('Edit steps of “Excavate”');
  });

  it('an assignment add, edit and removal each record one command, naming the activity', () => {
    const result = seams();
    act(() =>
      result.current.recordAssignmentEdit({
        kind: 'added',
        assignment: ASSIGNED,
        resourceName: 'Digger',
      }),
    );
    act(() =>
      result.current.recordAssignmentEdit({
        kind: 'edited',
        before: ASSIGNED,
        after: { ...ASSIGNED, budgetedUnits: 20, version: 2 },
        resourceName: 'Digger',
      }),
    );
    act(() =>
      result.current.recordAssignmentEdit({
        kind: 'removed',
        assignment: ASSIGNED,
        resourceName: 'Digger',
      }),
    );
    expect(h.record.mock.calls.map(([command]) => command.label)).toEqual([
      'Assign “Digger” to “Excavate”',
      'Edit “Digger” on “Excavate”',
      'Unassign “Digger” on “Excavate”',
    ]);
  });

  it('an assignment edit that changed no field a step would write records nothing', () => {
    const result = seams();
    act(() =>
      result.current.recordAssignmentEdit({
        kind: 'edited',
        before: ASSIGNED,
        after: { ...ASSIGNED, version: 2 },
        resourceName: 'Digger',
      }),
    );
    expect(h.record).not.toHaveBeenCalled();
  });

  it('a cross-plan link add and remove each record one command', () => {
    const result = seams();
    act(() => result.current.recordCrossPlanLinkAdd(aCrossPlanLink()));
    act(() => result.current.recordCrossPlanLinkRemove(aCrossPlanLink()));
    expect(h.record.mock.calls.map(([command]) => command.label)).toEqual([
      'Add cross-plan link “Other plan work” → “Excavate”',
      'Remove cross-plan link “Other plan work” → “Excavate”',
    ]);
  });
});
