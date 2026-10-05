import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { autoArrangeCommand, dependencyEditCommand, relaneCommand, type Command } from './commands';
import {
  REDO_FAILED_MESSAGE,
  UNDO_FAILED_MESSAGE,
  type PostedHistoryResult,
} from './history-result';
import type { PlanEditHistory, StepOutcome } from './use-plan-edit-history';
import { usePlanUndoRedo } from './use-plan-undo-redo';

import { ApiFetchError } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { aDependency, detailReader, fakePlanServer, pagedReader } from '@/test/fake-plan-server';

// The replay reads the plan through `fetchQuery`; the one test that exercises it answers from a fake.
const reader = vi.hoisted(() => ({
  current: (_path: string): Promise<unknown[]> => Promise.resolve([]),
  one: (_path: string): Promise<unknown> => Promise.resolve(undefined),
}));
vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetchAllPages: (path: string) => reader.current(path),
  apiFetch: (path: string) => reader.one(path),
}));

/**
 * The ADR-0176 replay contract around the store. The store's own suite covers stacks and coalescing;
 * here the store is a double whose undo/redo resolve to an outcome or reject, so each branch can be
 * asserted: applied → announce + recalculate; set aside → refetch + a result in words; 423 → the pen
 * contract with the history KEPT; anything else → a retryable failure.
 */

const err = (status: number, details?: unknown): ApiFetchError =>
  new ApiFetchError(status, {
    code: 'X',
    message: 'nope',
    ...(details === undefined ? {} : { details }),
  });

const command = (label: string, over: Partial<Command> = {}): Command => ({
  label,
  undo: vi.fn(),
  redo: vi.fn(),
  ...over,
});
const applied = (c: Command): StepOutcome => ({ kind: 'applied', command: c });

/** A minimal history double whose undo/redo resolve or reject as the test sets up. */
function fakeHistory(over: Partial<PlanEditHistory> = {}): PlanEditHistory {
  return {
    record: vi.fn(),
    isTop: vi.fn().mockReturnValue(false),
    peekUndo: vi.fn().mockReturnValue(undefined),
    peekRedo: vi.fn().mockReturnValue(undefined),
    undo: vi.fn().mockResolvedValue(applied(command('Move activity'))),
    redo: vi.fn().mockResolvedValue(applied(command('Add link'))),
    clear: vi.fn(),
    clearRedo: vi.fn(),
    canUndo: true,
    canRedo: true,
    undoLabel: 'Move activity',
    redoLabel: 'Add link',
    ...over,
  };
}

function setup(history: PlanEditHistory, onResult?: (result: PostedHistoryResult) => void) {
  const announce = vi.fn();
  const onLockLost = vi.fn();
  const onReplayed = vi.fn();
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(
    () =>
      usePlanUndoRedo({
        history,
        orgSlug: 'acme',
        planId: 'p1',
        announce,
        onLockLost,
        onReplayed,
        ...(onResult ? { onResult } : {}),
      }),
    { wrapper },
  );
  return { result, announce, onLockLost, onReplayed, invalidateSpy };
}

beforeEach(() => vi.clearAllMocks());

