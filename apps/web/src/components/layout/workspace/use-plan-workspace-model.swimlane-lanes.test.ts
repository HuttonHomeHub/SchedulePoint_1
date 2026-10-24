import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line import/order -- above the vi.mock() block because the fixtures below use it before the mocked imports load
import { anActivity } from '@/test/activity-fixture';

/**
 * **The host's write path for lane moves on the swimlane layout** (swimlanes M2-T4).
 *
 * What these exist to catch, since each is invisible on a screen test:
 *
 * - **SC-1: no `laneIndex` write while swimlanes are shown.** A lane move there is a lane INSIDE a
 *   swimlane, sent through the positions endpoint as `swimlane.laneIndex`. The swimlane-free
 *   `laneIndex` — on the single-bar PATCH, on the placements batch, on the create — is the planner's
 *   other arrangement and turning swimlanes off must find it as it was.
 * - **One batch.** The subject, the swimlane's unplaced members (materialise on write) and, across
 *   swimlanes, the new membership travel together or not at all.
 * - **One undo step for what the planner moved**, and none for the members written beside it.
 * - **The stale-version and lost-pen refusals** every other lane write already honours.
 */

const h = vi.hoisted(() => ({
  record: vi.fn(),
  notify: vi.fn(),
  hold: vi.fn(),
  release: vi.fn(),
  writeLanes: vi.fn(),
  batchPlacements: vi.fn(),
  setVisualStart: vi.fn(),
  repositionLane: vi.fn(),
  batchPositions: vi.fn(),
  createPlaced: vi.fn(),
  onWriteRejected: vi.fn((): { kind: 'none' | 'lock' } => ({ kind: 'none' })),
}));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_AUTHORING_ENABLED: true, NOTES_ENABLED: false };
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

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));
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
  usePlanAutoRecalc: () => ({ notify: h.notify, hold: h.hold, release: h.release }),
}));
vi.mock('@/features/swimlanes', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useWriteSwimlaneLanes: () => ({ mutateAsync: h.writeLanes }),
}));

const A1: ActivitySummary = anActivity({
  id: 'a1',
  name: 'Excavate',
  laneIndex: 4,
  visualStart: '2026-02-02',
  version: 7,
  swimlaneId: 'S1',
});
const A2: ActivitySummary = {
  ...A1,
  id: 'a2',
  name: 'Pour',
  laneIndex: 5,
  version: 4,
  swimlaneId: 'S1',
};
const NEW: ActivitySummary = { ...A1, id: 'new', name: 'Fix', laneIndex: 0, version: 1 };

vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActivities: () => query([A1, A2]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: h.createPlaced }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: h.repositionLane }),
  useSetActivityVisualStart: () => ({ mutateAsync: h.setVisualStart }),
  useBatchPositions: () => ({ mutateAsync: h.batchPositions }),
  useBatchPlacements: () => ({ mutateAsync: h.batchPlacements }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

// Imported AFTER the mocks.
import { usePlanWorkspaceModel } from './use-plan-workspace-model';

import { PLACEMENTS_BATCH_MAX } from '@/features/tsld/model/bulk-move';
import { ApiFetchError } from '@/lib/api/client';
import { activityKeys } from '@/lib/query/hierarchy-keys';

function setup() {
  const queryClient = new QueryClient();
  // The write reads versions from the cache; the created row has to be in it, as it is once the
  // create's own invalidation has refetched.
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'p1'), [A1, A2, NEW]);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
}

const apiError = (status: number): ApiFetchError =>
  new ApiFetchError(status, { code: 'CONFLICT', message: 'stale' });

beforeEach(() => {
  vi.clearAllMocks();
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
  h.writeLanes.mockResolvedValue([
    { ...A1, version: 8 },
    { ...A2, version: 5 },
  ]);
  h.batchPlacements.mockResolvedValue([
    { ...A1, version: 8 },
    { ...A2, version: 5 },
  ]);
  h.setVisualStart.mockResolvedValue({ ...A1, version: 8 });
  h.createPlaced.mockResolvedValue(NEW);
});

