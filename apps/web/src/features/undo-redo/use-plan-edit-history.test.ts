import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { durationResizeCommand, relaneCommand, updateCommand, type Command } from './commands';
import { APPLIED, notApplicable, type ReplayResult } from './replay';
import { COALESCE_WINDOW_MS, MAX_HISTORY_DEPTH, usePlanEditHistory } from './use-plan-edit-history';

import { anActivity } from '@/test/activity-fixture';
import { fakePlanServer } from '@/test/fake-plan-server';

/** A replay context for commands that never read it. */
const { ctx } = fakePlanServer();

/** A command whose undo/redo push a tag onto a shared log so replay order is observable. */
function cmd(tag: string, log: string[]): Command {
  return {
    label: tag,
    subjects: [],
    undo: vi.fn(() => {
      log.push(`undo:${tag}`);
      return Promise.resolve(APPLIED);
    }),
    redo: vi.fn(() => {
      log.push(`redo:${tag}`);
      return Promise.resolve(APPLIED);
    }),
  };
}

/** A command that cannot apply in the given direction(s). */
function refusing(tag: string, directions: ('undo' | 'redo')[] = ['undo']): Command {
  const refuse = (): Promise<ReplayResult> =>
    Promise.resolve(notApplicable('changed', `${tag}’s subject`));
  return {
    label: tag,
    subjects: [],
    undo: directions.includes('undo') ? refuse : () => Promise.resolve(APPLIED),
    redo: directions.includes('redo') ? refuse : () => Promise.resolve(APPLIED),
  };
}

