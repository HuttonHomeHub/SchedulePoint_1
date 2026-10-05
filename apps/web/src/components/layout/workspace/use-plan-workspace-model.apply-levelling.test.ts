import type { ActivitySummary, LevellingApplication } from '@repo/types';
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlanWorkspaceModel } from './use-plan-workspace-model';

import { scheduleKeys } from '@/features/schedule';
import type { Command } from '@/features/undo-redo';
import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { fakePlanServer } from '@/test/fake-plan-server';

/**
 * **`applyLevelling` — the write, the one undo step and the hold** (`docs/specs/apply-levelled-dates/`
 * T2.3), proven against the real workspace model with only its leaf hooks stubbed.
 *
 * What these pin, each against the defect it names:
 *
 * - the rows reach `PATCH …/placements` **unchanged and in one request** — a client that rebuilt them
 *   could clear a constraint from a stale cache;
 * - ONE command is recorded, whose undo sends the preview's prior placements (null included) with the
 *   versions the forward write returned — an undo built from the cache would restore the wrong bars;
 * - the recalculation hold is released on **every** path, a throw included — a leaked hold stalls
 *   every later recalculation for the session with no error and no surface (ADR-0064);
 * - an empty preview never reaches the network.
 */

const h = vi.hoisted(() => ({
  record: vi.fn(),
  batch: vi.fn(),
  notify: vi.fn(),
  hold: vi.fn(),
  release: vi.fn(),
  announce: vi.fn(),
  onWriteRejected: vi.fn((): { kind: 'none' | 'lock' } => ({ kind: 'none' })),
  order: [] as string[],
}));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: false,
  NOTES_ENABLED: false,
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
  usePlanPen: () => ({ penManaged: false, holdsPen: true, onWriteRejected: h.onWriteRejected }),
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
// Partial: the helpers under test are the feature's real ones; only the hooks that need a server are stubbed.
vi.mock('@/features/schedule', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRecalculate: () => ({ mutateAsync: vi.fn() }),
  usePlanAutoRecalc: () => ({ notify: h.notify, hold: h.hold, release: h.release }),
}));
vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useActivities: () => query([] as ActivitySummary[]),
  useCreateActivity: () => ({ mutateAsync: vi.fn() }),
  useCreatePlacedActivity: () => ({ mutateAsync: vi.fn() }),
  useUpdateActivity: () => ({ mutateAsync: vi.fn() }),
  useRepositionLane: () => ({ mutateAsync: vi.fn() }),
  useSetActivityVisualStart: () => ({ mutateAsync: vi.fn() }),
  useBatchPositions: () => ({ mutateAsync: vi.fn() }),
  useBatchPlacements: () => ({ mutateAsync: h.batch }),
  useDeleteActivity: () => ({ mutateAsync: vi.fn() }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: (t: string) => t === 'START_MILESTONE' || t === 'FINISH_MILESTONE',
}));

let queryClient: QueryClient;
/** The plan as the forward write leaves it — what an undo's pre-check reads. */
let server: ReturnType<typeof fakePlanServer>;
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: queryClient }, children);

function preview(over: Partial<LevellingApplication> = {}): LevellingApplication {
  return {
    computedFrom: { scheduleComputedAt: '2026-03-01T00:00:00.000Z' },
    rows: [
      {
        id: 'a',
        version: 4,
        constraintType: null,
        constraintDate: null,
        visualStart: '2026-03-09',
        laneIndex: null,
      },
      {
        id: 'b',
        version: 6,
        constraintType: 'SNET',
        constraintDate: '2026-03-01',
        visualStart: '2026-03-16',
        laneIndex: null,
      },
    ],
    items: [
      {
        id: 'a',
        name: 'Lift A',
        code: null,
        beforeVisualStart: null,
        beforeDrawnStart: '2026-03-02',
        targetStart: '2026-03-09',
        wasPlaced: false,
        roundedToNextDay: false,
        reason: 'RESOURCE',
      },
      {
        id: 'b',
        name: 'Lift B',
        code: null,
        beforeVisualStart: '2026-03-04',
        beforeDrawnStart: '2026-03-04',
        targetStart: '2026-03-16',
        wasPlaced: true,
        roundedToNextDay: false,
        reason: 'RESOURCE',
      },
    ],
    leftToLogic: [],
    followingLinks: [],
    conflictingPlaced: [],
    laterThanBoundIntroduced: 0,
    projectFinishBefore: '2026-04-01',
    projectFinishAfter: '2026-04-08',
    remainingAfterApply: 0,
    ...over,
  };
}

