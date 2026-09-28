import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * **Make milestone… in the workspace model** (ADR-0162 decision 4, spec D4, M4-T3).
 *
 * The harness is `use-plan-workspace-model.quick-wins.test.ts`'s, with the partial-PATCH mutation and
 * the recalculation's settle counter made controllable. What is asserted here is the wiring only:
 * the write is exactly `{ version, type }`, the undo inverse is exactly `{ type: 'TASK' }`, and the
 * announcement waits for the recalculated row — the order `use-focus-handoff.ts` states (focus,
 * then announce).
 */

const h = vi.hoisted(() => ({
  undoRedo: false,
  record: vi.fn(),
  setVisualMutateAsync: vi.fn(),
  patchFields: vi.fn(),
  notify: vi.fn(),
  announce: vi.fn(),
  settled: 0,
  onWriteRejected: vi.fn((): { kind: 'none' | 'lock' } => ({ kind: 'none' })),
}));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: false,
    NOTES_ENABLED: false,
    get UNDO_REDO_ENABLED() {
      return h.undoRedo;
    },
  };
});

vi.mock('@/features/undo-redo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanEditHistory: () => ({
    record: h.record,
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
    canUndo: false,
    canRedo: false,
  }),
}));

const query = <T>(data: T) => ({ data, isPending: false, isError: false, refetch: vi.fn() });

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => h.announce }));
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
    onWriteRejected: h.onWriteRejected,
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
  useCreateDependency: () => ({ mutateAsync: vi.fn() }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
  useUpdateDependency: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/features/schedule', () => ({
  useRecalculate: () => ({ mutateAsync: vi.fn() }),
  usePlanAutoRecalc: () => ({
    notify: h.notify,
    // The settle counter the announcement waits on (spec D4 step 4): a test moves it to stand in
    // for "the recalculation this conversion triggered has landed".
    settled: h.settled,
    pendingEdits: 0,
    hold: vi.fn(),
    release: vi.fn(),
  }),
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
  laneIndex: 2,
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
  visualStart: '2026-02-01',
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
  version: 7,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** The zero-duration task being converted, and the recalculated row that comes back. */
const ZERO: ActivitySummary = {
  ...ACTIVITY,
  id: 'z1',
  name: 'Pour slab',
  durationDays: 0,
  durationMinutes: 0,
  visualStart: null,
  resourceAssignmentCount: 0,
};

const h2 = vi.hoisted(() => ({ activities: [] as ActivitySummary[] }));
// **Partial**, not total — the `@/features/dependencies` lesson, one feature along. A total mock
// blanks every export the workspace host imports, not only the ones this suite meant to stub, so a
// host that starts importing one more symbol fails these at COLLECTION with "no export is defined
// on the mock". ADR-0095 M5-T4/T5 did exactly that twice (`useUpdateActivityParents`, then
// `ActivityCreateDialog`).
vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActivities: () => query(h2.activities),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivityFields: () => ({ mutateAsync: h.patchFields }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: h.setVisualMutateAsync }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useBatchPlacements: () => ({ mutateAsync: vi.fn(() => Promise.resolve([])) }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

// Imported AFTER the mocks.
import { makeMilestoneSentence, usePlanWorkspaceModel } from './use-plan-workspace-model';

import { ApiFetchError } from '@/lib/api/client';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.undoRedo = true;
  h.settled = 0;
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
  h.patchFields.mockResolvedValue({ ...ZERO, type: 'FINISH_MILESTONE', version: 8 });
  h2.activities = [ZERO];
});

