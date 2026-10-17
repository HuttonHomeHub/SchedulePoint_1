import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `canReadCost` comes from the server (TECH_DEBT #62), not from the role. The role is PLANNER
 * throughout, so the old derivation (`canReadCost: canWrite`) answered true in every case and the
 * server's `false` below could not reach the editor.
 */
const h = vi.hoisted(() => ({
  record: vi.fn(),
  setVisualMutateAsync: vi.fn(),
  notify: vi.fn(),
  announce: vi.fn(),
  onWriteRejected: vi.fn((): { kind: 'none' | 'lock' } => ({ kind: 'none' })),
}));
const h2 = vi.hoisted(() => ({
  plan: {},
}));
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: false,
    NOTES_ENABLED: false,
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
  usePlan: () => query(h2.plan),
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
  usePlanAutoRecalc: () => ({ notify: h.notify }),
}));

vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActivities: () => query([]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
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
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

const BASE_PLAN = { id: 'p1', projectId: 'proj1', plannedStart: '2026-01-01' };

beforeEach(() => {
  vi.clearAllMocks();
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
});

describe("usePlanWorkspaceModel — the editor's cost gate", () => {
  it('follows the server when it withholds cost from a role that can edit', () => {
    h2.plan = { ...BASE_PLAN, canReadCost: false };
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(result.current.activityEditorGating.cost.readable).toBe(false);
  });

  it('follows the server when it grants cost', () => {
    h2.plan = { ...BASE_PLAN, canReadCost: true };
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(result.current.activityEditorGating.cost.readable).toBe(true);
  });

  it('falls back to the role against an API that predates the field', () => {
    h2.plan = BASE_PLAN;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(result.current.activityEditorGating.cost.readable).toBe(true);
  });
});
