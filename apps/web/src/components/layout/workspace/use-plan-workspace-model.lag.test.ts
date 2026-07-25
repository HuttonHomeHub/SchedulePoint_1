import type { ActivitySummary, DependencySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `onTsldLag` (ADR-0052 M3): the lag-anchor drag / Logic-panel lag nudge is a
 * `PATCH /dependencies/:id` echoing the row's unchanged type + lag calendar at the live version —
 * exactly `useUpdateDependency`'s input — under the reposition contract: 409 → non-destructive
 * conflict (nothing recorded, never re-sent), 423 → the shared pen contract, follow-up recalc via
 * the coalesced auto-recalc (authoring on) or the inline recalculate (authoring off), and a
 * flag-guarded coalescable `lagDragCommand` on the undo stack.
 */

const h = vi.hoisted(() => ({
  undoRedo: false,
  authoring: false,
  record: vi.fn(),
  updateDependencyMutateAsync: vi.fn(),
  recalcMutateAsync: vi.fn(),
  notify: vi.fn(),
  onWriteRejected: vi.fn(),
}));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get CANVAS_AUTHORING_ENABLED() {
      return h.authoring;
    },
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
  useCalendar: () => query(undefined),
}));
vi.mock('@/features/baselines', () => ({ useBaselineVariance: () => query(undefined) }));
vi.mock('@/features/notes', () => ({ useActivityNoteCounts: () => query(undefined) }));

/** The one dependency on the plan — an SS+2 on the 24-hour calendar, so the echo is provable. */
const DEPENDENCY: DependencySummary = {
  id: 'd1',
  planId: 'p1',
  type: 'SS',
  lagDays: 2,
  lagCalendar: 'TWENTY_FOUR_HOUR',
  predecessor: { id: 'a1', code: 'A10', name: 'Excavate' },
  successor: { id: 'a2', code: 'A20', name: 'Pour' },
  isDriving: true,
  version: 6,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

vi.mock('@/features/dependencies', () => ({
  usePlanDependencies: () => query([DEPENDENCY]),
  useCreateDependency: () => ({ mutateAsync: vi.fn() }),
  useDeleteDependency: () => ({ mutateAsync: vi.fn() }),
  useUpdateDependency: () => ({ mutateAsync: h.updateDependencyMutateAsync }),
}));
vi.mock('@/features/schedule', () => ({
  useRecalculate: () => ({ mutateAsync: h.recalcMutateAsync }),
  usePlanAutoRecalc: () => ({ notify: h.notify }),
}));

const ACTIVITY = {
  id: 'a1',
  name: 'Excavate',
  laneIndex: 0,
  version: 1,
} as unknown as ActivitySummary;

vi.mock('@/features/activities', () => ({
  useActivities: () => query([ACTIVITY]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

// Imported AFTER the mocks are declared.
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

import { ApiFetchError } from '@/lib/api/client';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.undoRedo = false;
  h.authoring = false;
  h.updateDependencyMutateAsync.mockResolvedValue({ ...DEPENDENCY, lagDays: 5, version: 7 });
  h.recalcMutateAsync.mockResolvedValue(undefined);
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
});

describe('onTsldLag (ADR-0052 M3)', () => {
  it('PATCHes the new lag, echoing the row’s type + lag calendar at the live version', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldLag({ dependencyId: 'd1', lagDays: 5 });
    });

    expect(outcome).toEqual({ applied: true, conflict: null });
    expect(h.updateDependencyMutateAsync).toHaveBeenCalledExactlyOnceWith({
      dependencyId: 'd1',
      type: 'SS',
      lagDays: 5,
      lagCalendar: 'TWENTY_FOUR_HOUR',
      version: 6,
    });
    // Authoring off → the inline authoritative recalc ran (the pre-coalescer contract).
    expect(h.recalcMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('notifies the coalesced auto-recalc instead of the inline recalc when authoring is on', async () => {
    h.authoring = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldLag({ dependencyId: 'd1', lagDays: 5 });
    });
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
  });

  it('records ONE coalescable lagDragCommand when undo/redo is on, none when off', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldLag({ dependencyId: 'd1', lagDays: 5 });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
    const command = h.record.mock.calls[0]![0];
    expect(command.label).toBe('Change lag “Excavate” → “Pour”');
    expect(command.coalescing?.key).toBe('lag:d1');
    // The inverse restores the prior lag (2) at the post-edit version (7).
    h.updateDependencyMutateAsync.mockClear();
    await command.undo();
    expect(h.updateDependencyMutateAsync).toHaveBeenCalledExactlyOnceWith({
      dependencyId: 'd1',
      type: 'SS',
      lagDays: 2,
      lagCalendar: 'TWENTY_FOUR_HOUR',
      version: 7,
    });

    h.undoRedo = false;
    h.record.mockClear();
    const off = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await off.result.current.onTsldLag({ dependencyId: 'd1', lagDays: 5 });
    });
    expect(h.record).not.toHaveBeenCalled();
  });

  it('409 (stale version): resolves applied:false with the conflict message — no record, no recalc', async () => {
    h.undoRedo = true;
    h.updateDependencyMutateAsync.mockRejectedValue(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }),
    );
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldLag({ dependencyId: 'd1', lagDays: 5 });
    });

    expect(outcome).toEqual({
      applied: false,
      conflict:
        'This plan changed since you opened it — the lag wasn’t changed. Refresh to see the latest.',
    });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('423 (pen lost): defers to the shared pen contract and resolves applied:false, no banner', async () => {
    const err = new ApiFetchError(423, { code: 'LOCKED', message: 'pen held elsewhere' });
    h.updateDependencyMutateAsync.mockRejectedValue(err);
    h.onWriteRejected.mockReturnValue({ kind: 'lock' });
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldLag({ dependencyId: 'd1', lagDays: 5 });
    });

    expect(outcome).toEqual({ applied: false, conflict: null });
    expect(h.onWriteRejected).toHaveBeenCalledWith(err);
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
  });

  it('no-ops on an identical lag (no PATCH, no recalc) and on an unknown dependency', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldLag({ dependencyId: 'd1', lagDays: 2 });
    });
    expect(outcome).toEqual({ applied: false, conflict: null });
    await act(async () => {
      outcome = await result.current.onTsldLag({ dependencyId: 'ghost', lagDays: 9 });
    });
    expect(outcome).toEqual({ applied: false, conflict: null });
    expect(h.updateDependencyMutateAsync).not.toHaveBeenCalled();
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
  });

  it('a recalc refusal after a landed change is non-fatal (applied:true + advisory conflict)', async () => {
    h.recalcMutateAsync.mockRejectedValue(new Error('recalc busy'));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldLag({ dependencyId: 'd1', lagDays: 5 });
    });
    expect(outcome).toEqual({
      applied: true,
      conflict:
        'Lag changed, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
    });
  });
});
