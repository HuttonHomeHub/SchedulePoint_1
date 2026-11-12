import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import/order -- above the vi.mock() block because the fixtures below use it before the mocked imports load
import { anActivity } from '@/test/activity-fixture';

/**
 * Toolbar quick-wins model seams (spec `docs/specs/toolbar-quick-wins/`). Covers the F0 selection lift +
 * F3 progress target + the F5 `clearVisualPlacement` command that the flag-gated toolbar items read.
 * The command builders + history store have their own suites; here we assert the model wiring, with a
 * spy standing in for the history store and controllable mutation/notify spies.
 */

const h = vi.hoisted(() => ({
  record: vi.fn(),
  setVisualMutateAsync: vi.fn(),
  batchMutateAsync: vi.fn(),
  notify: vi.fn(),
  announce: vi.fn(),
  onWriteRejected: vi.fn((): { kind: 'none' | 'lock' } => ({ kind: 'none' })),
}));

vi.mock('@/features/undo-redo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanEditHistory: () => ({
    record: h.record,
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
    canUndo: false,
    canRedo: false,
    // The follow-logic offer reads the step on top when a settle is decided; nothing is on this stack.
    peekUndo: () => undefined,
    isTop: () => false,
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
  // The plan/activity pickers read the PROJECT-usable calendar list (ADR-0053 §1).
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
  usePlanAutoRecalc: () => ({ notify: h.notify }),
}));

const ACTIVITY: ActivitySummary = anActivity({
  code: null,
  laneIndex: 2,
  earlyStart: null,
  earlyFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  visualStart: '2026-02-01',
  accrualType: 'UNIFORM',
  version: 7,
  // A commitment the clear must NOT touch: the batch route needs it sent back, and nulling it
  // would silently delete it (ADR-0148's context defect; spec §2, "Validation rules").
  constraintType: 'SNET',
  constraintDate: '2026-01-20',
});

// A second, present activity so the delete-reconcile case can be simulated by swapping the query data.
const OTHER: ActivitySummary = { ...ACTIVITY, id: 'a2', name: 'Pour', visualStart: null };

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
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: h.setVisualMutateAsync }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useBatchPlacements: () => ({ mutateAsync: h.batchMutateAsync }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

// Imported AFTER the mocks.
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

import { ApiFetchError } from '@/lib/api/client';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
  h.setVisualMutateAsync.mockResolvedValue({ ...ACTIVITY, visualStart: null, version: 8 });
  h.batchMutateAsync.mockResolvedValue([{ ...ACTIVITY, visualStart: null, version: 8 }]);
  h2.activities = [ACTIVITY, OTHER];
});