function apply(application: LevellingApplication) {
  const { result } = renderHook(() => usePlanWorkspaceModel('acme', 'p1'), { wrapper });
  return act(() => result.current.applyLevelling(application));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.order = [];
  queryClient = new QueryClient();
  server = fakePlanServer({
    activities: [
      anActivity({ id: 'a', name: 'Lift A', version: 5, visualStart: '2026-03-09' }),
      anActivity({
        id: 'b',
        name: 'Lift B',
        version: 7,
        constraintType: 'SNET',
        constraintDate: '2026-03-01',
        visualStart: '2026-03-16',
      }),
    ],
  });
  h.onWriteRejected.mockReturnValue({ kind: 'none' });
  h.hold.mockImplementation(() => h.order.push('hold'));
  h.release.mockImplementation(() => h.order.push('release'));
  h.batch.mockImplementation(() => {
    h.order.push('write');
    return Promise.resolve([server.row('a'), server.row('b')]);
  });
});

/** After the forward write: further batches go through the fake server, which enforces the lock. */
function afterApply(): void {
  h.batch.mockClear();
  h.batch.mockImplementation(server.mutations.batchPlacements);
}

describe('applyLevelling — the write', () => {
  it('sends the preview’s rows unchanged, in ONE request, as { placements }', async () => {
    const application = preview();
    await expect(apply(application)).resolves.toEqual({
      applied: true,
      conflict: null,
      lostPen: false,
    });
    expect(h.batch).toHaveBeenCalledOnce();
    const body = h.batch.mock.calls[0]?.[0] as { placements: unknown };
    // Including the round-tripped constraint on `b`, which a client rebuilding rows would drop.
    expect(body).toEqual({ placements: application.rows });
  });

  it('never calls the batch for an empty preview, and takes no hold', async () => {
    await expect(apply(preview({ rows: [], items: [] }))).resolves.toEqual({
      applied: false,
      conflict: null,
      lostPen: false,
    });
    expect(h.batch).not.toHaveBeenCalled();
    expect(h.hold).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });

  it('holds the recalculation across the write and releases it after', async () => {
    await apply(preview());
    expect(h.order).toEqual(['hold', 'write', 'release']);
  });

  it('announces what moved and asks for one recalculation', async () => {
    await apply(preview());
    expect(h.announce).toHaveBeenCalledWith('Moved 2 activities to their levelled dates.');
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it('marks the preview stale without re-hitting its route while the dialog is still open', async () => {
    const queryKey = scheduleKeys.levellingApplication('acme', 'p1');
    const queryFn = vi.fn(() => Promise.resolve(preview()));
    // An observer is what the open dialog is: an active subscriber is the only thing an invalidation
    // refetches, so without one this test could not fail.
    const observer = new QueryObserver(queryClient, { queryKey, queryFn });
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledOnce());
    await apply(preview());
    await vi.waitFor(() => expect(queryClient.getQueryState(queryKey)?.isInvalidated).toBe(true));
    // An invalidation that refetched would have started the second call by now.
    expect(queryFn).toHaveBeenCalledOnce();
    expect(queryClient.getQueryState(queryKey)?.fetchStatus).toBe('idle');
    unsubscribe();
  });
});

describe('applyLevelling — one undo step', () => {
  it('records exactly one command, labelled with the count', async () => {
    await apply(preview());
    expect(h.record).toHaveBeenCalledOnce();
    expect((h.record.mock.calls[0]?.[0] as { label: string }).label).toBe(
      'Apply levelled dates (2 activities)',
    );
  });

  it('undoes by sending the prior placements — null included — at the versions the write returned', async () => {
    await apply(preview());
    const command = h.record.mock.calls[0]?.[0] as Command;
    afterApply();
    await command.undo(server.ctx);
    expect(h.batch).toHaveBeenCalledOnce();
    expect(h.batch).toHaveBeenCalledWith({
      placements: [
        {
          id: 'a',
          version: 5,
          constraintType: null,
          constraintDate: null,
          // Never hand-placed, so undo must put it back to NOT placed — not to a date.
          visualStart: null,
          laneIndex: null,
        },
        {
          id: 'b',
          version: 7,
          constraintType: 'SNET',
          constraintDate: '2026-03-01',
          visualStart: '2026-03-04',
          laneIndex: null,
        },
      ],
    });
  });

  it('redoes the same target dates, without re-running levelling', async () => {
    const application = preview();
    await apply(application);
    const command = h.record.mock.calls[0]?.[0] as Command;
    afterApply();
    await command.undo(server.ctx);
    h.batch.mockClear();
    await command.redo(server.ctx);
    const sent = (
      h.batch.mock.calls[0]?.[0] as { placements: { id: string; visualStart: string }[] }
    ).placements;
    expect(sent.map((p) => [p.id, p.visualStart])).toEqual([
      ['a', '2026-03-09'],
      ['b', '2026-03-16'],
    ]);
  });
});

describe('applyLevelling — undo and redo versions, and their failures', () => {
  it('redoes at the versions the undo returned, not the ones the forward write did', async () => {
    await apply(preview());
    const command = h.record.mock.calls[0]?.[0] as Command;
    afterApply();
    await command.undo(server.ctx); // the restore bumps both rows: 5 → 6 and 7 → 8
    h.batch.mockClear();
    await command.redo(server.ctx);
    const sent = (h.batch.mock.calls[0]?.[0] as { placements: { id: string; version: number }[] })
      .placements;
    expect(sent.map((p) => [p.id, p.version])).toEqual([
      ['a', 6],
      ['b', 8],
    ]);
  });

  it.each(['undo', 'redo'] as const)(
    'a refused %s is set aside, takes no recalculation hold of its own, and records nothing',
    async (direction) => {
      await apply(preview());
      const command = h.record.mock.calls[0]?.[0] as Command;
      expect(h.hold).toHaveBeenCalledOnce();
      expect(h.release).toHaveBeenCalledOnce();
      afterApply();
      if (direction === 'redo') await command.undo(server.ctx);
      h.batch.mockRejectedValue(new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }));
      await expect(command[direction](server.ctx)).resolves.toMatchObject({
        kind: 'not-applicable',
        reason: 'changed',
      });
      // The forward write's hold is the only one there ever is, and it was released.
      expect(h.hold).toHaveBeenCalledOnce();
      expect(h.release).toHaveBeenCalledOnce();
      expect(h.record).toHaveBeenCalledOnce();
    },
  );
});