describe('usePlanWorkspaceModel — Make milestone…', () => {
  it('opens on the activity and resolves it from the live query', () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(result.current.makeMilestoneActivity).toBeNull();
    expect(result.current.makeMilestoneOpen).toBe(false);
    act(() => result.current.onMakeMilestone(ZERO));
    expect(result.current.makeMilestoneActivity?.id).toBe('z1');
    expect(result.current.makeMilestoneOpen).toBe(true);
  });

  it('closing keeps the target, so the host closes the dialog rather than unmounting it (red: target cleared)', () => {
    // An open modal removed from the document returns focus to <body>; only `close()` restores it
    // (the M4 journey found Cancel doing exactly that). So the target must survive the close.
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.onMakeMilestone(ZERO));
    const opening = result.current.makeMilestoneOpening;
    act(() => result.current.closeMakeMilestone());
    expect(result.current.makeMilestoneOpen).toBe(false);
    expect(result.current.makeMilestoneActivity?.id).toBe('z1');
    // A reopen mints a new opening, so the host keys a fresh dialog and nothing carries over.
    act(() => result.current.onMakeMilestone(ZERO));
    expect(result.current.makeMilestoneOpen).toBe(true);
    expect(result.current.makeMilestoneOpening).toBe(opening + 1);
  });

  it('writes exactly { version, type }, closes the dialog and asks for a recalculation', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.onMakeMilestone(ZERO));
    await act(async () => {
      await result.current.confirmMakeMilestone('FINISH_MILESTONE');
    });
    // Nothing but the type: the server re-expresses the unsent dates (decision 3), and a date sent
    // WITH the type would be read in the new type's convention.
    expect(h.patchFields).toHaveBeenCalledExactlyOnceWith({
      activityId: 'z1',
      version: 7,
      patch: { type: 'FINISH_MILESTONE' },
    });
    expect(result.current.makeMilestoneOpen).toBe(false);
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it('records one undo step whose inverse sends exactly { type: TASK }', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.onMakeMilestone(ZERO));
    await act(async () => {
      await result.current.confirmMakeMilestone('FINISH_MILESTONE');
    });
    expect(h.record).toHaveBeenCalledOnce();
    const command = h.record.mock.calls[0]?.[0] as { undo: () => Promise<void> };
    h.patchFields.mockResolvedValueOnce({ ...ZERO, version: 9 });
    await command.undo();
    expect(h.patchFields).toHaveBeenLastCalledWith({
      activityId: 'z1',
      version: 8,
      patch: { type: 'TASK' },
    });
  });

  it('announces only after the recalculated row arrives, and reads its date from that row', async () => {
    const hook = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => hook.result.current.onMakeMilestone(ZERO));
    await act(async () => {
      await hook.result.current.confirmMakeMilestone('FINISH_MILESTONE');
    });
    // The dialog has closed (focus restored natively) and nothing has been said yet: the date a
    // finish milestone reads is the engine's, so the sentence waits for the recalculation.
    expect(hook.result.current.makeMilestoneOpen).toBe(false);
    expect(h.announce).not.toHaveBeenCalledWith(expect.stringContaining('is now'));

    h2.activities = [{ ...ZERO, type: 'FINISH_MILESTONE', version: 8, earlyFinish: '2026-01-09' }];
    h.settled = 1;
    hook.rerender();
    expect(h.announce).toHaveBeenCalledWith(
      'Pour slab is now a finish milestone, dated Fri 9 Jan. Its successors and float are unchanged.',
    );
  });

  it('keeps the dialog open and says why on a stale version, recording nothing', async () => {
    h.patchFields.mockRejectedValueOnce(
      new ApiFetchError(409, { message: 'stale', code: 'CONFLICT' }),
    );
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.onMakeMilestone(ZERO));
    await act(async () => {
      await expect(result.current.confirmMakeMilestone('START_MILESTONE')).rejects.toThrow(
        'This activity changed since you opened it, so nothing was changed. Close and try again.',
      );
    });
    expect(result.current.makeMilestoneOpen).toBe(true);
    expect(h.record).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('says so in the dialog when the pen is taken, recording nothing', async () => {
    h.patchFields.mockRejectedValueOnce(
      new ApiFetchError(423, { message: 'locked', code: 'LOCKED' }),
    );
    h.onWriteRejected.mockReturnValueOnce({ kind: 'lock' });
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.onMakeMilestone(ZERO));
    await act(async () => {
      await expect(result.current.confirmMakeMilestone('START_MILESTONE')).rejects.toThrow(
        'The edit lock was taken, so nothing was changed.',
      );
    });
    expect(result.current.makeMilestoneOpen).toBe(true);
    expect(h.record).not.toHaveBeenCalled();
  });
});

describe('makeMilestoneSentence', () => {
  it('names a start milestone by its start, and omits a date it does not have', () => {
    expect(
      makeMilestoneSentence('Handover', 'START_MILESTONE', {
        visualEffectiveStart: '2026-01-12',
        visualEffectiveFinish: '2026-01-12',
        earlyStart: '2026-01-05',
        earlyFinish: '2026-01-05',
      }),
    ).toBe(
      'Handover is now a start milestone, dated Mon 12 Jan. Its successors and float are unchanged.',
    );
    expect(makeMilestoneSentence('Handover', 'FINISH_MILESTONE', null)).toBe(
      'Handover is now a finish milestone. Its successors and float are unchanged.',
    );
  });
});