const MOVE_ONE = [
  { id: 'a1', lane: 2, from: { swimlaneId: 'S1', lane: 0 } },
  { id: 'a2', lane: 1, materialised: true as const },
];

describe('onTsldReposition with swimlaneLanes (a single bar on the swimlane layout)', () => {
  it('writes the lane inside the swimlane through the positions endpoint, and no laneIndex (SC-1)', async () => {
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldReposition({
        activityId: 'a1',
        swimlaneLanes: MOVE_ONE,
      });
    });

    expect(outcome).toEqual({ applied: true, conflict: null });
    expect(h.writeLanes).toHaveBeenCalledTimes(1);
    const body = h.writeLanes.mock.calls[0]![0];
    expect(body.positions).toEqual([
      { id: 'a1', version: 7, swimlane: { laneIndex: 2 } },
      { id: 'a2', version: 4, swimlane: { laneIndex: 1 } },
    ]);
    // The in-swimlane lane is `swimlane.laneIndex`; a row's own `laneIndex` is the swimlane-free one.
    for (const row of body.positions) expect(row).not.toHaveProperty('laneIndex');
    // The two swimlane-free lane writes are never reached.
    expect(h.repositionLane).not.toHaveBeenCalled();
    expect(h.batchPositions).not.toHaveBeenCalled();
    expect(h.setVisualStart).not.toHaveBeenCalled();
    // A lane move changes no date.
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('records ONE undo step for the bar moved, none for the member written beside it', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', swimlaneLanes: MOVE_ONE });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
    const command = h.record.mock.calls[0]![0];
    expect(command.subjects).toEqual(['a1']);
    expect(command.label).toBe('Move “Excavate” to lane');
    expect(command.affectsSchedule).toBe(false);
  });

  it('files the bar in another swimlane only when the move names one', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldReposition({
        activityId: 'a1',
        swimlaneLanes: [
          { id: 'a1', lane: 0, from: { swimlaneId: 'S1', lane: 0 }, swimlaneId: 'S2' },
        ],
      });
    });
    expect(h.writeLanes.mock.calls[0]![0].positions).toEqual([
      { id: 'a1', version: 7, swimlane: { swimlaneId: 'S2', laneIndex: 0 } },
    ]);
  });

  it('a drag that also moves in time hand-places the day with NO lane, then writes the lane', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldReposition({
        activityId: 'a1',
        startDay: 12,
        swimlaneLanes: MOVE_ONE,
      });
    });
    expect(h.setVisualStart).toHaveBeenCalledTimes(1);
    expect(h.setVisualStart.mock.calls[0]![0]).not.toHaveProperty('laneIndex');
    expect(h.writeLanes).toHaveBeenCalledTimes(1);
    expect(h.setVisualStart.mock.invocationCallOrder[0]!).toBeLessThan(
      h.writeLanes.mock.invocationCallOrder[0]!,
    );
  });

  it('records a diagonal drag as ONE undo step, labelled for the bar and never "1 activities"', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldReposition({
        activityId: 'a1',
        startDay: 12,
        swimlaneLanes: MOVE_ONE,
      });
    });
    expect(h.record).toHaveBeenCalledTimes(1);
    const command = h.record.mock.calls[0]![0];
    expect(command.label).toBe('Move “Excavate”');
    expect(command.subjects).toEqual(['a1']);
  });

  it('writes the lane at the version the time write returned, not the one the cache still shows', async () => {
    // The cache holds version 7 for a1; the placement write bumped it to 8 and said so.
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldReposition({
        activityId: 'a1',
        startDay: 12,
        swimlaneLanes: MOVE_ONE,
      });
    });
    expect(outcome).toEqual({ applied: true, conflict: null });
    const a1 = h.writeLanes.mock.calls[0]![0].positions.find((p: { id: string }) => p.id === 'a1');
    expect(a1.version).toBe(8);
  });

  it('a diagonal drag whose lane write is refused still records the day, which did land', async () => {
    h.writeLanes.mockRejectedValue(apiError(409));
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldReposition({
        activityId: 'a1',
        startDay: 12,
        swimlaneLanes: MOVE_ONE,
      });
    });
    expect(outcome).toMatchObject({ applied: true, conflict: expect.stringContaining('changed') });
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].label).toBe('Move “Excavate”');
  });

  it('keeps the day’s undo step when the lane write THROWS (a 5xx) after the day landed', async () => {
    h.writeLanes.mockRejectedValue(apiError(500));
    const { result } = setup();
    await act(async () => {
      await expect(
        result.current.onTsldReposition({
          activityId: 'a1',
          startDay: 12,
          swimlaneLanes: MOVE_ONE,
        }),
      ).rejects.toThrow();
    });
    expect(h.setVisualStart).toHaveBeenCalledTimes(1);
    // The placement is on the server, so it is on the undo stack — alone, as its own step.
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].label).toBe('Move “Excavate”');
    expect(h.record.mock.calls[0]![0].subjects).toEqual(['a1']);
  });

  it('reports a bar the plan no longer has instead of writing a smaller batch', async () => {
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldReposition({
        activityId: 'a1',
        swimlaneLanes: [...MOVE_ONE, { id: 'ghost', lane: 0, materialised: true as const }],
      });
    });
    expect(outcome).toMatchObject({
      applied: false,
      conflict: expect.stringContaining('no longer in the plan'),
    });
    expect(h.writeLanes).not.toHaveBeenCalled();
  });

  it('files a bar in no swimlane with swimlaneId: null and records the swimlane it left', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldReposition({
        activityId: 'a1',
        swimlaneLanes: [
          { id: 'a1', lane: 0, swimlaneId: null, from: { swimlaneId: 'S1', lane: 0 } },
        ],
      });
    });
    expect(h.writeLanes.mock.calls[0]![0].positions).toEqual([
      { id: 'a1', version: 7, swimlane: { swimlaneId: null, laneIndex: 0 } },
    ]);
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('a stale version is the ordinary conflict, and records nothing', async () => {
    h.writeLanes.mockRejectedValue(apiError(409));
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldReposition({
        activityId: 'a1',
        swimlaneLanes: MOVE_ONE,
      });
    });
    expect(outcome).toMatchObject({ applied: false, conflict: expect.stringContaining('changed') });
    expect(h.record).not.toHaveBeenCalled();
  });

  it('a lost pen defers to the shared contract and says nothing', async () => {
    h.writeLanes.mockRejectedValue(apiError(423));
    h.onWriteRejected.mockReturnValue({ kind: 'lock' });
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldReposition({
        activityId: 'a1',
        swimlaneLanes: MOVE_ONE,
      });
    });
    expect(outcome).toEqual({ applied: false, conflict: null });
    expect(h.record).not.toHaveBeenCalled();
  });

  it('off the swimlane layout a lane move is still the single-bar laneIndex PATCH', async () => {
    h.repositionLane.mockResolvedValue({ ...A1, laneIndex: 6, version: 8 });
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldReposition({ activityId: 'a1', laneIndex: 6 });
    });
    expect(h.repositionLane).toHaveBeenCalledTimes(1);
    expect(h.writeLanes).not.toHaveBeenCalled();
  });
});

