import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `onTsldResize` (ADR-0052 M2): the finish-edge duration resize is a FULL-definition
 * `PATCH durationDays` — durationType / EV / accrual / constraints round-trip verbatim, never
 * silently cleared — under the exact reposition contract: optimistic version, 409 → non-destructive
 * conflict (nothing recorded, never re-sent), 423 → the shared pen contract, follow-up recalc via
 * the coalesced auto-recalc (authoring on) or the inline recalculate (authoring off), and a
 * flag-guarded coalescable `durationResizeCommand` on the undo stack.
 */

const h = vi.hoisted(() => ({
  undoRedo: false,
  authoring: false,
  schedulingModes: false,
  planMode: 'EARLY',
  record: vi.fn(),
  updateMutateAsync: vi.fn(),
  setVisualStartMutateAsync: vi.fn(),
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
    get SCHEDULING_MODES_ENABLED() {
      return h.schedulingModes;
    },
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
  usePlan: () =>
    query({ id: 'p1', projectId: 'proj1', plannedStart: '2026-01-01', schedulingMode: h.planMode }),
}));
vi.mock('@/features/projects', () => ({ useProject: () => query({ clientId: 'c1' }) }));
vi.mock('@/features/clients', () => ({ useClient: () => query({ id: 'c1' }) }));
vi.mock('@/features/calendars', () => ({
  useCalendars: () => query([]),
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
  useRecalculate: () => ({ mutateAsync: h.recalcMutateAsync }),
  usePlanAutoRecalc: () => ({ notify: h.notify }),
}));

// An activity carrying a constraint + non-default duration-type/EV/accrual inputs, so the
// full-definition round-trip assertion below proves they are RESENT, not silently cleared.
const ACTIVITY: ActivitySummary = {
  id: 'a1',
  planId: 'p1',
  code: 'A100',
  name: 'Excavate',
  description: null,
  type: 'TASK',
  durationDays: 5,
  constraintType: 'SNET',
  constraintDate: '2026-02-01',
  secondaryConstraintType: null,
  secondaryConstraintDate: null,
  calendarId: 'cal-9',
  laneIndex: 1,
  scheduleAsLateAsPossible: false,
  expectedFinish: null,
  status: 'NOT_STARTED',
  percentComplete: 0,
  actualStart: null,
  actualFinish: null,
  remainingDurationDays: null,
  suspendDate: null,
  resumeDate: null,
  earlyStart: '2026-02-01',
  earlyFinish: '2026-02-05',
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
  durationType: 'FIXED_UNITS',
  parentId: null,
  visualStart: null,
  visualEffectiveStart: null,
  visualEffectiveFinish: null,
  visualConflict: false,
  visualDriftDays: null,
  levelingPriority: 7,
  leveledStart: null,
  leveledFinish: null,
  levelingDelayDays: null,
  levelingWindowExceeded: false,
  selfOverAllocated: false,
  percentCompleteType: 'PHYSICAL',
  accrualType: 'START',
  physicalPercentComplete: 25,
  budgetedExpense: 150000,
  actualExpense: null,
  version: 3,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

vi.mock('@/features/activities', () => ({
  useActivities: () => query([ACTIVITY]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: h.updateMutateAsync }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: h.setVisualStartMutateAsync }),
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
  h.schedulingModes = false;
  h.planMode = 'EARLY';
  h.updateMutateAsync.mockResolvedValue({ ...ACTIVITY, durationDays: 8, version: 4 });
  h.setVisualStartMutateAsync.mockResolvedValue({
    ...ACTIVITY,
    visualStart: '2026-01-07',
    durationDays: 8,
    version: 4,
  });
  h.recalcMutateAsync.mockResolvedValue(undefined);
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
});