describe('applyLevelling — refusals', () => {
  it('reports a stale version as a conflict, records nothing, and moves nothing on screen', async () => {
    h.batch.mockRejectedValue(new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' }));
    await expect(apply(preview())).resolves.toEqual({
      applied: false,
      conflict: expect.stringContaining('nothing was moved') as unknown,
      lostPen: false,
    });
    expect(h.record).not.toHaveBeenCalled();
    expect(h.announce).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it('reports a lost pen, hands the error to the pen, and releases the hold', async () => {
    h.batch.mockRejectedValue(new ApiFetchError(423, { code: 'LOCKED', message: 'locked' }));
    h.onWriteRejected.mockReturnValue({ kind: 'lock' });
    await expect(apply(preview())).resolves.toEqual({
      applied: false,
      conflict: null,
      lostPen: true,
    });
    expect(h.onWriteRejected).toHaveBeenCalledOnce();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it('releases the hold when the write throws, and lets the error out', async () => {
    h.batch.mockRejectedValue(new Error('network down'));
    await expect(apply(preview())).rejects.toThrow('network down');
    expect(h.hold).toHaveBeenCalledOnce();
    expect(h.release).toHaveBeenCalledOnce();
    expect(h.record).not.toHaveBeenCalled();
    expect(h.announce).not.toHaveBeenCalled();
  });

  it('refuses a preview it cannot describe before holding or writing anything', async () => {
    // A row with no description of it: the snapshot builder throws before the hold is taken, so
    // nothing is held, nothing is written, and the error is the caller's to show.
    const broken = preview({ items: [] });
    await expect(apply(broken)).rejects.toThrow(/no description/);
    expect(h.batch).not.toHaveBeenCalled();
    expect(h.hold).not.toHaveBeenCalled();
  });
});
