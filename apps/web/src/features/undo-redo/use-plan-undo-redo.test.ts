import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { autoArrangeCommand, dependencyEditCommand, relaneCommand, type Command } from './commands';
import {
  REDO_FAILED_MESSAGE,
  UNDO_FAILED_MESSAGE,
  historyResultMessage,
  type PostedHistoryResult,
} from './history-result';
import { ReplayFailure } from './replay';
import type { PlanEditHistory, StepOutcome } from './use-plan-edit-history';
import { usePlanUndoRedo } from './use-plan-undo-redo';

import { activitiesQueryOptions } from '@/features/activities/api/use-activities';
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
  subjects: [],
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
    entries: vi.fn().mockReturnValue({ undo: [], redo: [] }),
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

function setup(
  history: PlanEditHistory,
  onResult?: (result: PostedHistoryResult) => void,
  reveal?: { onReveal: (activityId: string) => void; inPlan: readonly string[] },
) {
  const announce = vi.fn();
  const onLockLost = vi.fn();
  const onReplayed = vi.fn();
  const queryClient = new QueryClient();
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
  // What the refreshed list holds once the replay's invalidation has settled (the spy above stands
  // in for the refetch, so the cache is the answer).
  if (reveal)
    queryClient.setQueryData(
      activitiesQueryOptions('acme', 'p1').queryKey,
      reveal.inPlan.map((id) => anActivity({ id })),
    );
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
        ...(reveal ? { onReveal: reveal.onReveal } : {}),
      }),
    { wrapper },
  );
  return { result, announce, onLockLost, onReplayed, invalidateSpy };
}

beforeEach(() => vi.clearAllMocks());