describe('usePlanEditHistory', () => {
  it('starts empty — nothing to undo or redo', () => {
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('records, undoes and redoes, toggling canUndo/canRedo and replaying the command', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));

    act(() => result.current.record(cmd('a', log)));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(log).toEqual(['undo:a']);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    await act(async () => {
      await result.current.redo(ctx);
    });
    expect(log).toEqual(['undo:a', 'redo:a']);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('resolves the applied step, so the caller can name what ran', async () => {
    const a = cmd('a', []);
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => result.current.record(a));
    let outcome: Awaited<ReturnType<typeof result.current.undo>> = null;
    await act(async () => {
      outcome = await result.current.undo(ctx);
    });
    expect(outcome).toEqual({ kind: 'applied', command: a });
  });

  it('peeks the step the next undo / redo would run, without running it', async () => {
    const log: string[] = [];
    const a = cmd('a', log);
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    expect(result.current.peekUndo()).toBeUndefined();

    act(() => result.current.record(a));
    expect(result.current.peekUndo()).toBe(a);
    expect(result.current.peekRedo()).toBeUndefined();
    expect(log).toEqual([]);

    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(result.current.peekUndo()).toBeUndefined();
    expect(result.current.peekRedo()).toBe(a);
  });

  it('undoes in LIFO order across several commands', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));

    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(cmd('b', log));
    });
    await act(async () => {
      await result.current.undo(ctx);
      await result.current.undo(ctx);
    });
    expect(log).toEqual(['undo:b', 'undo:a']);
    expect(result.current.canUndo).toBe(false);
  });

  it('recording a fresh edit clears the redo branch (linear history)', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));

    act(() => result.current.record(cmd('a', log)));
    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(result.current.canRedo).toBe(true);

    // A new edit invalidates the redo branch — the popped 'a' can no longer be redone.
    act(() => result.current.record(cmd('b', log)));
    expect(result.current.canRedo).toBe(false);

    await act(async () => {
      await result.current.redo(ctx); // nothing to redo — a no-op
    });
    expect(log).toEqual(['undo:a']);
  });

  it('clear() drops both stacks', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));

    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(cmd('b', log));
    });
    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('clearRedo() empties ONLY the redo stack, leaving the undo stack intact', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));

    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(cmd('b', log));
    });
    await act(async () => {
      await result.current.undo(ctx); // pops 'b' onto the redo stack
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.clearRedo());
    expect(result.current.canRedo).toBe(false); // redo dropped…
    expect(result.current.canUndo).toBe(true); // …undo intact

    // The surviving undo ('a') still replays; nothing was redone.
    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(log).toEqual(['undo:b', 'undo:a']);
  });

  it('tracks undoLabel/redoLabel through record → undo → redo → clearRedo, reverting to null', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    expect(result.current.undoLabel).toBeNull();
    expect(result.current.redoLabel).toBeNull();

    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(cmd('b', log));
    });
    // The top-of-undo-stack label leads.
    expect(result.current.undoLabel).toBe('b');
    expect(result.current.redoLabel).toBeNull();

    await act(async () => {
      await result.current.undo(ctx); // 'b' moves to the redo stack; 'a' now tops undo
    });
    expect(result.current.undoLabel).toBe('a');
    expect(result.current.redoLabel).toBe('b');

    await act(async () => {
      await result.current.redo(ctx); // 'b' back on the undo stack
    });
    expect(result.current.undoLabel).toBe('b');
    expect(result.current.redoLabel).toBeNull();

    // Undo once, then clearRedo drops the redo branch → redoLabel back to null, undoLabel stays.
    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(result.current.redoLabel).toBe('b');
    act(() => result.current.clearRedo());
    expect(result.current.redoLabel).toBeNull();
    expect(result.current.undoLabel).toBe('a');

    // clear() empties both → both labels null.
    act(() => result.current.clear());
    expect(result.current.undoLabel).toBeNull();
    expect(result.current.redoLabel).toBeNull();
  });

  it('coalescing tracks undoLabel to the merged step, and label is null once the stack empties', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      // Two same-key, in-window records collapse to one step whose label leads.
      result.current.record({ ...cmd('drag', log), coalescing: { key: 'k', merge: (p) => p } });
      result.current.record({ ...cmd('drag', log), coalescing: { key: 'k', merge: (p) => p } });
    });
    expect(result.current.undoLabel).toBe('drag');
    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(result.current.undoLabel).toBeNull(); // one merged step → one undo empties it
    expect(result.current.redoLabel).toBe('drag');
  });

  it('resets history when the plan changes', () => {
    const log: string[] = [];
    const { result, rerender } = renderHook(({ planId }) => usePlanEditHistory(planId), {
      initialProps: { planId: 'pl1' },
    });

    act(() => result.current.record(cmd('a', log)));
    expect(result.current.canUndo).toBe(true);

    rerender({ planId: 'pl2' });
    expect(result.current.canUndo).toBe(false);
  });

  it('caps the undo stack at MAX_HISTORY_DEPTH, evicting the oldest', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));

    act(() => {
      // One more than the cap: the very first ('c0') should be evicted.
      for (let i = 0; i <= MAX_HISTORY_DEPTH; i += 1) result.current.record(cmd(`c${i}`, log));
    });

    // Undo every retained step: exactly MAX_HISTORY_DEPTH, newest first, and 'c0' never replays.
    await act(async () => {
      for (let i = 0; i <= MAX_HISTORY_DEPTH; i += 1) await result.current.undo(ctx);
    });
    expect(log).toHaveLength(MAX_HISTORY_DEPTH);
    expect(log[0]).toBe(`undo:c${MAX_HISTORY_DEPTH}`);
    expect(log).not.toContain('undo:c0');
    expect(result.current.canUndo).toBe(false);
  });

  it('does not run two undos concurrently (in-flight guard)', async () => {
    const log: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: Command = {
      label: 'slow',
      subjects: [],
      undo: vi.fn(async () => {
        await gate;
        log.push('undo:slow');
        return APPLIED;
      }),
      redo: vi.fn(() => Promise.resolve(APPLIED)),
    };
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(slow);
      result.current.record(cmd('b', log));
    });

    await act(async () => {
      const first = result.current.undo(ctx); // pops 'b'
      await first;
    });
    // Start a slow undo of 'slow' and fire a second concurrent undo while it's still pending.
    await act(async () => {
      const first = result.current.undo(ctx); // 'slow' — blocks on the gate
      const second = result.current.undo(ctx); // guarded out — resolves immediately, no replay
      await second;
      expect(slow.undo).toHaveBeenCalledTimes(1);
      release();
      await first;
    });
    expect(log).toEqual(['undo:b', 'undo:slow']);
  });

  it('leaves the stacks intact when a replay throws, so the planner can retry', async () => {
    const flaky: Command = {
      label: 'flaky',
      subjects: [],
      undo: vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(APPLIED),
      redo: vi.fn(() => Promise.resolve(APPLIED)),
    };
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => result.current.record(flaky));
    await act(async () => {
      await expect(result.current.undo(ctx)).rejects.toThrow('network');
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });
});

