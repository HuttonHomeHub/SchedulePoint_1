import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * **The recalculation hold's expiry wiring** (ADR-0064 T7), the middle link of a three-part chain.
 *
 * `TsldPanel` takes and releases the hold (`TsldPanel.mode-band.test.tsx`); `TsldCanvas` abandons an
 * open pick when the signal changes (`TsldCanvas.test.tsx`). Between them sits this five-line
 * callback, and it had no test — which the ADR-0064 enablement test review called out, because a
 * break here silently reintroduces the epic's founding defect class: a pick committing against bars
 * that moved underneath it, in the one case the debounce-based journeys cannot reach (a planner who
 * walks away mid-pick for ten seconds).
 *
 * The harness is the established `usePlanWorkspaceModel` one; the only addition is capturing the
 * options handed to `usePlanAutoRecalc` so the expiry can be fired directly.
 */

const h = vi.hoisted(() => ({
  undoRedo: false,
  record: vi.fn(),
  setVisualMutateAsync: vi.fn(),
  notify: vi.fn(),
  announce: vi.fn(),
  onWriteRejected: vi.fn((): { kind: 'none' | 'lock' } => ({ kind: 'none' })),
  autoRecalcOpts: undefined as { onHoldExpired?: () => void } | undefined,
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
  // The model calls this as `usePlanAutoRecalc(orgSlug, planId, opts)` — the options are the THIRD
  // argument, not the first. Capturing the wrong position is how this test first reported that the
  // model had wired nothing.
  usePlanAutoRecalc: (_orgSlug: string, _planId: string, opts?: { onHoldExpired?: () => void }) => {
    h.autoRecalcOpts = opts;
    return { notify: h.notify, hold: vi.fn(), release: vi.fn() };
  },
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
  laneIndex: 2,
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
  visualStart: '2026-02-01',
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
  version: 7,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// A second, present activity so the delete-reconcile case can be simulated by swapping the query data.
const OTHER: ActivitySummary = { ...ACTIVITY, id: 'a2', name: 'Pour', visualStart: null };

const h2 = vi.hoisted(() => ({ activities: [] as ActivitySummary[] }));
vi.mock('@/features/activities', () => ({
  useActivities: () => query(h2.activities),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: h.setVisualMutateAsync }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

// Imported AFTER the mocks.
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

beforeEach(() => {
  vi.clearAllMocks();
  h.undoRedo = false;
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
  h.setVisualMutateAsync.mockResolvedValue({ ...ACTIVITY, visualStart: null, version: 8 });
  h2.activities = [ACTIVITY, OTHER];
});

describe('usePlanWorkspaceModel — the recalculation-hold expiry (ADR-0064 T7)', () => {
  it('bumps the drop signal and says why, once per expiry', () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    const before = result.current.dropLinkPickSignal;
    expect(h.autoRecalcOpts?.onHoldExpired, 'the model must wire the expiry').toBeTypeOf(
      'function',
    );

    act(() => h.autoRecalcOpts?.onHoldExpired?.());
    expect(result.current.dropLinkPickSignal).toBe(before + 1);
    // The canvas is aria-hidden, so the only way a screen-reader user learns their pick went is
    // this sentence — and nobody asked for the drop, so it has to explain itself.
    expect(h.announce).toHaveBeenCalledWith(
      'Schedule recalculated — the unfinished link was dropped. Pick the predecessor again.',
    );

    act(() => h.autoRecalcOpts?.onHoldExpired?.());
    expect(result.current.dropLinkPickSignal).toBe(before + 2);
  });

  it('starts at a signal the canvas reads as "nothing has asked yet"', () => {
    // The canvas skips its initial value; a model starting anywhere else would drop the first pick
    // of every session.
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(result.current.dropLinkPickSignal).toBe(0);
  });

  it('exposes the hold seam the panel takes its token against', () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(result.current.autoRecalcHold.hold).toBeTypeOf('function');
    expect(result.current.autoRecalcHold.release).toBeTypeOf('function');
  });
});