describe('usePlanUndoRedo — what a press shows (undo-redo M4)', () => {
  it('reveals the first subject still in the plan, after the list has been refreshed', async () => {
    const onReveal = vi.fn();
    const step = command('Move “A”', { subjects: ['gone', 'a2', 'a3'] });
    const { result, invalidateSpy } = setup(
      fakeHistory({ undo: vi.fn().mockResolvedValue(applied(step)) }),
      undefined,
      { onReveal, inPlan: ['a3', 'a2'] },
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onReveal).toHaveBeenCalledExactlyOnceWith('a2'));
    // Joins the refetch the replay's own mutation started, rather than restarting it.
    expect(invalidateSpy).toHaveBeenCalledWith(expect.anything(), { cancelRefetch: false });
  });

  it('reveals on redo as well', async () => {
    const onReveal = vi.fn();
    const step = command('Add link', { subjects: ['a1', 'a2'] });
    const { result } = setup(
      fakeHistory({ redo: vi.fn().mockResolvedValue(applied(step)) }),
      undefined,
      {
        onReveal,
        inPlan: ['a1', 'a2'],
      },
    );
    act(() => result.current.redo());
    await waitFor(() => expect(onReveal).toHaveBeenCalledExactlyOnceWith('a1'));
  });

  it('reveals nothing when no subject survives — an undone create has no bar to show', async () => {
    const onReveal = vi.fn();
    const step = command('Add “A”', { subjects: ['a1'] });
    const { result, invalidateSpy } = setup(
      fakeHistory({ undo: vi.fn().mockResolvedValue(applied(step)) }),
      undefined,
      { onReveal, inPlan: ['other'] },
    );
    act(() => result.current.undo());
    // The reveal has run its refresh and found nobody to show — then, and only then, is "never
    // called" a statement about the answer rather than about timing.
    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('reveals nothing for a step that was set aside', async () => {
    const onReveal = vi.fn();
    const step = command('Move “A”', { subjects: ['a1'] });
    const outcome: StepOutcome = {
      kind: 'set-aside',
      command: step,
      reason: 'changed',
      subjectName: 'A',
      nextLabel: null,
    };
    const onResult = vi.fn();
    const { result } = setup(fakeHistory({ undo: vi.fn().mockResolvedValue(outcome) }), onResult, {
      onReveal,
      inPlan: ['a1'],
    });
    act(() => result.current.undo());
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('reveals nothing for a step that failed', async () => {
    const onReveal = vi.fn();
    const onResult = vi.fn();
    const { result } = setup(
      fakeHistory({ undo: vi.fn().mockRejectedValue(new Error('network')) }),
      onResult,
      { onReveal, inPlan: ['a1'] },
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onReveal).not.toHaveBeenCalled();
  });
});

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
    reason: 'changed' | 'gone' | 'parent-deleted' | 'duplicate' | 'cycle',
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
        expect.stringContaining('it is already there, so that step was skipped.'),
      ),
    );
  });

  it('says a cross-plan cycle would make a loop in the logic', async () => {
    const { result, announce } = setup(
      fakeHistory({ redo: vi.fn().mockResolvedValue(setAside('cycle')) }),
    );
    act(() => result.current.redo());
    await waitFor(() =>
      expect(announce).toHaveBeenCalledWith(
        expect.stringContaining('it would make a loop in the logic, so that step was skipped.'),
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

  /**
   * Review (B2): a replay that failed part-way knows what it left behind — an assignment removed and
   * possibly not back — and the generic "try again" line would hide exactly that.
   */
  it('a failure that knows the state it left says so, in place of the generic line', async () => {
    const onResult = vi.fn();
    const detail = '“Crane” was removed and could not be put back — assign it again.';
    const { result } = setup(
      fakeHistory({
        peekUndo: vi.fn().mockReturnValue(step),
        undo: vi.fn().mockRejectedValue(new ReplayFailure(detail, err(422))),
      }),
      onResult,
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult).toHaveBeenCalledWith({
      direction: 'undo',
      outcome: 'failed',
      label: step.label,
      detail,
    });
    expect(historyResultMessage({ ...onResult.mock.calls[0]![0], id: 1 })).toContain(detail);
  });

  it('a lost pen under such a failure still runs the pen contract, AND the planner is told', async () => {
    const onResult = vi.fn();
    const locked = err(423);
    const detail = '“Crane” was removed and could not be put back — assign it again.';
    const { result, onLockLost } = setup(
      fakeHistory({
        peekUndo: vi.fn().mockReturnValue(step),
        undo: vi.fn().mockRejectedValue(new ReplayFailure(detail, locked)),
      }),
      onResult,
    );
    act(() => result.current.undo());
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onLockLost).toHaveBeenCalledWith(locked);
    expect(onResult.mock.calls[0]![0]).toMatchObject({ outcome: 'failed', detail });
  });

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

describe('usePlanUndoRedo — undo and redo to a chosen step (undo-redo M7)', () => {
  const steps = [
    command('Move “A”'),
    command('Move “B”'),
    command('Move “C”'),
    command('Move “D”'),
  ];

  /** A double whose list shows `steps` in both directions, as the menu would have read it. */
  const hist = (over: Partial<PlanEditHistory> = {}) =>
    fakeHistory({
      entries: vi.fn().mockReturnValue({
        undo: steps.map((c) => c.label),
        redo: steps.map((c) => c.label),
      }),
      ...over,
    });

  /** A history double that undoes (or redoes) `steps` in order and answers each as scripted. */
  function scripted(answers: StepOutcome[], direction: 'undo' | 'redo' = 'undo') {
    const fn = vi.fn();
    for (const answer of answers) fn.mockResolvedValueOnce(answer);
    fn.mockResolvedValue(null);
    return hist(direction === 'undo' ? { undo: fn } : { redo: fn });
  }
  const setAside = (c: Command): StepOutcome => ({
    kind: 'set-aside',
    command: c,
    reason: 'changed',
    subjectName: 'Pour',
    nextLabel: null,
  });

  it('runs the steps in order and posts ONE summarising result', async () => {
    const onResult = vi.fn();
    const history = scripted(steps.slice(0, 3).map(applied));
    const { result, announce, onReplayed } = setup(history, onResult);
    act(() => result.current.undoTo(3, steps[2]!.label));
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(history.undo).toHaveBeenCalledTimes(3);
    expect(onResult).toHaveBeenCalledWith({
      direction: 'undo',
      outcome: 'done',
      label: 'Move “C”',
      command: steps[2],
      steps: { done: 3, total: 3 },
    });
    expect(announce).toHaveBeenCalledExactlyOnceWith('Undid 3 steps.');
    // The engine is told once for the whole run, not once per step.
    expect(onReplayed).toHaveBeenCalledTimes(1);
  });

  it('redoes to a step the same way', async () => {
    const onResult = vi.fn();
    const history = scripted(steps.slice(0, 2).map(applied), 'redo');
    const { result } = setup(history, onResult);
    act(() => result.current.redoTo(2, steps[1]!.label));
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(history.redo).toHaveBeenCalledTimes(2);
    expect(history.undo).not.toHaveBeenCalled();
    expect(onResult.mock.calls[0]![0]).toMatchObject({
      direction: 'redo',
      outcome: 'done',
      steps: { done: 2, total: 2 },
    });
  });

  it('stops at the first step that cannot apply, and says how far it got', async () => {
    const onResult = vi.fn();
    const history = scripted([applied(steps[0]!), applied(steps[1]!), setAside(steps[2]!)]);
    const { result, announce, onReplayed, invalidateSpy } = setup(history, onResult);
    act(() => result.current.undoTo(4, steps[3]!.label));
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    // The fourth step is never attempted: it was made on top of the one that did not apply.
    expect(history.undo).toHaveBeenCalledTimes(3);
    expect(onResult.mock.calls[0]![0]).toMatchObject({
      outcome: 'set-aside',
      label: 'Move “C”',
      steps: { done: 2, total: 4 },
    });
    expect(historyResultMessage({ ...onResult.mock.calls[0]![0], id: 1 })).toBe(
      'Undid 2 of 4 — stopped at move “C”: Pour was changed after your edit.',
    );
    // A refusal is the strip's `role="alert"`, so it is not announced as well.
    expect(announce).not.toHaveBeenCalled();
    // The two steps that DID run still recalculate; the set-aside refetches server truth.
    expect(onReplayed).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('a first step that cannot apply reads as an ordinary single press', async () => {
    const onResult = vi.fn();
    const { result, onReplayed } = setup(scripted([setAside(steps[0]!)]), onResult);
    act(() => result.current.undoTo(3, steps[2]!.label));
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult.mock.calls[0]![0]).not.toHaveProperty('steps');
    expect(onReplayed).not.toHaveBeenCalled();
  });

  it('a transport failure part-way stops the run and keeps the retry path', async () => {
    const onResult = vi.fn();
    const history = hist({
      undo: vi.fn().mockResolvedValueOnce(applied(steps[0]!)).mockRejectedValueOnce(err(500)),
      peekUndo: vi.fn().mockReturnValue(steps[1]),
    });
    const { result } = setup(history, onResult);
    act(() => result.current.undoTo(3, steps[2]!.label));
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(history.undo).toHaveBeenCalledTimes(2);
    expect(onResult.mock.calls[0]![0]).toMatchObject({
      outcome: 'failed',
      label: 'Move “B”',
      steps: { done: 1, total: 3 },
    });
  });

  it('a lost pen part-way runs the pen contract and posts nothing', async () => {
    const onResult = vi.fn();
    const history = hist({
      undo: vi.fn().mockResolvedValueOnce(applied(steps[0]!)).mockRejectedValueOnce(err(423)),
    });
    const { result, onLockLost, onReplayed } = setup(history, onResult);
    act(() => result.current.undoTo(3, steps[2]!.label));
    await waitFor(() => expect(onLockLost).toHaveBeenCalledTimes(1));
    expect(onResult).not.toHaveBeenCalled();
    // What ran is still recalculated.
    await waitFor(() => expect(onReplayed).toHaveBeenCalledTimes(1));
  });

  it('one step is an ordinary press, and reads as one', async () => {
    const onResult = vi.fn();
    const { result, announce } = setup(scripted([applied(steps[0]!)]), onResult);
    act(() => result.current.undoTo(1, steps[0]!.label));
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(onResult.mock.calls[0]![0]).not.toHaveProperty('steps');
    expect(announce).toHaveBeenCalledExactlyOnceWith('Undid move “A”.');
  });

  it('refuses, and says so, when the chosen row is no longer that step', async () => {
    const onResult = vi.fn();
    const history = scripted(steps.map(applied));
    const { result } = setup(history, onResult);
    act(() => result.current.undoTo(3, 'Something else'));
    await waitFor(() => expect(onResult).toHaveBeenCalledTimes(1));
    expect(history.undo).not.toHaveBeenCalled();
    expect(onResult.mock.calls[0]![0]).toMatchObject({
      outcome: 'blocked',
      reason: 'The history changed — open the list again.',
    });
  });

  it('is busy for the length of a run, and not before or after', async () => {
    let release: (outcome: StepOutcome) => void = () => undefined;
    const history = hist({
      undo: vi
        .fn()
        .mockImplementationOnce(() => new Promise<StepOutcome>((resolve) => (release = resolve)))
        .mockResolvedValue(applied(steps[1]!)),
    });
    const { result } = setup(history, vi.fn());
    expect(result.current.busy).toBe(false);
    act(() => result.current.undoTo(2, steps[1]!.label));
    expect(result.current.busy).toBe(true);
    act(() => release(applied(steps[0]!)));
    await waitFor(() => expect(result.current.busy).toBe(false));
  });

  it('ignores a single press while a run is in progress', async () => {
    let release: (outcome: StepOutcome) => void = () => undefined;
    const history = hist({
      undo: vi
        .fn()
        .mockImplementationOnce(() => new Promise<StepOutcome>((resolve) => (release = resolve)))
        .mockResolvedValue(applied(steps[1]!)),
    });
    const { result } = setup(history, vi.fn());
    act(() => result.current.undoTo(2, steps[1]!.label));
    act(() => result.current.undo());
    expect(history.undo).toHaveBeenCalledTimes(1);
    release(applied(steps[0]!));
    await waitFor(() => expect(history.undo).toHaveBeenCalledTimes(2));
  });

  it('exposes the store’s entries without changing its own identity as steps are recorded', () => {
    const entries = vi.fn().mockReturnValue({ undo: ['A'], redo: [] });
    const { result } = setup(hist({ entries }));
    expect(result.current.entries()).toEqual({ undo: ['A'], redo: [] });
  });
});