describe('usePlanWorkspaceModel — toolbar quick-wins seams', () => {
  it('F0: onSelectionChange sets selectedActivityId and resolves the row (with live version)', () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(result.current.selectedActivityId).toBeNull();
    expect(result.current.selectedActivity).toBeUndefined();

    act(() => result.current.onSelectionChange('a1'));
    expect(result.current.selectedActivityId).toBe('a1');
    expect(result.current.selectedActivity?.id).toBe('a1');
    expect(result.current.selectedActivity?.version).toBe(7);
  });

  it('F0: selectedActivity clears (undefined) when the selected row is deleted', () => {
    h2.activities = [ACTIVITY, OTHER];
    const { result, rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.onSelectionChange('a1'));
    expect(result.current.selectedActivity?.id).toBe('a1');

    // The row vanishes from the live query (deleted elsewhere) — the derived row resolves to undefined
    // even though the id is still held, so the selection-aware toolbar items re-disable.
    h2.activities = [OTHER];
    rerender();
    expect(result.current.selectedActivityId).toBe('a1');
    expect(result.current.selectedActivity).toBeUndefined();
  });

  it('F3: onProgressActivity opens the editor on the Progress tab', () => {
    // It used to set a `progressActivityId` that drove a workspace-hosted dialog, and this case
    // asserted that id resolving to a row. That dialog was deleted when
    // `VITE_ACTIVITY_EDITOR_TABS` retired (ADR-0089), so the id resolved to nothing anybody read.
    // What the entry point has to do now is name the tab, which is what this asserts.
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(result.current.editorIntent).toBeNull();

    act(() => result.current.onProgressActivity(ACTIVITY));
    expect(result.current.editorIntent).toMatchObject({ activityId: 'a1', tab: 'progress' });
  });

  it('F5: clearVisualPlacement is a one-row batch: visualStart cleared, the constraint sent back as stored, the lane left alone', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.clearVisualPlacement('a1', 7);
    });
    // **Verified red** by building the row with `constraintType: null`: the constraint is then
    // deleted by a request the planner meant as "follow the logic" (spec §2).
    expect(h.batchMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.batchMutateAsync).toHaveBeenCalledWith({
      placements: [
        {
          id: 'a1',
          version: 7,
          constraintType: 'SNET',
          constraintDate: '2026-01-20',
          visualStart: null,
          laneIndex: null,
        },
      ],
    });
    expect(h.setVisualMutateAsync).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('F5: the clear is the CALLER’s version, so a stale selection bar refuses rather than overwrites', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.clearVisualPlacement('a1', 6);
    });
    expect(h.batchMutateAsync.mock.calls[0]?.[0].placements[0].version).toBe(6);
  });

  it('F5: records ONE undo step, never the recalc', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.clearVisualPlacement('a1', 7);
    });
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]?.[0]).toMatchObject({ label: 'Follow logic', subjects: ['a1'] });
  });

  it('F5: a summary keeps the single-activity PATCH, because the batch route refuses one', async () => {
    h2.activities = [{ ...ACTIVITY, type: 'WBS_SUMMARY' }, OTHER];
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.clearVisualPlacement('a1', 7);
    });
    expect(h.batchMutateAsync).not.toHaveBeenCalled();
    expect(h.setVisualMutateAsync).toHaveBeenCalledWith({
      activityId: 'a1',
      visualStart: null,
      version: 7,
    });
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('F5: a stale-version 409 is non-destructive — nothing applied, nothing recorded, no recalc', async () => {
    h.batchMutateAsync.mockRejectedValueOnce(
      new ApiFetchError(409, { message: 'stale', code: 'CONFLICT' }),
    );
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.clearVisualPlacement('a1', 7);
    });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('A2: announces success on a clear (named, "dates will update")', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.clearVisualPlacement('a1', 7);
    });
    expect(h.announce).toHaveBeenCalledWith('“Excavate” now follows its logic; dates will update.');
  });

  it('A2: a 409 announces the conflict non-destructively (never silent), no success announce', async () => {
    h.batchMutateAsync.mockRejectedValueOnce(
      new ApiFetchError(409, { message: 'stale', code: 'CONFLICT' }),
    );
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.clearVisualPlacement('a1', 7);
    });
    expect(h.announce).toHaveBeenCalledTimes(1);
    expect(h.announce).toHaveBeenCalledWith(
      'Couldn’t follow logic: this plan changed since you opened it. Nothing was changed.',
    );
  });

  it('T4: a 423 pen-loss is non-destructive — nothing recorded, no recalc, no announce contradiction', async () => {
    h.onWriteRejected.mockReturnValueOnce({ kind: 'lock' as const });
    h.batchMutateAsync.mockRejectedValueOnce(
      new ApiFetchError(423, { message: 'locked', code: 'LOCKED' }),
    );
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.clearVisualPlacement('a1', 7);
    });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
    // The shared pen banner owns the 423 message; the clear must NOT announce a success/conflict.
    expect(h.announce).not.toHaveBeenCalled();
  });

  it('T5: a non-409/non-lock error rethrows (never silently swallowed)', async () => {
    h.onWriteRejected.mockReturnValueOnce({ kind: 'none' as const });
    h.batchMutateAsync.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await expect(
      act(async () => {
        await result.current.clearVisualPlacement('a1', 7);
      }),
    ).rejects.toThrow('network down');
    expect(h.notify).not.toHaveBeenCalled();
    // No success announce on a failed clear.
    expect(h.announce).not.toHaveBeenCalledWith(
      '“Excavate” now follows its logic; dates will update.',
    );
  });
});

/**
 * **The conflict remedies' composition root** (ADR-0094 M4-T3).
 *
 * `onOpenActivityEditorAt` is the seam between a pure remedy map in `features/tsld` and an editor
 * intent in `features/activities` — the boundary that exists because the first must not import the
 * second (§5/§12). It is exactly the kind of wiring this register keeps recording breaking in
 * silence: ADR-0080's `bulk` was wired into one host and not the layout its flag selected, and every
 * unit suite passed. The ux gate asked for this case for that reason.
 */
describe('usePlanWorkspaceModel — the conflict remedy routes', () => {
  it('sends a constraint conflict to the Scheduling tab, not the General one', () => {
    // The distinction the route exists for: `openActivityEditor(a, 'edit')` lands on General, which
    // is the editor opening rather than the route working.
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.onOpenActivityEditorAt(ACTIVITY, 'constraint'));
    expect(result.current.editorIntent).toEqual({ activityId: 'a1', tab: 'scheduling' });
  });

  it('sends a levelling conflict through the EXISTING resources opener', () => {
    // Composed from `onResourcesActivity` rather than setting the intent itself, because that opener
    // already carries the flag-off fallback to the standalone dialog. A third copy of that branch is
    // the drift this epic exists to remove.
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    act(() => result.current.onOpenActivityEditorAt(ACTIVITY, 'resources'));
    expect(result.current.editorIntent).toEqual({ activityId: 'a1', tab: 'resources' });
  });
});