describe('usePlanUndoRedo — success', () => {
  it('announces the executed step label on a successful undo / redo', async () => {
    const { result, announce } = setup(fakeHistory());
    act(() => result.current.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Undid move activity.'));
    act(() => result.current.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Redid add link.'));
  });

  it('exposes the store’s canUndo/canRedo + labels', () => {
    const { result } = setup(fakeHistory({ canUndo: true, canRedo: false, redoLabel: null }));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.undoLabel).toBe('Move activity');
    expect(result.current.redoLabel).toBeNull();
  });

  it('returns the same object across renders even when the host passes a fresh onReplayed each time', () => {
    const history = fakeHistory();
    // Stable, as the workspace's own `announce` and `pen.onWriteRejected` are.
    const announce = vi.fn();
    const onLockLost = vi.fn();
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result, rerender } = renderHook(
      () =>
        usePlanUndoRedo({
          history,
          orgSlug: 'acme',
          planId: 'p1',
          announce,
          onLockLost,
          onReplayed: () => undefined,
        }),
      { wrapper },
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

/**
 * What a replay reads, and how much it costs (ADR-0176). A step that names a few rows reads those
 * rows; the plan's list is paged and walked sequentially, so only a step above `SINGLE_READ_LIMIT`
 * walks it.
 */
describe('usePlanUndoRedo — the replay context’s reads', () => {
  /** Run one undo whose command body uses the context, and report what the network saw. */
  async function reading(body: (ctx: Parameters<PlanEditHistory['undo']>[0]) => Promise<unknown>) {
    const server = fakePlanServer({
      activities: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((id) =>
        anActivity({ id, name: id, parentId: id === 'a2' ? 'a1' : null }),
      ),
      dependencies: [aDependency()],
    });
    const paged = vi.fn(pagedReader(server));
    const one = vi.fn(detailReader(server));
    reader.current = paged;
    reader.one = one;
    const undo = vi.fn(async (ctx: Parameters<PlanEditHistory['undo']>[0]) => {
      await body(ctx);
      return applied(command('Edit “Excavate”'));
    });
    const { result, announce } = setup(fakeHistory({ undo }));
    act(() => result.current.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Undid edit “Excavate”.'));
    return { paged, one };
  }

  it('a single-row step is exactly one detail read and no list walk', async () => {
    let found: string[] = [];
    const { paged, one } = await reading(async (ctx) => {
      found = [...(await ctx.readActivities(['a1'])).keys()];
    });
    expect(found).toEqual(['a1']);
    expect(one).toHaveBeenCalledOnce();
    expect(one.mock.calls[0]?.[0]).toBe('/organizations/acme/activities/a1');
    expect(paged).not.toHaveBeenCalled();
  });

  it('a row the server answers 404 for is simply absent', async () => {
    let found: string[] = ['x'];
    await reading(async (ctx) => {
      found = [...(await ctx.readActivities(['ghost'])).keys()];
    });
    expect(found).toEqual([]);
  });

  it('a link is one detail read too', async () => {
    let found: string[] = [];
    const { paged, one } = await reading(async (ctx) => {
      found = [...(await ctx.readDependencies(['d1'])).keys()];
    });
    expect(found).toEqual(['d1']);
    expect(one).toHaveBeenCalledExactlyOnceWith('/organizations/acme/dependencies/d1');
    expect(paged).not.toHaveBeenCalled();
  });

  it('a bulk step walks the plan list once, and makes no per-row read', async () => {
    let found: string[] = [];
    const { paged, one } = await reading(async (ctx) => {
      found = [...(await ctx.readActivities(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])).keys()];
    });
    expect(found).toHaveLength(6);
    expect(paged).toHaveBeenCalledOnce();
    expect(paged.mock.calls[0]?.[0]).toMatch(/\/plans\/p1\/activities$/);
    expect(one).not.toHaveBeenCalled();
  });

  it('the links on a few rows are read per row (predecessors and successors), not from the plan list', async () => {
    let found: string[] = [];
    const { paged } = await reading(async (ctx) => {
      found = [...(await ctx.readLinksOf(['a1'])).keys()];
    });
    expect(found).toEqual(['d1']);
    expect(paged.mock.calls.map((c) => c[0])).toEqual([
      '/organizations/acme/activities/a1/predecessors',
      '/organizations/acme/activities/a1/successors',
    ]);
  });

  it('the links on a bulk step come from one walk of the plan’s links', async () => {
    const { paged } = await reading(async (ctx) => {
      await ctx.readLinksOf(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    });
    expect(paged).toHaveBeenCalledOnce();
    expect(paged.mock.calls[0]?.[0]).toMatch(/\/plans\/p1\/dependencies$/);
  });

  it('children are found by one walk of the plan list', async () => {
    let found: string[] = [];
    const { paged } = await reading(async (ctx) => {
      found = [...(await ctx.readChildrenOf(['a1'])).keys()];
    });
    expect(found).toEqual(['a2']);
    expect(paged).toHaveBeenCalledOnce();
  });
});

/**
 * F-2 (undo-redo-best-in-class M0-T2): the structure signature cannot see a sub-day duration, a lag
 * in minutes or a calendar, so an inverse that restores one never recalculated. A successful replay
 * now says so itself, except for the layout-only commands that declare `affectsSchedule: false`.
 */
describe('usePlanUndoRedo — recalculation after a replay', () => {
  const noop = vi.fn();
  const row = aDependency();
  const lag = dependencyEditCommand({
    updateDependency: noop,
    before: row,
    after: { ...row, lagMinutes: 90, version: 2 },
    label: 'Edit link',
  });
  const relane = relaneCommand({
    repositionLane: noop,
    activityId: 'a1',
    fromLaneIndex: 0,
    toLaneIndex: 1,
    saved: anActivity({ id: 'a1', laneIndex: 1 }),
    activityName: 'Excavate',
  });
  const arrange = autoArrangeCommand({ batchPositions: noop, before: [], after: [], saved: [] });

  it('a schedule-affecting command defaults to affecting the schedule', () => {
    expect(lag.affectsSchedule).not.toBe(false);
  });

  it('the two layout-only builders declare they do not', () => {
    expect(relane.affectsSchedule).toBe(false);
    expect(arrange.affectsSchedule).toBe(false);
  });

  it('notifies after a successful undo and redo of a schedule-affecting step', async () => {
    const { result, onReplayed } = setup(
      fakeHistory({
        undo: vi.fn().mockResolvedValue(applied(lag)),
        redo: vi.fn().mockResolvedValue(applied(lag)),
      }),
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onReplayed).toHaveBeenCalledTimes(1));
    act(() => result.current.redo());
    await waitFor(() => expect(onReplayed).toHaveBeenCalledTimes(2));
  });

  it('does not notify after a lane-only replay', async () => {
    const { result, announce, onReplayed } = setup(
      fakeHistory({
        undo: vi.fn().mockResolvedValue(applied(relane)),
        redo: vi.fn().mockResolvedValue(applied(arrange)),
      }),
    );
    act(() => result.current.undo());
    await waitFor(() => expect(announce).toHaveBeenCalled());
    act(() => result.current.redo());
    await waitFor(() => expect(announce).toHaveBeenCalledTimes(2));
    expect(onReplayed).not.toHaveBeenCalled();
  });

  it('does not notify when the replay failed, was set aside, or there was nothing to replay', async () => {
    const failing = setup(fakeHistory({ undo: vi.fn().mockRejectedValue(err(500)) }));
    act(() => failing.result.current.undo());
    await waitFor(() => expect(failing.announce).toHaveBeenCalledWith(UNDO_FAILED_MESSAGE));
    expect(failing.onReplayed).not.toHaveBeenCalled();

    const aside = setup(
      fakeHistory({
        undo: vi.fn().mockResolvedValue({
          kind: 'set-aside',
          command: lag,
          reason: 'changed',
          subjectName: 'Excavate',
          nextLabel: null,
        }),
      }),
    );
    act(() => aside.result.current.undo());
    await waitFor(() => expect(aside.announce).toHaveBeenCalled());
    expect(aside.onReplayed).not.toHaveBeenCalled();

    const empty = setup(fakeHistory({ undo: vi.fn().mockResolvedValue(null) }));
    act(() => empty.result.current.undo());
    await waitFor(() => expect(empty.result.current.canUndo).toBe(true));
    expect(empty.onReplayed).not.toHaveBeenCalled();
  });
});

describe('usePlanUndoRedo — a step that cannot apply is set aside', () => {
  const setAside = (
    reason: 'changed' | 'gone' | 'parent-deleted' | 'duplicate',
    nextLabel: string | null = 'Edit “Pour”',
  ): StepOutcome => ({
    kind: 'set-aside',
    command: command('Move “Foundations”'),
    reason,
    subjectName: 'Foundations',
    nextLabel,
  });

  it('says what changed, that the step was skipped, and what the next press runs', async () => {
    const { result, announce } = setup(
      fakeHistory({ undo: vi.fn().mockResolvedValue(setAside('changed')) }),
    );
    act(() => result.current.undo());
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        'Couldn’t undo move “Foundations” — Foundations was changed after your edit, ' +
          'so that step was skipped. Undo again to continue with edit “Pour”.',
      ),
    );
  });

  it('says a deleted row was deleted', async () => {
    const { result, announce } = setup(
      fakeHistory({ undo: vi.fn().mockResolvedValue(setAside('gone', null)) }),
    );
    act(() => result.current.undo());
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        'Couldn’t undo move “Foundations” — Foundations was deleted after your edit, ' +
          'so that step was skipped.',
      ),
    );
  });

  it('keeps the phase words for a restore the server refused', async () => {
    const { result, announce } = setup(
      fakeHistory({ undo: vi.fn().mockResolvedValue(setAside('parent-deleted', null)) }),
    );
    act(() => result.current.undo());
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        expect.stringContaining('the phase it was filed under was deleted after your edit'),
      ),
    );
  });

  it('says a duplicate link already exists', async () => {
    const { result, announce } = setup(
      fakeHistory({ redo: vi.fn().mockResolvedValue(setAside('duplicate')) }),
    );
    act(() => result.current.redo());
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        expect.stringContaining('that link already exists, so that step was skipped.'),
      ),
    );
  });

  it('refetches server truth, and neither clears the history nor runs the pen contract', async () => {
    const history = fakeHistory({ undo: vi.fn().mockResolvedValue(setAside('changed')) });
    const { result, onLockLost, invalidateSpy } = setup(history);
    act(() => result.current.undo());
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    expect(history.clear).not.toHaveBeenCalled();
    expect(onLockLost).not.toHaveBeenCalled();
    const keys = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
    expect(keys).toContainEqual(JSON.stringify(['activities', 'acme', 'plan', 'p1']));
    expect(keys).toContainEqual(JSON.stringify(['schedule', 'acme']));
  });
});

