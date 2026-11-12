import type { ActivitySummary } from '@repo/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutoResolveOverlaps } from './use-auto-resolve-overlaps';
import { useFollowLogicOffer } from './use-follow-logic-offer';

import type { Command } from '@/features/undo-redo';
import { APPLIED } from '@/features/undo-redo/replay';
import { usePlanEditHistory } from '@/features/undo-redo/use-plan-edit-history';
import { anActivity } from '@/test/activity-fixture';
import { fakePlanServer } from '@/test/fake-plan-server';

/** A replay context for steps that never read it. */
const { ctx } = fakePlanServer();

/**
 * **The follow-logic offer's state machine** (placed-bar-follows-link M2, ADR-0216), composed with
 * `useAutoResolveOverlaps` exactly as the workspace model composes them: `begin` takes both
 * snapshots, a settle resolves overlaps first, and the offer is decided from that hook's
 * `afterResolve`, so it binds to the step actually on top.
 */

function bar(id: string, overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return anActivity({
    id,
    name: id,
    laneIndex: id.charCodeAt(0) - 65,
    visualStart: '2026-02-01',
    visualConflictReason: null,
    visualEffectiveStart: '2026-02-01',
    visualEffectiveFinish: '2026-02-05',
    ...overrides,
  });
}
const early = { visualConflictReason: 'EARLIER_THAN_LOGIC' } as const;

/** A recorded edit: the step the planner's change left on top of the undo stack. */
function edit(label: string): Command {
  return {
    label,
    subjects: [],
    undo: () => Promise.resolve(APPLIED),
    redo: () => Promise.resolve(APPLIED),
  };
}

interface Harness {
  rows: ActivitySummary[];
  enabled: boolean;
  settled: number;
  pendingEdits: number;
  writing: boolean;
}

function setup(initial: Partial<Harness> = {}) {
  const state: Harness = {
    rows: [bar('A'), bar('B'), bar('C')],
    enabled: true,
    settled: 0,
    pendingEdits: 0,
    writing: false,
    ...initial,
  };
  const announce = vi.fn();
  const batchPositions = vi.fn(() => Promise.resolve([] as ActivitySummary[]));
  const view = renderHook(
    (props: Harness) => {
      const history = usePlanEditHistory('p1');
      const follow = useFollowLogicOffer({
        enabled: props.enabled,
        settled: props.settled,
        pendingEdits: props.pendingEdits,
        isWriting: () => props.writing,
        readActivities: () => props.rows,
        history,
        announce,
      });
      const resolve = useAutoResolveOverlaps({
        enabled: props.enabled,
        settled: props.settled,
        pendingEdits: props.pendingEdits,
        readActivities: () => props.rows,
        isWriting: () => props.writing,
        batchPositions,
        readSwimlaneInput: () => null,
        writeLayouts: vi.fn() as never,
        history,
        announce,
        onWriteRejected: vi.fn(),
        afterResolve: follow.evaluate,
      });
      return { history, follow, resolve };
    },
    { initialProps: { ...state } },
  );
  const settle = (next: Partial<Harness> = {}): void => {
    Object.assign(state, next, { settled: state.settled + 1 });
    view.rerender({ ...state });
  };
  /** What an edit does: both snapshots first, then its step lands on the stack. */
  const planEdit = (label: string): Command => {
    const step = edit(label);
    act(() => {
      view.result.current.resolve.begin(['B']);
      view.result.current.follow.begin();
      view.result.current.history.record(step);
    });
    return step;
  };
  return { view, state, settle, announce, batchPositions, planEdit };
}