describe('onTsldResize (ADR-0052 M2)', () => {
  it('PATCHes durationDays with the FULL definition round-trip at the live version', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldResize({ activityId: 'a1', durationDays: 8 });
    });

    expect(outcome).toEqual({ applied: true, conflict: null });
    expect(h.updateMutateAsync).toHaveBeenCalledTimes(1);
    // The one intended change…
    expect(h.updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ activityId: 'a1', version: 3, durationDays: 8 }),
    );
    // …and every other definition field resent verbatim (constraints, duration type, EV,
    // accrual, calendar, WBS parent, levelling priority) — nothing silently cleared.
    expect(h.updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        constraintType: 'SNET',
        constraintDate: '2026-02-01',
        durationType: 'FIXED_UNITS',
        percentCompleteType: 'PHYSICAL',
        accrualType: 'START',
        physicalPercentComplete: 25,
        budgetedExpense: 1500, // minor units → major input
        calendarId: 'cal-9',
        levelingPriority: 7,
      }),
    );
    // Authoring off → the inline authoritative recalc ran (the pre-coalescer contract).
    expect(h.recalcMutateAsync).toHaveBeenCalledTimes(1);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('notifies the coalesced auto-recalc instead of the inline recalc when authoring is on', async () => {
    h.authoring = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldResize({ activityId: 'a1', durationDays: 8 });
    });
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
  });

  it('records ONE coalescable durationResizeCommand when undo/redo is on, none when off', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldResize({ activityId: 'a1', durationDays: 8 });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
    const command = h.record.mock.calls[0]![0];
    expect(command.label).toBe('Resize “Excavate”');
    expect(command.coalescing?.key).toBe('resize:a1');

    h.undoRedo = false;
    h.record.mockClear();
    const off = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await off.result.current.onTsldResize({ activityId: 'a1', durationDays: 8 });
    });
    expect(h.record).not.toHaveBeenCalled();
  });

  it('409 (stale version): resolves applied:false with the conflict message — no record, no recalc', async () => {
    h.undoRedo = true;
    h.updateMutateAsync.mockRejectedValue(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }),
    );
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldResize({ activityId: 'a1', durationDays: 8 });
    });

    expect(outcome).toEqual({
      applied: false,
      conflict:
        'This plan changed since you opened it — your resize wasn’t applied. Refresh to see the latest.',
    });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('423 (pen lost): defers to the shared pen contract and resolves applied:false, no banner', async () => {
    const err = new ApiFetchError(423, { code: 'LOCKED', message: 'pen held elsewhere' });
    h.updateMutateAsync.mockRejectedValue(err);
    h.onWriteRejected.mockReturnValue({ kind: 'lock' });
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldResize({ activityId: 'a1', durationDays: 8 });
    });

    expect(outcome).toEqual({ applied: false, conflict: null });
    expect(h.onWriteRejected).toHaveBeenCalledWith(err);
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
  });

  it('no-ops on an identical duration (no PATCH, no recalc) and on an unknown activity', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldResize({ activityId: 'a1', durationDays: 5 });
    });
    expect(outcome).toEqual({ applied: false, conflict: null });
    await act(async () => {
      outcome = await result.current.onTsldResize({ activityId: 'ghost', durationDays: 8 });
    });
    expect(outcome).toEqual({ applied: false, conflict: null });
    expect(h.updateMutateAsync).not.toHaveBeenCalled();
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
  });

  it('a recalc refusal after a landed resize is non-fatal (applied:true + advisory conflict)', async () => {
    h.recalcMutateAsync.mockRejectedValue(new Error('recalc busy'));
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldResize({ activityId: 'a1', durationDays: 8 });
    });
    expect(outcome).toEqual({
      applied: true,
      conflict:
        'Resized, but the schedule couldn’t recalculate just now. The dates will update after the next recalculation.',
    });
  });
});