describe('usePlanUndoRedo — 423 pen lost (the history is kept)', () => {
  it('runs the shared pen contract WITHOUT a second announcement and WITHOUT clearing the history', async () => {
    const history = fakeHistory({ undo: vi.fn().mockRejectedValue(err(423)) });
    const { result, announce, onLockLost } = setup(history);

    act(() => result.current.undo());

    // The shared pen contract (the `EditLockBanner`'s own live region) is the single source of the
    // pen-loss announcement — this feature must NOT `announce(...)` a second, near-identical utterance.
    await waitFor(() => expect(onLockLost).toHaveBeenCalledTimes(1));
    // ADR-0176 D4: the history belongs to the page session, not the pen — every step is checked
    // against the server before it writes, so a hand-off no longer has to destroy it.
    expect(history.clear).not.toHaveBeenCalled();
    expect(history.clearRedo).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
  });
});

describe('usePlanUndoRedo — other errors (leave stacks intact)', () => {
  it('announces a generic status and does not mutate the stacks', async () => {
    const history = fakeHistory({ redo: vi.fn().mockRejectedValue(err(500)) });
    const { result, announce, onLockLost, invalidateSpy } = setup(history);

    act(() => result.current.redo());

    await waitFor(() => expect(announce).toHaveBeenCalledWith(REDO_FAILED_MESSAGE));
    expect(history.clear).not.toHaveBeenCalled();
    expect(history.clearRedo).not.toHaveBeenCalled();
    expect(onLockLost).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('a non-ApiFetchError on undo is the generic branch too', async () => {
    const history = fakeHistory({ undo: vi.fn().mockRejectedValue(new Error('boom')) });
    const { result, announce } = setup(history);
    act(() => result.current.undo());
    await waitFor(() => expect(announce).toHaveBeenCalledWith(UNDO_FAILED_MESSAGE));
  });
});

/**
 * M1-T2: an outcome is handed to the dock as a RESULT, and each event is spoken exactly once — a
 * success through the polite region, a failure by the strip's `role="alert"` (ADR-0132).
 */
describe('usePlanUndoRedo — results for the dock strip', () => {
  const step = command('Edit “Excavate”');

  it('a success posts a `done` result bound to its step and announces once', async () => {
    const onResult = vi.fn();
    const { result, announce } = setup(
      fakeHistory({ undo: vi.fn().mockResolvedValue(applied(step)) }),
      onResult,
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith({
      direction: 'undo',
      outcome: 'done',
      label: step.label,
      command: step,
    });
    expect(announce).toHaveBeenCalledExactlyOnceWith('Undid edit “Excavate”.');
  });

  it('a redo success posts the redo direction', async () => {
    const onResult = vi.fn();
    const { result } = setup(
      fakeHistory({ redo: vi.fn().mockResolvedValue(applied(step)) }),
      onResult,
    );
    act(() => result.current.redo());
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'redo', outcome: 'done' }),
    );
  });

  it('a set-aside posts a `set-aside` result carrying why and what is next, and is NOT also announced', async () => {
    const onResult = vi.fn();
    const { result, announce } = setup(
      fakeHistory({
        undo: vi.fn().mockResolvedValue({
          kind: 'set-aside',
          command: step,
          reason: 'gone',
          subjectName: 'Excavate',
          nextLabel: 'Add “Pour”',
        }),
      }),
      onResult,
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith({
      direction: 'undo',
      outcome: 'set-aside',
      label: step.label,
      setAside: { reason: 'gone', subjectName: 'Excavate', nextLabel: 'Add “Pour”' },
    });
    expect(announce).not.toHaveBeenCalled();
  });

  const failures: [string, unknown][] = [
    ['a 500', err(500)],
    ['a thrown Error', new Error('boom')],
  ];
  for (const [name, error] of failures) {
    it(`${name} posts a \`failed\` result and is NOT also announced`, async () => {
      const onResult = vi.fn();
      const { result, announce } = setup(
        fakeHistory({
          peekUndo: vi.fn().mockReturnValue(step),
          undo: vi.fn().mockRejectedValue(error),
        }),
        onResult,
      );
      act(() => result.current.undo());
      await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
      expect(onResult).toHaveBeenCalledWith({
        direction: 'undo',
        outcome: 'failed',
        label: step.label,
      });
      expect(announce).not.toHaveBeenCalled();
    });
  }

  it('a lost pen posts nothing — the pen banner is its one announcer', async () => {
    const onResult = vi.fn();
    const { result, onLockLost } = setup(
      fakeHistory({ undo: vi.fn().mockRejectedValue(err(423)) }),
      onResult,
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onLockLost).toHaveBeenCalledTimes(1));
    expect(onResult).not.toHaveBeenCalled();
  });

  it('nothing to undo posts nothing', async () => {
    const onResult = vi.fn();
    const history = fakeHistory({ undo: vi.fn().mockResolvedValue(null) });
    const { result } = setup(history, onResult);
    act(() => result.current.undo());
    await waitFor(() => expect(history.undo).toHaveBeenCalled());
    expect(onResult).not.toHaveBeenCalled();
  });
});
