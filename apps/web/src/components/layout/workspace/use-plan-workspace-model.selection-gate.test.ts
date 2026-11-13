import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlanWorkspaceModel } from './use-plan-workspace-model';

import { anActivity } from '@/test/activity-fixture';

/**
 * **The selection bar's gate reason, through the workspace model** (`docs/specs/read-only-wording`,
 * rows 4, 4b and 5). `BulkSelectionBar.test.tsx` passes the sentence in, so only a test at the model
 * can say which sentence the bar is given for each of the three ways the gate can be shut.
 *
 * The harness is `use-plan-workspace-model.make-milestone.test.ts`'s with the role and the pen made
 * controllable.
 */

const h = vi.hoisted(() => ({
  record: vi.fn(),
  setVisualMutateAsync: vi.fn(),
  patchFields: vi.fn(),
  notify: vi.fn(),
  announce: vi.fn(),
  settled: 0,
  onWriteRejected: vi.fn((): { kind: 'none' | 'lock' } => ({ kind: 'none' })),
  role: 'PLANNER',
  holdsPen: true,
  holder: null as { id: string; name: string; email: string } | null,
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
  useOrgRole: () => h.role,
}));
vi.mock('@/features/auth', () => ({ useSession: () => ({ data: { user: { id: 'u1' } } }) }));
vi.mock('@/features/plan-lock', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePlanPen: () => ({
    holdsPen: h.holdsPen,
    status: h.holder ? { holder: h.holder } : null,
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

const ACTIVITY: ActivitySummary = anActivity({
  code: null,
  laneIndex: 2,
  earlyStart: null,
  earlyFinish: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  visualStart: '2026-02-01',
  accrualType: 'UNIFORM',
  version: 7,
});

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

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.role = 'PLANNER';
  h.holdsPen = true;
  h.holder = null;
  h2.activities = [ACTIVITY];
});

const gate = () =>
  renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper }).result.current.bulkOperations
    .gate;

describe('usePlanWorkspaceModel — the selection bar gate', () => {
  it('is open, with no reason, for a Planner holding the plan', () => {
    expect(gate()).toEqual({ writable: true, reason: null });
  });

  it('row 4: tells a Planner on a free plan to Start editing', () => {
    h.holdsPen = false;
    expect(gate()).toEqual({ writable: false, reason: 'Start editing to change this plan.' });
  });

  it('row 4b: names the colleague and Request control when somebody else is editing', () => {
    h.holdsPen = false;
    h.holder = { id: 'u2', name: 'Sam Jones', email: 'sam@example.com' };
    expect(gate()).toEqual({
      writable: false,
      reason: 'Sam is editing this plan. Request control to change this plan.',
    });
  });

  it('row 5: names the role, and never offers editing, to a Viewer', () => {
    h.role = 'VIEWER';
    h.holdsPen = false;
    expect(gate()).toEqual({ writable: false, reason: 'Your role cannot change this plan.' });
  });
});