/**
 * **Set aside, do not block** (ADR-0176 D3). A step that answers `not-applicable` leaves the stack, so
 * the next press runs the step below it — before this, a refused step stayed on top and every earlier
 * step was unreachable until a reload.
 */
describe('usePlanEditHistory — entries (undo-redo M7)', () => {
  const named = (label: string): Command => cmd(label, []);

  it('lists both stacks nearest first, as the steps would run', async () => {
    const { result } = renderHook(() => usePlanEditHistory('p1'));
    act(() => {
      result.current.record(named('A'));
      result.current.record(named('B'));
      result.current.record(named('C'));
    });
    await act(async () => {
      await result.current.undo(ctx);
      await result.current.undo(ctx);
    });
    expect(result.current.entries()).toEqual({ undo: ['A'], redo: ['B', 'C'] });
  });

  it('is empty after a clear', () => {
    const { result } = renderHook(() => usePlanEditHistory('p1'));
    act(() => result.current.record(named('A')));
    act(() => result.current.clear());
    expect(result.current.entries()).toEqual({ undo: [], redo: [] });
  });

  // The toolbar-context memo invariant: reading the list must not need a new store identity, and
  // recording must not change the reader's.
  it('is a stable reader across records', () => {
    const { result } = renderHook(() => usePlanEditHistory('p1'));
    const first = result.current.entries;
    act(() => result.current.record(named('A')));
    expect(result.current.entries).toBe(first);
  });
});

describe('usePlanEditHistory — setting a step aside', () => {
  it('pops the refused step, writes nothing across, and names what the next press runs', async () => {
    const log: string[] = [];
    const bad = refusing('bad');
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(bad);
    });
    let outcome: Awaited<ReturnType<typeof result.current.undo>> = null;
    await act(async () => {
      outcome = await result.current.undo(ctx);
    });
    expect(outcome).toEqual({
      kind: 'set-aside',
      command: bad,
      reason: 'changed',
      subjectName: 'bad’s subject',
      nextLabel: 'a',
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false); // it was NOT moved to redo
    expect(result.current.undoLabel).toBe('a');
  });

  it('the next undo continues with the step below, which is the dead end this removes', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(refusing('bad'));
    });
    await act(async () => {
      await result.current.undo(ctx); // set aside
      await result.current.undo(ctx); // runs 'a'
    });
    expect(log).toEqual(['undo:a']);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('one press never chains: a set-aside runs exactly one step', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(refusing('bad'));
    });
    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(log).toEqual([]);
  });

  it('clears the redo branch — no redo may resurrect a state built on a step that did not apply', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(cmd('b', log));
      result.current.record(refusing('bad'));
    });
    await act(async () => {
      // Undo `bad` fails, then `b` undoes onto the redo stack, then a set-aside of `a`.
      await result.current.undo(ctx);
      await result.current.undo(ctx);
    });
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.record(refusing('worse')));
    await act(async () => {
      await result.current.undo(ctx); // set aside → redo cleared
    });
    expect(result.current.canRedo).toBe(false);
  });

  it('ends the coalescing window, so a fresh edit never merges into the exposed step', async () => {
    const merge = vi.fn((p: Command) => p);
    const drag = (): Command => ({ ...cmd('drag', []), coalescing: { key: 'k', merge } });
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(drag());
      result.current.record(refusing('bad'));
    });
    await act(async () => {
      await result.current.undo(ctx);
    });
    act(() => result.current.record(drag()));
    expect(merge).not.toHaveBeenCalled();
    expect(result.current.undoLabel).toBe('drag');
    await act(async () => {
      await result.current.undo(ctx);
    });
    expect(result.current.canUndo).toBe(true); // two distinct steps, not one merged
  });

  it('a redo that cannot apply drops the whole redo branch, and reports no next step', async () => {
    const log: string[] = [];
    const bad = refusing('bad', ['redo']);
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(bad);
    });
    await act(async () => {
      await result.current.undo(ctx);
      await result.current.undo(ctx);
    });
    expect(result.current.canRedo).toBe(true);
    let outcome: Awaited<ReturnType<typeof result.current.redo>> = null;
    await act(async () => {
      outcome = await result.current.redo(ctx); // 'a' redoes fine…
      outcome = await result.current.redo(ctx); // …`bad` cannot
    });
    expect(outcome).toMatchObject({ kind: 'set-aside', nextLabel: null });
    expect(result.current.canRedo).toBe(false);
    expect(result.current.canUndo).toBe(true); // 'a' is still done
  });
});

