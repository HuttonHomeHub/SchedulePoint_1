import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression for the WBS reparent auto-recalc gap: `structureSignature` (the fingerprint that
 * decides whether a structural edit should coalesce-notify the auto-recalc) used to omit
 * `parentId`, so assigning/clearing an activity's WBS summary never triggered a recalc — the
 * summary's rollup dates went stale until an unrelated edit or a manual Recalculate happened to
 * fire one. `usePlanAutoRecalc` itself is stubbed out here; this only proves the signature reacts
 * to a `parentId`-only change, mirroring the existing duration/constraint coverage.
 */

const h = vi.hoisted(() => ({ authoring: true, notify: vi.fn() }));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get CANVAS_AUTHORING_ENABLED() {
      return h.authoring;
    },
    SCHEDULING_MODES_ENABLED: false,
    NOTES_ENABLED: false,
    UNDO_REDO_ENABLED: false,
  };
});

vi.mock('@/features/undo-redo', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanEditHistory: () => ({
    record: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    clear: vi.fn(),
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
  usePlanPen: () => ({ penManaged: false, holdsPen: true, onWriteRejected: vi.fn() }),
}));
vi.mock('@/features/plans', () => ({
  usePlan: () => query({ id: 'p1', projectId: 'proj1', plannedStart: '2026-01-01' }),
}));
vi.mock('@/features/projects', () => ({ useProject: () => query({ clientId: 'c1' }) }));
vi.mock('@/features/clients', () => ({ useClient: () => query({ id: 'c1' }) }));
vi.mock('@/features/calendars', () => ({
  useCalendars: () => query([]),
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

const TASK = {
  id: 'a1',
  name: 'Excavate',
  type: 'TASK',
  durationDays: 5,
  constraintType: null,
  constraintDate: null,
  parentId: null,
  laneIndex: 0,
  version: 1,
} as unknown as ActivitySummary;

const SUMMARY = {
  id: 'wbs1',
  name: 'Substructure',
  type: 'WBS_SUMMARY',
  durationDays: 0,
  constraintType: null,
  constraintDate: null,
  parentId: null,
  laneIndex: 1,
  version: 1,
} as unknown as ActivitySummary;

const h2 = vi.hoisted(() => ({ activities: [] as ActivitySummary[] }));
vi.mock('@/features/activities', () => ({
  useActivities: () => query(h2.activities),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

// Imported AFTER the mocks are declared.
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.authoring = true;
  h2.activities = [TASK, SUMMARY];
});

describe('WBS reparent participates in auto-recalc (structureSignature)', () => {
  it('does not notify on the initial render (baseline only)', () => {
    renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('does not notify on an unrelated re-render with no data change', () => {
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    rerender();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('notifies when an activity is reparented to a WBS summary (parentId-only change)', () => {
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(h.notify).not.toHaveBeenCalled();

    h2.activities = [{ ...TASK, parentId: 'wbs1' }, SUMMARY];
    rerender();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('notifies when an activity is cleared back to top-level (parentId → null)', () => {
    h2.activities = [{ ...TASK, parentId: 'wbs1' }, SUMMARY];
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(h.notify).not.toHaveBeenCalled();

    h2.activities = [{ ...TASK, parentId: null }, SUMMARY];
    rerender();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  /**
   * Dissolve (WBS improvements M2) is a server-side compound — reparent every child, then
   * soft-delete the summary — and the client only ever sees its *result* when the refetch lands.
   * It has no `notify()` of its own, so what makes the rollup dates settle is exactly this
   * signature reacting to the shape it arrives in. Worth pinning explicitly: the change here is
   * two effects at once (a row leaves, others reparent), and "one of the two would have fired it
   * anyway" is not something a future edit to the signature is obliged to preserve.
   */
  it('notifies when a summary is dissolved (children unfiled + summary gone)', () => {
    h2.activities = [{ ...TASK, parentId: 'wbs1' }, SUMMARY];
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(h.notify).not.toHaveBeenCalled();

    h2.activities = [{ ...TASK, parentId: null }];
    rerender();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('is inert when authoring is off (auto-recalc gated at the hook level)', () => {
    h.authoring = false;
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    h2.activities = [{ ...TASK, parentId: 'wbs1' }, SUMMARY];
    rerender();
    expect(h.notify).not.toHaveBeenCalled();
  });
});
