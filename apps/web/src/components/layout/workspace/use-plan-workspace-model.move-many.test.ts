import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * **`moveMany` — the plural drag's write seam** (`docs/TECH_DEBT.md` #108).
 *
 * It shipped with no unit coverage at all: the only proof was one e2e step dragging three
 * unconstrained bars in EARLY mode with no version conflict, and every model suite that touched it
 * only stubbed `useBatchPlacements` hard enough to keep compiling. The consolidation pass's
 * test-quality review said so, and it was right — the branches that decide whether a planner's
 * twelve bars land on the right dates, or whether they are told anything at all when the write is
 * refused, were all unreached.
 *
 * What each case here exists to catch, stated so a future reader can tell a real failure from a
 * fixture drift:
 *
 * - **The field a move writes.** It is `visualStart`, on every plan (one-planning-surface M-F-T3).
 *   Getting this wrong writes the wrong field on every bar of the drag — silently, with
 *   correct-looking dates. This bullet used to describe a fork (EARLY pinned an SNET, VISUAL wrote
 *   a placement) and named the defect that made it worth testing: a TDZ slip had `isVisualMode`
 *   missing from the memo's dependencies. The fork is gone with the mode; the assertion that a move
 *   writes a placement and nothing else is what it leaves behind, and it is the half that mattered.
 * - **Conflict and pen loss.** These branches did not exist until the consolidation pass: the whole
 *   method had no `catch`, so a 409 propagated as a raw rejection and a 423 skipped
 *   `pen.onWriteRejected` entirely, leaving the client's pen state stale until the next poll. The
 *   declared `{ conflict: string | null }` return could never be non-null, so `TsldPanel`'s branch
 *   reading it was unreachable code.
 * - **The lane-only skip**, because a pure lane move changes no date and a needless recalculation is
 *   the difference between a snappy drag and a stalled one.
 */

const h = vi.hoisted(() => ({
  undoRedo: false,
  record: vi.fn(),
  notify: vi.fn(),
  hold: vi.fn(),
  release: vi.fn(),
  announce: vi.fn(),
  batchPlacements: vi.fn(),
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
  usePlanPen: () => ({ penManaged: true, holdsPen: true, onWriteRejected: h.onWriteRejected }),
}));
vi.mock('@/features/plans', () => ({
  usePlan: () =>
    query({
      id: 'p1',
      projectId: 'proj1',
      plannedStart: '2026-01-01',
    }),
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
  usePlanAutoRecalc: () => ({ notify: h.notify, hold: h.hold, release: h.release }),
}));