describe('moveMany with swimlaneLanes (a plural move on the swimlane layout)', () => {
  const PLACEMENTS = [
    { id: 'a1', lane: 1, from: { swimlaneId: 'S1', lane: 0 } },
    { id: 'a2', lane: 3, from: { swimlaneId: 'S1', lane: 2 } },
  ];

  it('a lane-only move writes the lanes and touches no placement', async () => {
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.bulkOperations.moveMany(
        [A1, A2],
        { dayDelta: 0, laneDelta: 0 },
        { swimlaneLanes: PLACEMENTS },
      );
    });
    expect(outcome).toEqual({ applied: true, conflict: null });
    expect(h.batchPlacements).not.toHaveBeenCalled();
    expect(h.writeLanes.mock.calls[0]![0].positions).toEqual([
      { id: 'a1', version: 7, swimlane: { laneIndex: 1 } },
      { id: 'a2', version: 4, swimlane: { laneIndex: 3 } },
    ]);
    expect(h.hold).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].label).toBe('Move 2 activities');
  });

  it('a move in time sends every placement row with a NULL lane (SC-1) and then the lanes', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.bulkOperations.moveMany(
        [A1, A2],
        { dayDelta: 3, laneDelta: 0 },
        { swimlaneLanes: PLACEMENTS },
      );
    });
    const placements = h.batchPlacements.mock.calls[0]![0].placements as { laneIndex: unknown }[];
    expect(placements).toHaveLength(2);
    for (const row of placements) expect(row.laneIndex).toBeNull();
    expect(h.writeLanes).toHaveBeenCalledTimes(1);
    // The time part recalculates; the lane part is layout.
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.hold).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
    // One gesture, one step: the placements and the lanes are recorded as one.
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].label).toBe('Move 2 activities');
    // The lanes were written at the versions the placements returned (8 and 5), not the cache's.
    expect(
      h.writeLanes.mock.calls[0]![0].positions.map((p: { version: number }) => p.version),
    ).toEqual([8, 5]);
  });

  it('the undo of the time part does not write a swimlane-free lane either', async () => {
    const lane = (laneIndex: number): ActivitySummary['swimlaneLanes'] => [
      {
        basis: 'SWIMLANE',
        swimlaneId: 'S1',
        summaryActivityId: null,
        wbsLevel: null,
        laneIndex,
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ];
    // What the two writes returned, so the step knows the state an undo should find.
    h.writeLanes.mockResolvedValue([
      { ...A1, version: 9, swimlaneLanes: lane(1) },
      { ...A2, version: 6, swimlaneLanes: lane(3) },
    ]);
    const { result } = setup();
    await act(async () => {
      await result.current.bulkOperations.moveMany(
        [A1, A2],
        { dayDelta: 3, laneDelta: 0 },
        { swimlaneLanes: PLACEMENTS },
      );
    });
    const command = h.record.mock.calls[0]![0];
    expect(command.subjects).toEqual(['a1', 'a2']);
    h.batchPlacements.mockClear();
    h.writeLanes.mockClear();
    const ctx = {
      readActivities: () =>
        Promise.resolve(
          new Map([
            ['a1', { ...A1, version: 9, swimlaneLanes: lane(1) }],
            ['a2', { ...A2, version: 6, swimlaneLanes: lane(3) }],
          ]),
        ),
    };
    expect(await command.undo(ctx)).toEqual({ kind: 'applied' });
    // The lanes first, then the placements, which carry a NULL lane (SC-1).
    expect(h.writeLanes).toHaveBeenCalledTimes(1);
    for (const row of h.batchPlacements.mock.calls[0]![0].placements as { laneIndex: unknown }[]) {
      expect(row.laneIndex).toBeNull();
    }
  });

  it('a keyboard burst folds while it is lane-only, and does not once it mixes in a day', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.bulkOperations.moveMany(
        [A1, A2],
        { dayDelta: 0, laneDelta: 0 },
        { swimlaneLanes: PLACEMENTS, coalesce: true, pressedAt: 1 },
      );
    });
    expect(h.record.mock.calls[0]![0].coalescing).toBeDefined();
    h.record.mockClear();
    await act(async () => {
      await result.current.bulkOperations.moveMany(
        [A1, A2],
        { dayDelta: 2, laneDelta: 0 },
        { swimlaneLanes: PLACEMENTS, coalesce: true, pressedAt: 2 },
      );
    });
    // One composed step for the burst; composed steps carry no coalescing descriptor.
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].coalescing).toBeUndefined();
  });

  it('keeps the placements’ undo step, and the recalculation, when the lane write THROWS', async () => {
    h.writeLanes.mockRejectedValue(apiError(500));
    const { result } = setup();
    await act(async () => {
      await expect(
        result.current.bulkOperations.moveMany(
          [A1, A2],
          { dayDelta: 3, laneDelta: 0 },
          { swimlaneLanes: PLACEMENTS },
        ),
      ).rejects.toThrow();
    });
    expect(h.batchPlacements).toHaveBeenCalledTimes(1);
    expect(h.record).toHaveBeenCalledTimes(1);
    expect(h.record.mock.calls[0]![0].label).toBe('Move 2 activities');
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
  });

  it('refuses a batch the endpoint would refuse, naming the cap and offering no Refresh', async () => {
    const { result } = setup();
    const many = Array.from({ length: PLACEMENTS_BATCH_MAX + 1 }, (_, i) => ({
      id: `x${String(i)}`,
      lane: 0,
      from: { swimlaneId: 'S1', lane: 0 },
    }));
    let outcome;
    await act(async () => {
      outcome = await result.current.bulkOperations.moveMany(
        [A1],
        { dayDelta: 0, laneDelta: 0 },
        { swimlaneLanes: many },
      );
    });
    expect(outcome).toMatchObject({ applied: false, refreshable: false });
    expect(h.writeLanes).not.toHaveBeenCalled();
  });

  it('a stale version leaves the time part landed and reports the lane conflict', async () => {
    h.writeLanes.mockRejectedValue(apiError(409));
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.bulkOperations.moveMany(
        [A1, A2],
        { dayDelta: 2, laneDelta: 0 },
        { swimlaneLanes: PLACEMENTS },
      );
    });
    expect(outcome).toMatchObject({ applied: true, conflict: expect.stringContaining('changed') });
  });

  it('without swimlaneLanes it is the placements move it always was, lane delta and all', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.bulkOperations.moveMany([A1, A2], { dayDelta: 0, laneDelta: 1 });
    });
    const placements = h.batchPlacements.mock.calls[0]![0].placements as { laneIndex: number }[];
    expect(placements.map((p) => p.laneIndex)).toEqual([5, 6]);
    expect(h.writeLanes).not.toHaveBeenCalled();
  });
});