/**
 * Coalescing (ADR-0048 M2.3): a drag / nudge burst fires many intermediate writes for one gesture,
 * each recording a same-key command; they must collapse to a SINGLE undo step. Uses the real
 * {@link relaneCommand} (its coalescing carries lane before/after) against the fake plan.
 */
describe('usePlanEditHistory coalescing', () => {
  /** A plan with two bars, and a `lane` that moves one and builds the command the seam would record. */
  function plan() {
    const server = fakePlanServer({
      activities: [
        anActivity({ id: 'a1', name: 'Excavate', laneIndex: 0 }),
        anActivity({ id: 'a2', name: 'Pour', laneIndex: 0 }),
      ],
    });
    const lane = async (from: number, to: number, activityId = 'a1') => {
      const saved = await server.mutations.repositionLane({
        activityId,
        laneIndex: to,
        version: server.row(activityId).version,
      });
      return relaneCommand({
        repositionLane: server.mutations.repositionLane,
        activityId,
        fromLaneIndex: from,
        toLaneIndex: to,
        saved,
        activityName: 'Excavate',
      });
    };
    return { server, lane };
  }

  it('collapses a rapid same-key burst into ONE step spanning the first→last position', async () => {
    const { server, lane } = plan();
    const burst = [await lane(0, 1), await lane(1, 2), await lane(2, 3)];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      for (const command of burst) result.current.record(command);
    });
    expect(result.current.canUndo).toBe(true);

    // One undo restores the ORIGINAL lane (0), and nothing is left to undo — the three intermediate
    // writes were a single reversible step.
    await act(async () => {
      await result.current.undo(server.ctx);
    });
    expect(server.row('a1').laneIndex).toBe(0);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('keeps two same-key edits SEPARATED by more than the interaction window as distinct steps', async () => {
    const { server, lane } = plan();
    const first = await lane(0, 1);
    const second = await lane(1, 2);
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePlanEditHistory('pl1'));
      act(() => result.current.record(first));
      act(() => {
        vi.advanceTimersByTime(COALESCE_WINDOW_MS + 1);
      });
      act(() => result.current.record(second));
      vi.useRealTimers();

      // Two deliberate gestures → two steps: it takes two undos to empty the stack.
      await act(async () => {
        await result.current.undo(server.ctx);
      });
      expect(result.current.canUndo).toBe(true);
      await act(async () => {
        await result.current.undo(server.ctx);
      });
      expect(result.current.canUndo).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not coalesce commands that target a different activity (different key)', async () => {
    const { server, lane } = plan();
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    const a1 = await lane(0, 1, 'a1');
    const a2 = await lane(0, 1, 'a2');
    act(() => {
      result.current.record(a1);
      result.current.record(a2);
    });
    await act(async () => {
      await result.current.undo(server.ctx);
    });
    expect(result.current.canUndo).toBe(true); // a second, distinct step remains
  });

  it('does not coalesce a non-coalescing command (a dialog edit) into a drag step', async () => {
    const { server, lane } = plan();
    const plain: Command = {
      label: 'Edit',
      subjects: [],
      undo: () => Promise.resolve(APPLIED),
      redo: () => Promise.resolve(APPLIED),
    };
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    const drag = await lane(0, 1);
    act(() => {
      result.current.record(drag);
      result.current.record(plain); // no coalescing key — a new step even back-to-back
    });
    await act(async () => {
      await result.current.undo(server.ctx);
    });
    expect(result.current.canUndo).toBe(true);
  });

  it('ends the window after an undo — a later same-key edit starts a fresh step', async () => {
    const { server, lane } = plan();
    const first = await lane(0, 1);
    const second = await lane(1, 2);
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(first);
      result.current.record(second); // merges → one step
    });
    await act(async () => {
      await result.current.undo(server.ctx);
    });
    expect(result.current.canUndo).toBe(false);
    // A same-key edit after the undo is its OWN step, not a merge into the (now empty) history.
    const fresh = await lane(0, 5);
    act(() => result.current.record(fresh));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false); // the fresh edit cleared the redo branch
  });
});