const ACTIVITY: ActivitySummary = {
  drivingResourceCalendarId: null,
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
  earlyStart: '2026-02-02',
  earlyFinish: '2026-02-06',
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
  visualStart: '2026-02-02',
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
const OTHER: ActivitySummary = { ...ACTIVITY, id: 'a2', name: 'Pour', laneIndex: 3, version: 4 };

// **Partial**, not total — the `@/features/dependencies` lesson, one feature along. A total mock
// blanks every export the workspace host imports, not only the ones this suite meant to stub, so a
// host that starts importing one more symbol fails these at COLLECTION with "no export is defined
// on the mock". ADR-0095 M5-T4/T5 did exactly that twice (`useUpdateActivityParents`, then
// `ActivityCreateDialog`).
vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActivities: () => query([ACTIVITY, OTHER]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useBatchPlacements: () => ({ mutateAsync: h.batchPlacements }),
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

function moveMany() {
  const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
  const fn = result.current.bulkOperations?.moveMany;
  if (!fn) throw new Error('the model exposed no moveMany — the bulk contract changed');
  return fn;
}

/** An `ApiFetchError` with a given status, built the way the client actually constructs one. */
function apiError(status: number): ApiFetchError {
  return new ApiFetchError(status, { code: 'CONFLICT', message: 'stale' });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.undoRedo = false;
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
  h.batchPlacements.mockResolvedValue([
    { id: 'a1', version: 8 },
    { id: 'a2', version: 5 },
  ]);
});

describe('usePlanWorkspaceModel — moveMany (the plural drag)', () => {
  /**
   * **The `EARLY` case is DELETED** (M-F-T3). It asserted `constraintType: 'SNET'` on every moved
   * row, which is exactly what a bulk drag no longer does: twelve bars used to be pinned by a
   * gesture nobody read as a commitment.
   *
   * Its better half is preserved and inverted below — that a move must not disturb a row's own
   * constraint — and is asserted where it can actually discriminate, in
   * `features/tsld/model/bulk-move.test.ts`, against a fixture carrying a non-null one.
   */
  /**
   * **This docblock claimed the move CLEARS a constraint, and that was never true** — corrected at
   * M-F-T3 rather than carried.
   *
   * `movedPlacement` spreads the row's current placement, so `constraintType` arrives at whatever
   * the row already had; the batch DTO takes complete rows, so it is present rather than omitted,
   * which is the fact the original author was reaching for. The fixture's constraint is `null`, so
   * this case asserts `null` on a row that was already `null` — it passes, and it has never been
   * able to tell "carried through" from "cleared".
   *
   * The claim mattered: "a bar carrying a stale SNET while the plan schedules visually is pinned by
   * a constraint nobody can see" describes a real hazard, and the reassurance that a move fixed it
   * was false. What the product actually guarantees is the opposite and is better — a move does not
   * touch a commitment at all — and it is asserted against a non-null fixture in
   * `features/tsld/model/bulk-move.test.ts`, which is where it can discriminate.
   *
   * Kept here as the seam check it really is: the batch carries a placement and a complete row.
   */
  it('writes visualStart and sends a COMPLETE row, constraint field included', async () => {
    await moveMany()([ACTIVITY, OTHER], { dayDelta: 3, laneDelta: 0 });
    const sent = h.batchPlacements.mock.calls[0]?.[0] as {
      placements: { id: string; constraintType?: string | null; visualStart?: string | null }[];
    };
    for (const p of sent.placements) {
      expect(p.visualStart).toEqual(expect.any(String));
      expect(p.constraintType).toBeNull();
    }
  });

  it('carries each row’s OWN version, so one stale bar cannot be masked by another', async () => {
    await moveMany()([ACTIVITY, OTHER], { dayDelta: 1, laneDelta: 0 });
    const sent = h.batchPlacements.mock.calls[0]?.[0] as {
      placements: { id: string; version: number }[];
    };
    expect(sent.placements.find((p) => p.id === 'a1')?.version).toBe(7);
    expect(sent.placements.find((p) => p.id === 'a2')?.version).toBe(4);
  });

  // The branches that did not exist before the consolidation pass. Each was verified red against
  // the pre-fix method, which had no `catch` at all.
  it('turns a stale-version 409 into the same sentence the single-bar drag uses', async () => {
    h.batchPlacements.mockRejectedValue(apiError(409));
    const outcome = await moveMany()([ACTIVITY], { dayDelta: 2, laneDelta: 0 });
    expect(outcome.conflict).toMatch(/This plan changed since you opened it/);
  });

  it('routes a pen loss through onWriteRejected and reports no conflict of its own', async () => {
    h.batchPlacements.mockRejectedValue(apiError(423));
    h.onWriteRejected.mockReturnValue({ kind: 'lock' });
    const outcome = await moveMany()([ACTIVITY], { dayDelta: 2, laneDelta: 0 });
    expect(h.onWriteRejected).toHaveBeenCalled();
    // The pen layer owns this message — a second sentence here would say it twice.
    expect(outcome.conflict).toBeNull();
  });

  it('rethrows anything it does not recognise rather than swallowing it', async () => {
    h.batchPlacements.mockRejectedValue(new Error('network down'));
    await expect(moveMany()([ACTIVITY], { dayDelta: 2, laneDelta: 0 })).rejects.toThrow(
      'network down',
    );
  });

  it('releases the recalculation hold even when the write is refused', async () => {
    h.batchPlacements.mockRejectedValue(apiError(409));
    await moveMany()([ACTIVITY], { dayDelta: 2, laneDelta: 0 });
    expect(h.hold).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('skips the recalculation for a lane-only move, and asks for one when a date changed', async () => {
    await moveMany()([ACTIVITY], { dayDelta: 0, laneDelta: 2 });
    expect(h.notify).not.toHaveBeenCalled();
    await moveMany()([ACTIVITY], { dayDelta: 1, laneDelta: 0 });
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('writes nothing at all for a no-op delta', async () => {
    const outcome = await moveMany()([ACTIVITY], { dayDelta: 0, laneDelta: 0 });
    expect(h.batchPlacements).not.toHaveBeenCalled();
    expect(outcome.conflict).toBeNull();
  });

  it('records ONE undoable step, labelled by how many bars actually moved', async () => {
    h.undoRedo = true;
    await moveMany()([ACTIVITY, OTHER], { dayDelta: 2, laneDelta: 0 });
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]?.[0]).toMatchObject({ label: 'Move 2 activities' });

    h.record.mockClear();
    await moveMany()([ACTIVITY], { dayDelta: 2, laneDelta: 0 });
    expect(h.record.mock.calls[0]?.[0]).toMatchObject({ label: 'Move “Excavate”' });
  });

  it('records nothing when undo/redo is off', async () => {
    await moveMany()([ACTIVITY, OTHER], { dayDelta: 2, laneDelta: 0 });
    expect(h.record).not.toHaveBeenCalled();
  });
});