describe('onTsldResize — start edge (ADR-0052 M3, mode-aware §3)', () => {
  it('EARLY: ONE full-definition PATCH imposing SNET-at-new-start + the new duration', async () => {
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome;
    await act(async () => {
      // Drag the start to day 6 (2026-01-07); finish pinned → duration 8.
      outcome = await result.current.onTsldResize({
        activityId: 'a1',
        durationDays: 8,
        startDay: 6,
      });
    });

    expect(outcome).toEqual({ applied: true, conflict: null });
    expect(h.updateMutateAsync).toHaveBeenCalledTimes(1);
    // The two intended changes ride ONE call (the spike-verified combined PATCH): the SNET pin at
    // the new start — mirroring the reposition payload — plus the recomputed duration…
    expect(h.updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        activityId: 'a1',
        version: 3,
        constraintType: 'SNET',
        constraintDate: '2026-01-07',
        durationDays: 8,
      }),
    );
    // …with every other definition field resent verbatim (never silently cleared).
    expect(h.updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        durationType: 'FIXED_UNITS',
        percentCompleteType: 'PHYSICAL',
        accrualType: 'START',
        calendarId: 'cal-9',
        levelingPriority: 7,
      }),
    );
    // The visualStart seam is never touched in EARLY mode.
    expect(h.setVisualStartMutateAsync).not.toHaveBeenCalled();
    expect(h.recalcMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('VISUAL: ONE minimal visualStart + durationDays PATCH (no definition resend, no SNET)', async () => {
    h.schedulingModes = true;
    h.planMode = 'VISUAL';
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldResize({
        activityId: 'a1',
        durationDays: 8,
        startDay: 6,
      });
    });

    expect(outcome).toEqual({ applied: true, conflict: null });
    expect(h.setVisualStartMutateAsync).toHaveBeenCalledExactlyOnceWith({
      activityId: 'a1',
      visualStart: '2026-01-07',
      durationDays: 8,
      version: 3,
    });
    // The full-definition path is NOT used — a Visual placement never writes a constraint.
    expect(h.updateMutateAsync).not.toHaveBeenCalled();
    expect(h.recalcMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('records the mode-matching coalescable command on the SHARED resize:{id} key', async () => {
    h.undoRedo = true;
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldResize({ activityId: 'a1', durationDays: 8, startDay: 6 });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
    const early = h.record.mock.calls[0]![0];
    expect(early.label).toBe('Resize “Excavate”');
    expect(early.coalescing?.key).toBe('resize:a1');

    h.record.mockClear();
    h.schedulingModes = true;
    h.planMode = 'VISUAL';
    const visual = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await visual.result.current.onTsldResize({ activityId: 'a1', durationDays: 8, startDay: 6 });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
    const command = h.record.mock.calls[0]![0];
    expect(command.label).toBe('Resize “Excavate”');
    expect(command.coalescing?.key).toBe('resize:a1');
  });

  it('VISUAL undo restores the prior visualStart AND duration through the same seam', async () => {
    h.undoRedo = true;
    h.schedulingModes = true;
    h.planMode = 'VISUAL';
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    await act(async () => {
      await result.current.onTsldResize({ activityId: 'a1', durationDays: 8, startDay: 6 });
    });
    const command = h.record.mock.calls[0]![0];
    h.setVisualStartMutateAsync.mockClear();
    await command.undo();
    // The pre-edit row had no placement (null) and duration 5 — both restored in one PATCH at
    // the post-edit version.
    expect(h.setVisualStartMutateAsync).toHaveBeenCalledExactlyOnceWith({
      activityId: 'a1',
      visualStart: null,
      durationDays: 5,
      version: 4,
    });
  });

  it('409 (stale version): resolves applied:false with the conflict message — no record, no recalc', async () => {
    h.undoRedo = true;
    h.updateMutateAsync.mockRejectedValue(
      new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }),
    );
    const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldResize({
        activityId: 'a1',
        durationDays: 8,
        startDay: 6,
      });
    });
    expect(outcome).toEqual({
      applied: false,
      conflict:
        'This plan changed since you opened it — your resize wasn’t applied. Refresh to see the latest.',
    });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.recalcMutateAsync).not.toHaveBeenCalled();
  });
});
