import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression for the placement auto-recalc gap (one-planning-surface M-F).
 *
 * `structureSignature` is the fingerprint that decides whether a structural edit should
 * coalesce-notify the auto-recalculation, and it omitted `visualStart`. That omission was a
 * **regression the collapse introduced**, not an old gap, and the mechanism is worth stating
 * because it is invisible from either side:
 *
 * The net this signature casts is what catches **undo**. No undo path calls `notify()` — every one
 * of its ten call sites is a forward edit seam — so an inverse has always relied on landing in a
 * watched field. Before the collapse a bulk drag wrote an `SNET`, which the signature watches, so
 * undoing one changed the fingerprint and the recalculation followed. After it a drag writes a
 * `visualStart`, which nothing watched — so `PATCH …/activities/placements` restored the INPUT and
 * left `visualEffectiveStart` describing the edit it had just reversed.
 *
 * Measured on a real plan before the fix: three bars dragged and undone read `visualStart: null` on
 * all three — undo fired, and was correct — with `visualEffectiveStart` still a day late on all
 * three, so the bars stayed where they had been dragged while the placement underneath them was
 * already gone. `e2e-multi-select` is what found it, and only because its assertion had stopped
 * polling `earlyStart`, which a placement no longer moves.
 *
 * This is the `parentId` sibling one field along (`use-plan-workspace-model.wbs-recalc.test.ts`),
 * and the fixtures deliberately change `visualStart` and NOTHING else, so a signature that reacted
 * for some other reason could not make these pass.
 */

const h = vi.hoisted(() => ({ authoring: true, notify: vi.fn() }));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get CANVAS_AUTHORING_ENABLED() {
      return h.authoring;
    },
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
  visualStart: null,
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
  visualStart: null,
  laneIndex: 1,
  version: 1,
} as unknown as ActivitySummary;

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
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useBatchPlacements: () => ({ mutateAsync: vi.fn(() => Promise.resolve([])) }),
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

describe('a hand-placement participates in auto-recalc (structureSignature)', () => {
  it('does not notify on the initial render (baseline only)', () => {
    renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('does not notify on an unrelated re-render with no data change', () => {
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    rerender();
    expect(h.notify).not.toHaveBeenCalled();
  });

  /** The forward half — a drag lands a placement. This one also `notify()`s at its own seam. */
  it('notifies when an activity gains a placement (visualStart null → set)', () => {
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(h.notify).not.toHaveBeenCalled();

    h2.activities = [{ ...TASK, visualStart: '2026-01-12' }, SUMMARY];
    rerender();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  /**
   * **The half that was broken, and the one with no `notify()` behind it.** Undo clears the
   * placement through `PATCH …/activities/placements`, which no undo path follows with a notify —
   * so if the signature does not react, nothing re-derives `visualEffectiveStart` and the bar stays
   * drawn where it was dragged. Verified red against the pre-fix signature.
   */
  it('notifies when a placement is cleared (visualStart set → null) — the undo path', () => {
    h2.activities = [{ ...TASK, visualStart: '2026-01-12' }, SUMMARY];
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    expect(h.notify).not.toHaveBeenCalled();

    h2.activities = [{ ...TASK, visualStart: null }, SUMMARY];
    rerender();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  /** Moved, not cleared: one placement replaced by another is still a scheduling input change. */
  it('notifies when a placement moves (visualStart set → a different day)', () => {
    h2.activities = [{ ...TASK, visualStart: '2026-01-12' }, SUMMARY];
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    h2.activities = [{ ...TASK, visualStart: '2026-01-19' }, SUMMARY];
    rerender();
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  /**
   * **The negative, and it is not decoration.** `laneIndex` is deliberately outside the signature —
   * a lane move changes no date, and the forward seam skips the recalculation for one explicitly
   * (`isLaneOnly`). Widening the signature to `visualStart` must not drag the lane in with it, or
   * every lane drag pays for a recalculation that can change nothing.
   */
  it('does NOT notify for a lane-only change', () => {
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    h2.activities = [{ ...TASK, laneIndex: 7 }, SUMMARY];
    rerender();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('is inert when authoring is off (auto-recalc gated at the hook level)', () => {
    h.authoring = false;
    const { rerender } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    h2.activities = [{ ...TASK, visualStart: '2026-01-12' }, SUMMARY];
    rerender();
    expect(h.notify).not.toHaveBeenCalled();
  });
});