describe('useFollowLogicOffer', () => {
  it('raises one offer naming the bar the edit newly stranded, announced once, bound to the top step', async () => {
    const { view, settle, announce, planEdit } = setup();
    const step = planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    const { offer } = view.result.current.follow;
    expect(offer?.ids).toEqual(['B']);
    expect(offer?.command).toBe(step);
    expect(offer?.message).toBe('“B” stays where you placed it, before its logic allows.');
    expect(offer?.phase).toBe('idle');
    // Nothing is said at the raise: a strip hidden behind a higher band would be announced unseen.
    expect(announce).not.toHaveBeenCalled();
    // It is said once, when the strip reports it is on screen, however often that is reported.
    act(() => view.result.current.follow.announceShown());
    act(() => view.result.current.follow.announceShown());
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(offer?.message);
  });

  it('names several bars in one offer', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C', early)] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    expect(view.result.current.follow.offer?.ids).toEqual(['B', 'C']);
    expect(view.result.current.follow.offer?.message).toBe(
      '“B” and 1 other stay where you placed them, before their logic allows.',
    );
  });

  it('raises nothing when no placed bar is newly flagged', async () => {
    const { view, settle, announce, planEdit } = setup();
    planEdit('Add link');
    act(() => settle());
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('never offers a bar whose own placement the edit wrote', async () => {
    const { view, settle, announce, planEdit } = setup();
    planEdit('Drag B');
    act(() =>
      settle({ rows: [bar('A'), bar('B', { ...early, visualStart: '2026-01-05' }), bar('C')] }),
    );
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('never offers a summary', async () => {
    const { view, settle, planEdit } = setup({
      rows: [bar('A'), bar('B', { type: 'WBS_SUMMARY' })],
    });
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', { type: 'WBS_SUMMARY', ...early })] }));
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('waits for the settle: the flag does not exist until the engine has dated the plan', async () => {
    const { view, state, planEdit } = setup();
    planEdit('Lengthen A');
    state.rows = [bar('A'), bar('B', early), bar('C')];
    view.rerender({ ...state });
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('keeps the FIRST snapshot across a burst, so one offer covers it, bound to the step on top', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Add link');
    const second = planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    expect(view.result.current.follow.offer?.command).toBe(second);
  });

  it('is decided AFTER the overlap resolution, so it binds to the step that resolution recorded', async () => {
    // Two bars share lane 0 once B is stretched: auto-resolve moves it and records its own step. The
    // offer must bind to THAT step, which is on top, or it would be withdrawn the moment it was raised.
    const { view, settle, batchPositions, planEdit } = setup({
      rows: [
        bar('A', {
          laneIndex: 0,
          visualEffectiveStart: '2026-01-01',
          visualEffectiveFinish: '2026-01-05',
        }),
        bar('B', {
          laneIndex: 0,
          visualEffectiveStart: '2026-01-10',
          visualEffectiveFinish: '2026-01-15',
        }),
      ],
    });
    batchPositions.mockImplementation(() =>
      Promise.resolve([bar('A', { laneIndex: 0, version: 2 })]),
    );
    planEdit('Lengthen A');
    act(() =>
      settle({
        rows: [
          bar('A', {
            laneIndex: 0,
            visualEffectiveStart: '2026-01-01',
            visualEffectiveFinish: '2026-01-12',
          }),
          bar('B', {
            laneIndex: 0,
            visualEffectiveStart: '2026-01-10',
            visualEffectiveFinish: '2026-01-15',
            ...early,
          }),
        ],
      }),
    );
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    expect(batchPositions).toHaveBeenCalledTimes(1);
    expect(view.result.current.history.undoLabel).toBe('Move activity clear of an overlap');
    expect(view.result.current.history.isTop(view.result.current.follow.offer!.command)).toBe(true);
  });

  it('is withdrawn when a later edit lands on the stack', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => view.result.current.history.record(edit('Rename C')));
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('is withdrawn by an undo or redo, and does not come back when its step is on top again', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => view.result.current.follow.noteReplay());
    expect(view.result.current.follow.offer).toBeNull();
    // The replay left the offer's step on top; a derived-only offer would reappear here.
    expect(view.result.current.history.isTop(view.result.current.history.peekUndo()!)).toBe(true);
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('goes BUSY on Follow logic rather than being consumed: the strip stays, says Moving, and a second press starts nothing', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C', early)] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    let started: readonly string[] | null = null;
    act(() => {
      started = view.result.current.follow.start();
    });
    expect(started).toEqual(['B', 'C']);
    // **Verified red** by clearing the offer in `start`: the strip then vanishes on the press, and a
    // write that fails leaves the planner with no sign that nothing happened (B1).
    expect(view.result.current.follow.offer).toMatchObject({
      phase: 'busy',
      message: 'Moving “B” and 1 other…',
    });
    act(() => {
      started = view.result.current.follow.start();
    });
    expect(started, 'no double-submit').toBeNull();
  });

  it('stays, says why and can be tried again after a failure; the pen going defers to the banner', async () => {
    const { view, settle, announce, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => void view.result.current.follow.start());
    act(() => view.result.current.follow.fail('Couldn’t move “B” just now. Nothing was changed.'));
    expect(view.result.current.follow.offer).toMatchObject({
      phase: 'failed',
      message: 'Couldn’t move “B” just now. Nothing was changed.',
    });
    expect(announce).toHaveBeenCalledWith('Couldn’t move “B” just now. Nothing was changed.');
    // Try again starts it afresh.
    let started: readonly string[] | null = null;
    act(() => {
      started = view.result.current.follow.start();
    });
    expect(started).toEqual(['B']);
    // A lost pen goes back to asking: the shared banner says why.
    act(() => view.result.current.follow.restore());
    expect(view.result.current.follow.offer).toMatchObject({
      phase: 'idle',
      message: '“B” stays where you placed it, before its logic allows.',
    });
  });

  it('keeps saying Moving until the recalculation settles, then confirms; a later undo does not bring it back', async () => {
    const { view, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => void view.result.current.follow.start());
    // The write lands: its step is recorded and the offer rebinds to it.
    const followStep = edit('Follow logic');
    act(() => {
      view.result.current.resolve.begin(['B']);
      view.result.current.follow.begin();
      view.result.current.history.record(followStep);
      view.result.current.follow.succeed(followStep);
    });
    expect(view.result.current.follow.offer).toMatchObject({
      phase: 'moving',
      command: followStep,
    });
    expect(view.result.current.follow.offer?.message).toBe('Moving “B”…');
    // The recalculation lands: the bars have moved.
    act(() => settle({ rows: [bar('A'), bar('B', { visualStart: null }), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer?.phase).toBe('done'));
    expect(view.result.current.follow.offer?.message).toBe(
      '“B” now follows its logic; dates will update.',
    );
    act(() => view.result.current.follow.noteReplay());
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('is dismissed by Keep it here, writes nothing, and says so', async () => {
    const { view, settle, announce, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    let kept: readonly string[] = [];
    act(() => {
      kept = view.result.current.follow.keep();
    });
    expect(kept, 'hands back the bars it was about, for the whole-plan offer').toEqual(['B']);
    expect(view.result.current.follow.offer).toBeNull();
    expect(view.result.current.follow.start()).toBeNull();
    expect(announce).toHaveBeenCalledWith('Kept “B” where you placed it; it stays flagged.');
  });

  it('drops a snapshot a settle passed over, rather than diffing a later edit against an older before', () => {
    // **Verified red** by keeping the held snapshot unconditionally (the first-snapshot rule alone):
    // the second edit is then diffed against the picture before the FIRST, so B reads as newly
    // stranded by an edit that did not strand it.
    const { result, rerender } = renderHook(
      (props: { settled: number; rows: ActivitySummary[] }) => {
        const history = usePlanEditHistory('p1');
        const follow = useFollowLogicOffer({
          enabled: true,
          settled: props.settled,
          pendingEdits: 0,
          isWriting: () => false,
          readActivities: () => props.rows,
          history,
          announce: vi.fn(),
        });
        return { history, follow };
      },
      { initialProps: { settled: 0, rows: [bar('A'), bar('B'), bar('C')] } },
    );
    act(() => result.current.follow.begin());
    // A settle passes and nobody evaluates (a skipped resolution): B is now flagged, as of edit one.
    const flagged = [bar('A'), bar('B', early), bar('C')];
    rerender({ settled: 1, rows: flagged });
    act(() => {
      result.current.follow.begin();
      result.current.history.record(edit('Second edit'));
    });
    act(() => result.current.follow.evaluate());
    expect(
      result.current.follow.offer,
      'B was already flagged when the second edit began, so it is not newly stranded',
    ).toBeNull();
  });

  it('does not tick on after the workspace is left: the look-again timer is cleared', () => {
    vi.useFakeTimers();
    try {
      const announce = vi.fn();
      const { result, unmount } = renderHook(() => {
        const history = usePlanEditHistory('p1');
        return useFollowLogicOffer({
          enabled: true,
          settled: 0,
          pendingEdits: 0,
          isWriting: () => true,
          readActivities: () => [bar('A', early)],
          history,
          announce,
        });
      });
      act(() => result.current.begin());
      act(() => result.current.evaluate());
      unmount();
      vi.advanceTimersByTime(20_000);
      expect(announce).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('raises nothing without the pen, and withdraws an offer when the pen goes', async () => {
    const lost = setup({ enabled: false });
    lost.planEdit('Lengthen A');
    act(() => lost.settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await new Promise((done) => setTimeout(done, 20));
    expect(lost.view.result.current.follow.offer).toBeNull();

    const { view, state, settle, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => view.rerender({ ...state, enabled: false }));
    expect(view.result.current.follow.offer).toBeNull();
    act(() => view.rerender({ ...state, enabled: true }));
    expect(view.result.current.follow.offer).toBeNull();
  });

  it('waits out a write in flight rather than reading a cache that may hold half an edit', async () => {
    const { view, state, settle, planEdit } = setup();
    planEdit('Lengthen A');
    state.writing = true;
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
    state.writing = false;
    // The hooks read `isWriting` from the latest render's props, so the write finishing is a render.
    view.rerender({ ...state });
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull(), { timeout: 2000 });
  });

  it('raises nothing for an edit that recorded no step: an offer bound to nothing would outlive it', async () => {
    const { view, settle } = setup();
    act(() => {
      view.result.current.resolve.begin(['B']);
      view.result.current.follow.begin();
    });
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await new Promise((done) => setTimeout(done, 20));
    expect(view.result.current.follow.offer).toBeNull();
  });

  describe('a later edit ends whatever the last one left up', () => {
    async function offerInPhase(phase: 'failed' | 'moving' | 'done') {
      const harness = setup();
      harness.planEdit('Lengthen A');
      act(() => harness.settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
      await waitFor(() => expect(harness.view.result.current.follow.offer).not.toBeNull());
      const first = harness.view.result.current.follow.offer!.command;
      act(() => void harness.view.result.current.follow.start());
      if (phase === 'failed') act(() => harness.view.result.current.follow.fail('Failed.'));
      else {
        const step = edit('Follow logic');
        act(() => {
          // The write's own `beginLayoutEdit`, then its step, then the rebind.
          harness.view.result.current.resolve.begin(['B']);
          harness.view.result.current.follow.begin();
          harness.view.result.current.history.record(step);
          harness.view.result.current.follow.succeed(step);
        });
        if (phase === 'done') {
          act(() =>
            harness.settle({ rows: [bar('A'), bar('B', { visualStart: null }), bar('C')] }),
          );
          await waitFor(() => expect(harness.view.result.current.follow.offer?.phase).toBe('done'));
        }
      }
      return { ...harness, first };
    }

    it.each(['failed', 'moving', 'done'] as const)(
      'clears a %s offer when the next edit begins, so undoing that edit cannot bring it back',
      async (phase) => {
        // **Verified red** by leaving `begin` alone: the offer stays in state bound to its step, and
        // once the later edit is undone that step is on top again and the stale strip returns.
        const { view, planEdit } = await offerInPhase(phase);
        planEdit('A later edit');
        expect(view.result.current.follow.offer).toBeNull();
        await act(async () => {
          await view.result.current.history.undo(ctx);
        });
        await waitFor(() => expect(view.result.current.history.canRedo).toBe(true));
        expect(view.result.current.follow.offer, 'the undo did not resurrect it').toBeNull();
      },
    );

    it('leaves a BUSY offer alone: the write Follow logic is making begins an edit too', async () => {
      const { view, settle, planEdit } = setup();
      planEdit('Lengthen A');
      act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
      await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
      act(() => void view.result.current.follow.start());
      act(() => view.result.current.follow.begin());
      expect(view.result.current.follow.offer?.phase).toBe('busy');
    });
  });

  it('rebinds in the same render the step is recorded, so the strip is never hidden for a frame', async () => {
    const seen: (string | null)[] = [];
    const harness = setup();
    harness.planEdit('Lengthen A');
    act(() => harness.settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(harness.view.result.current.follow.offer).not.toBeNull());
    act(() => void harness.view.result.current.follow.start());
    const step = edit('Follow logic');
    // Recording and rebinding happen in one batch, as the model does it (`onRecorded`): a render
    // between them would read the offer as no longer bound to the step on top.
    act(() => {
      harness.view.result.current.history.record(step);
      harness.view.result.current.follow.succeed(step);
      seen.push(harness.view.result.current.follow.offer?.phase ?? null);
    });
    expect(harness.view.result.current.follow.offer?.phase).toBe('moving');
    expect(harness.view.result.current.follow.offer?.command).toBe(step);
    expect(seen).toHaveLength(1);
  });

  it('settles a Try again with nothing left to move as a visible sentence with no Undo', async () => {
    const { view, settle, announce, planEdit } = setup();
    planEdit('Lengthen A');
    act(() => settle({ rows: [bar('A'), bar('B', early), bar('C')] }));
    await waitFor(() => expect(view.result.current.follow.offer).not.toBeNull());
    act(() => void view.result.current.follow.start());
    act(() =>
      view.result.current.follow.settleNothing(
        'Nothing to move: those bars already follow their logic.',
      ),
    );
    expect(view.result.current.follow.offer).toMatchObject({
      phase: 'done',
      undoable: false,
      message: 'Nothing to move: those bars already follow their logic.',
    });
    expect(announce).toHaveBeenCalledWith(
      'Nothing to move: those bars already follow their logic.',
    );
  });
});