/**
 * Replaying against the live row (`docs/TECH_DEBT.md` #447, ADR-0176): several steps on ONE activity
 * each carry an optimistic version of their own, so a replay that sent the captured one 409'd as soon
 * as another step had bumped the row. A fake server that enforces the lock per row is the only honest
 * oracle — and it is also where the protection #447 must keep is proved: an UNRECORDED write by
 * somebody else is never silently overwritten.
 */
describe('usePlanEditHistory — replaying steps on one activity', () => {
  /** Four edits on one activity, recorded as the seam records them. */
  async function recordFour(history: ReturnType<typeof usePlanEditHistory>) {
    const server = fakePlanServer({ activities: [anActivity({ id: 'a1', name: 'Excavate' })] });
    const write = (patch: Record<string, unknown>) => {
      const before = server.row('a1');
      return server.mutations
        .patchFields({ activityId: 'a1', version: before.version, patch })
        .then((after) => ({ before, after }));
    };
    const patch = server.mutations.patchFields;
    const rename = await write({ name: 'Dig' });
    history.record(updateCommand({ patch, ...rename }));
    const resize = await write({ durationMinutes: 2880, durationDays: 6 });
    history.record(durationResizeCommand({ patch, ...resize }));
    const note = await write({ description: 'Hard clay' });
    history.record(updateCommand({ patch, ...note }));
    const saved = await server.mutations.repositionLane({
      activityId: 'a1',
      laneIndex: 1,
      version: server.row('a1').version,
    });
    history.record(
      relaneCommand({
        repositionLane: server.mutations.repositionLane,
        activityId: 'a1',
        fromLaneIndex: 0,
        toLaneIndex: 1,
        saved,
        activityName: 'Dig',
      }),
    );
    return server;
  }

  it('replays every step on one activity — undo all, redo all, undo all — without a 409', async () => {
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    let server!: Awaited<ReturnType<typeof recordFour>>;
    await act(async () => {
      server = await recordFour(result.current);
    });

    for (const direction of ['undo', 'redo', 'undo'] as const) {
      for (let step = 0; step < 4; step += 1) {
        await act(async () => {
          const outcome = await result.current[direction](server.ctx);
          expect(outcome?.kind).toBe('applied');
        });
      }
    }
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    expect(server.row('a1')).toMatchObject({
      name: 'Excavate',
      durationMinutes: 2400,
      description: null,
      laneIndex: 0,
    });
  });

  it('never overwrites an UNRECORDED write to a field a step wrote — it sets the step aside instead', async () => {
    // The protection #447's version ledger was built to keep: somebody else (another path, another
    // user) changed the row between our edit and our undo. Under ADR-0176 that is "a written field
    // differs", and the step is set aside rather than clobbering their value.
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    let server!: Awaited<ReturnType<typeof recordFour>>;
    await act(async () => {
      server = await recordFour(result.current);
    });
    await act(async () => {
      await result.current.undo(server.ctx); // lane
    });
    server.edit('a1', { description: 'Their note' });

    let outcome: Awaited<ReturnType<typeof result.current.undo>> = null;
    await act(async () => {
      outcome = await result.current.undo(server.ctx); // the description edit
    });
    expect(outcome).toMatchObject({ kind: 'set-aside', reason: 'changed' });
    expect(server.row('a1').description).toBe('Their note');
    // …and the steps beneath it are still reachable: the stack did not jam.
    await act(async () => {
      const next = await result.current.undo(server.ctx);
      expect(next?.kind).toBe('applied');
    });
    expect(server.row('a1').durationMinutes).toBe(2400);
  });

  it('is not stopped by an unrecorded write to a field no step wrote', async () => {
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    let server!: Awaited<ReturnType<typeof recordFour>>;
    await act(async () => {
      server = await recordFour(result.current);
    });
    server.edit('a1', { levelingPriority: 3 }); // bumps the row's version; no step wrote it
    await act(async () => {
      const outcome = await result.current.undo(server.ctx);
      expect(outcome?.kind).toBe('applied');
    });
    expect(server.row('a1').laneIndex).toBe(0);
  });
});
