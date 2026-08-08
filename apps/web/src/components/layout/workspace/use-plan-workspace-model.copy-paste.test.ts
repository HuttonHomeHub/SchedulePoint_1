import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiFetchError } from '@/lib/api/client';

/**
 * **The copy/paste composites** (`docs/specs/activity-copy-paste/` M1-T2 / M2-T3 / M3).
 *
 * `duplicateActivities`, `copySelection` and `pasteClipboard` are the highest-risk new code in the
 * epic — a recalculation hold that must be released on every path including a throw, a rollback that
 * must not leave orphan clones, and three failure classes (423 / 409-422 / rethrow) a planner has to
 * be able to tell apart. The M5 test review found them with **no hook-level coverage at all**, on a
 * file where every sibling composite has some, and against a plan (M1-T2) that had asked for exactly
 * these assertions by name.
 *
 * The harness is the `createLoeSpan` suite's, adapted — the same fixtures and the same mocking
 * posture, so the two composites cannot drift about what a plan looks like.
 */

const h = vi.hoisted(() => ({
  record: vi.fn(),
  clearRedo: vi.fn(),
  createPlaced: vi.fn(),
  createDependency: vi.fn(),
  deleteActivity: vi.fn(),
  createClone: vi.fn(),
  bulkDelete: vi.fn(),
  restoreBatch: vi.fn(),
  readSource: vi.fn(),
  carry: vi.fn(),
  announce: vi.fn(),
  hold: vi.fn(),
  release: vi.fn(),
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
    ACTIVITY_COPY_PASTE_ENABLED: true,
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
  // The plan/activity pickers read the PROJECT-usable list behind VITE_LIBRARY_SCOPING
  // (ADR-0053 §1); flag-off it resolves to the same org library these tests already stub.
  usePlanScopedCalendars: () => query([]),
  useCalendar: () => query(undefined),
}));
vi.mock('@/features/baselines', () => ({ useBaselineVariance: () => query(undefined) }));
vi.mock('@/features/notes', () => ({ useActivityNoteCounts: () => query(undefined) }));
vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([]),
  useCreateDependency: () => ({ mutateAsync: h.createDependency }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
  useUpdateDependency: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/features/schedule', () => ({
  useRecalculate: () => ({ mutateAsync: vi.fn() }),
  // `hold`/`release` are spied so the "released on EVERY path" assertion is about the real calls
  // rather than about a leak nobody can see — a leaked hold stalls every later recalculation for
  // the session, with no error and no surface.
  usePlanAutoRecalc: () => ({ notify: h.notify, hold: h.hold, release: h.release }),
}));
vi.mock('@/features/activity-copy/api/use-clone-activities', () => ({
  useCreateClonedActivity: () => ({ mutateAsync: h.createClone }),
}));
vi.mock('@/features/activity-copy/api/use-clone-carriage', () => ({
  useCloneCarriage: () => ({ readSource: h.readSource, carry: h.carry }),
}));

const ACTIVITY: ActivitySummary = {
  id: 'start',
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
const FINISH: ActivitySummary = { ...ACTIVITY, id: 'finish', name: 'Pour', laneIndex: 1 };
const DEPENDENCY = {
  id: 'dep-1',
  planId: 'p1',
  type: 'SS',
  lagDays: 0,
  lagMinutes: 0,
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
  useBulkDeleteActivities: () => ({ mutateAsync: h.bulkDelete }),
  useRestoreDeleteBatch: () => ({ mutateAsync: h.restoreBatch }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

// Imported AFTER the mocks are declared (so the model sees the mocked hooks/env).
// eslint-disable-next-line import/order -- must load after the vi.mock() calls above
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

/** A created clone, as the API returns it. `version: 1` — a new row starts there. */
const clone = (id: string): ActivitySummary => ({
  ...ACTIVITY,
  id,
  name: `${id} (copy)`,
  version: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.writeRejected = { kind: 'none' };
  h.createClone.mockImplementation(() => Promise.resolve(clone('clone-1')));
  h.readSource.mockResolvedValue({ assignments: [], steps: [] });
  h.carry.mockResolvedValue({ skipped: [] });
  h.bulkDelete.mockResolvedValue({ deleteBatchId: 'batch-1' });
  h.createDependency.mockResolvedValue(DEPENDENCY);
});

describe('duplicateActivities — the happy path', () => {
  it('creates the clone, records ONE command, notifies the recalc, and releases the hold', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.duplicateActivities>> | undefined;
    await act(async () => {
      outcome = await result.current.duplicateActivities([ACTIVITY]);
    });

    expect(outcome?.applied).toBe(true);
    expect(h.createClone).toHaveBeenCalledTimes(1);
    // ONE reversible step for the whole gesture, not one per created row.
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalled();
    expect(h.hold).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
    // Nothing was rolled back, and the redo branch is untouched on success.
    expect(h.bulkDelete).not.toHaveBeenCalled();
    expect(h.clearRedo).not.toHaveBeenCalled();
  });

  it('reads every source BEFORE the first create, so a cap refusal costs no rollback', async () => {
    // The ordering the assignment cap depends on (M5, backend-performance finding). Counting as we
    // went would mean discovering the cap half way through a band and rolling the whole copy back.
    const order: string[] = [];
    h.readSource.mockImplementation(() => {
      order.push('read');
      return Promise.resolve({ assignments: [], steps: [] });
    });
    h.createClone.mockImplementation(() => {
      order.push('create');
      return Promise.resolve(clone('clone-1'));
    });
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.duplicateActivities([ACTIVITY, FINISH]);
    });
    expect(order).toEqual(['read', 'read', 'create', 'create']);
  });

  it('refuses over the assignment cap without writing anything at all', async () => {
    h.readSource.mockResolvedValue({
      assignments: Array.from({ length: 95 }, (_, i) => ({ resourceId: `r${String(i)}` })),
      steps: [],
    });
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.duplicateActivities>> | undefined;
    await act(async () => {
      outcome = await result.current.duplicateActivities([ACTIVITY]);
    });

    expect(outcome?.refusal).toMatchObject({ kind: 'too-many-assignments', assignments: 95 });
    expect(h.createClone).not.toHaveBeenCalled();
    // Released even on the refusal return, which is inside the try.
    expect(h.release).toHaveBeenCalledTimes(1);
  });
});