describe('onTsldCreate with swimlane (create on the swimlane layout)', () => {
  const draw = (swimlaneId: string | null) => ({
    name: 'Fix',
    type: 'TASK' as const,
    startDay: 2,
    endDay: 4,
    laneIndex: 0,
    swimlane: {
      swimlaneId,
      lane: 1,
      materialised: [{ id: 'a2', lane: 0, materialised: true as const }],
    },
  });

  it('files the new activity in the swimlane and gives it the first free swimlane-free lane', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldCreate(draw('S1'));
    });
    expect(h.createPlaced.mock.calls[0]![0]).toMatchObject({
      swimlaneId: 'S1',
      laneIndex: 0,
      name: 'Fix',
    });
  });

  it('sends no swimlane for "No swimlane"', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldCreate(draw(null));
    });
    expect(h.createPlaced.mock.calls[0]![0]).not.toHaveProperty('swimlaneId');
  });

  it('then writes its lane inside the swimlane, with the unplaced members, in one batch', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldCreate(draw('S1'));
    });
    expect(h.writeLanes).toHaveBeenCalledTimes(1);
    expect(h.writeLanes.mock.calls[0]![0].positions).toEqual([
      { id: 'new', version: 1, swimlane: { laneIndex: 1 } },
      { id: 'a2', version: 4, swimlane: { laneIndex: 0 } },
    ]);
  });

  it('records the create alone: undoing it deletes the row and its lane goes with it', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldCreate(draw('S1'));
    });
    expect(h.record).toHaveBeenCalledTimes(1);
  });

  it('a lane that could not be saved leaves the activity added and says so', async () => {
    h.writeLanes.mockRejectedValue(apiError(409));
    const { result } = setup();
    let outcome;
    await act(async () => {
      outcome = await result.current.onTsldCreate(draw('S1'));
    });
    expect(outcome).toEqual({ recalcConflict: expect.stringContaining('Activity added') });
  });

  it('off the swimlane layout a create writes only the activity', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.onTsldCreate({
        name: 'Fix',
        type: 'TASK',
        startDay: 2,
        endDay: 4,
        laneIndex: 3,
      });
    });
    expect(h.createPlaced.mock.calls[0]![0]).toMatchObject({ laneIndex: 3 });
    expect(h.createPlaced.mock.calls[0]![0]).not.toHaveProperty('swimlaneId');
    expect(h.writeLanes).not.toHaveBeenCalled();
  });
});