describe('duplicateActivities — the failure classes', () => {
  it('rolls the whole copy back when a later create throws, and clears the redo branch', async () => {
    h.createClone
      .mockImplementationOnce(() => Promise.resolve(clone('clone-1')))
      .mockImplementationOnce(() =>
        Promise.reject(new ApiFetchError(409, { code: 'CONFLICT', message: 'clash' })),
      );
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.duplicateActivities>> | undefined;
    await act(async () => {
      outcome = await result.current.duplicateActivities([ACTIVITY, FINISH]);
    });

    // The already-created clone is deleted — an orphan half-copy is the failure the rollback exists
    // to prevent, and it looks entirely correct on screen.
    expect(h.bulkDelete).toHaveBeenCalledExactlyOnceWith({
      activities: [{ id: 'clone-1', version: 1 }],
    });
    expect(outcome?.conflict).toBe('clash');
    expect(h.clearRedo).toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('reports a 423 as neither a refusal nor a conflict — the pen layer owns that message', async () => {
    // Three distinguishable outcomes, because a planner needs to know which happened. A 423 is
    // "someone else has the pen", which the pen layer already surfaces; reporting it here too would
    // say it twice, in different words.
    h.writeRejected = { kind: 'lock' };
    h.createClone.mockRejectedValue(new ApiFetchError(423, { code: 'LOCKED', message: 'no pen' }));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.duplicateActivities>> | undefined;
    await act(async () => {
      outcome = await result.current.duplicateActivities([ACTIVITY]);
    });

    expect(outcome).toMatchObject({ applied: false, refusal: null, conflict: null });
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('releases the hold even when the error is rethrown', async () => {
    // A 500 is neither a refusal nor a conflict and must not be swallowed — but the hold still has
    // to come back, or every later recalculation in the session stalls with nothing saying why.
    h.createClone.mockRejectedValue(new Error('network died'));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    await act(async () => {
      await expect(result.current.duplicateActivities([ACTIVITY])).rejects.toThrow('network died');
    });
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('does not let a failed rollback replace the original cause', async () => {
    h.createClone
      .mockImplementationOnce(() => Promise.resolve(clone('clone-1')))
      .mockImplementationOnce(() =>
        Promise.reject(new ApiFetchError(422, { code: 'X', message: 'the real cause' })),
      );
    h.bulkDelete.mockRejectedValue(new Error('rollback also failed'));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome: Awaited<ReturnType<typeof result.current.duplicateActivities>> | undefined;
    await act(async () => {
      outcome = await result.current.duplicateActivities([ACTIVITY, FINISH]);
    });
    expect(outcome?.conflict).toBe('the real cause');
  });
});

describe('copySelection and pasteClipboard', () => {
  it('says so rather than silently doing nothing when nothing is selected', () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => {
      result.current.copySelection();
    });
    expect(h.announce).toHaveBeenCalledWith('Select an activity to copy.');
  });

  it('distinguishes an empty clipboard from a stale one', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.pasteClipboard();
    });
    // Not "nothing to paste" for both: an untouched clipboard and a clipboard whose activities were
    // deleted are different facts, and collapsing them is the ADR-0073 C1 failure.
    expect(h.announce).toHaveBeenCalledWith('Nothing has been copied yet.');
    expect(h.createClone).not.toHaveBeenCalled();
  });

  it('copies the canvas selection and pastes it', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => {
      result.current.onPluralSelectionChange(['start']);
    });
    act(() => {
      result.current.copySelection();
    });
    expect(h.announce).toHaveBeenCalledWith('1 activity copied.');

    await act(async () => {
      await result.current.pasteClipboard();
    });
    expect(h.createClone).toHaveBeenCalledTimes(1);
  });

  it('refuses a clipboard from a different plan rather than translating it', async () => {
    // A cross-plan paste would need calendars, resources and a parent tree resolved into another
    // org-scoped world; guessing produces a copy that schedules differently with nothing saying why.
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => {
      result.current.onPluralSelectionChange(['start']);
      result.current.copySelection();
    });
    const { result: other } = renderHook(() => usePlanWorkspaceModel('acme', 'p2'), { wrapper });
    await act(async () => {
      await other.current.pasteClipboard();
    });
    // The second plan has its own clipboard (cleared on plan switch), so it reports empty rather
    // than reaching for the first plan's ids — which is the same refusal by a stronger route.
    expect(h.announce).toHaveBeenCalledWith('Nothing has been copied yet.');
  });

  it('reports activities that no longer exist rather than quietly pasting fewer', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => {
      // 'gone' is not in the mocked activity list, so it resolves to a missing id.
      result.current.onPluralSelectionChange(['start', 'gone']);
      result.current.copySelection();
    });
    await act(async () => {
      await result.current.pasteClipboard();
    });
    const said = h.announce.mock.calls.map((c) => String(c[0]));
    expect(said.some((s) => /no longer exist/.test(s))).toBe(true);
  });
});
