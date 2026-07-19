import type { ActivitySummary } from '@repo/types';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { relaneCommand, type Command, type RepositionLaneFn } from './commands';
import { COALESCE_WINDOW_MS, MAX_HISTORY_DEPTH, usePlanEditHistory } from './use-plan-edit-history';

/** A command whose undo/redo push a tag onto a shared log so replay order is observable. */
function cmd(tag: string, log: string[]): Command {
  return {
    label: tag,
    undo: vi.fn(() => {
      log.push(`undo:${tag}`);
      return Promise.resolve();
    }),
    redo: vi.fn(() => {
      log.push(`redo:${tag}`);
      return Promise.resolve();
    }),
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
      await result.current.undo();
    });
    expect(log).toEqual(['undo:a']);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    await act(async () => {
      await result.current.redo();
    });
    expect(log).toEqual(['undo:a', 'redo:a']);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('undoes in LIFO order across several commands', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));

    act(() => {
      result.current.record(cmd('a', log));
      result.current.record(cmd('b', log));
    });
    await act(async () => {
      await result.current.undo();
      await result.current.undo();
    });
    expect(log).toEqual(['undo:b', 'undo:a']);
    expect(result.current.canUndo).toBe(false);
  });

  it('recording a fresh edit clears the redo branch (linear history)', async () => {
    const log: string[] = [];
    const { result } = renderHook(() => usePlanEditHistory('pl1'));

    act(() => result.current.record(cmd('a', log)));
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.canRedo).toBe(true);

    // A new edit invalidates the redo branch — the popped 'a' can no longer be redone.
    act(() => result.current.record(cmd('b', log)));
    expect(result.current.canRedo).toBe(false);

    await act(async () => {
      await result.current.redo(); // nothing to redo — a no-op
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
      await result.current.undo();
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(true);

    act(() => result.current.clear());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
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
      for (let i = 0; i <= MAX_HISTORY_DEPTH; i += 1) await result.current.undo();
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
      undo: vi.fn(async () => {
        await gate;
        log.push('undo:slow');
      }),
      redo: vi.fn(() => Promise.resolve()),
    };
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(slow);
      result.current.record(cmd('b', log));
    });

    await act(async () => {
      const first = result.current.undo(); // pops 'b'
      await first;
    });
    // Start a slow undo of 'slow' and fire a second concurrent undo while it's still pending.
    await act(async () => {
      const first = result.current.undo(); // 'slow' — blocks on the gate
      const second = result.current.undo(); // guarded out — resolves immediately, no replay
      await second;
      expect(slow.undo).toHaveBeenCalledTimes(1);
      release();
      await first;
    });
    expect(log).toEqual(['undo:b', 'undo:slow']);
  });
});

/**
 * Coalescing (ADR-0048 M2.3): a drag / nudge burst fires many intermediate writes for one gesture,
 * each recording a same-key command; they must collapse to a SINGLE undo step. Uses the real
 * {@link relaneCommand} (its coalescing carries lane before/after + version) with a fake lane PATCH.
 */
describe('usePlanEditHistory coalescing', () => {
  /** A fake `useRepositionLane().mutateAsync` that echoes the lane with a bumped version. */
  function fakeLane(): RepositionLaneFn {
    let version = 1000;
    return vi.fn((input: { activityId: string; laneIndex: number; version: number }) =>
      Promise.resolve({
        id: input.activityId,
        laneIndex: input.laneIndex,
        version: (version += 1),
      } as unknown as ActivitySummary),
    );
  }
  const lane = (
    fn: RepositionLaneFn,
    from: number,
    to: number,
    version: number,
    activityId = 'a1',
  ) =>
    relaneCommand({
      repositionLane: fn,
      activityId,
      fromLaneIndex: from,
      toLaneIndex: to,
      version,
    });

  it('collapses a rapid same-key burst into ONE step spanning the first→last position', async () => {
    const fn = fakeLane();
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(lane(fn, 0, 1, 10));
      result.current.record(lane(fn, 1, 2, 11));
      result.current.record(lane(fn, 2, 3, 12));
    });
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      await result.current.undo();
    });
    // One undo restores the ORIGINAL lane (0) at the NEWEST version (12), and nothing is left to
    // undo — the three intermediate writes were a single reversible step.
    expect(fn).toHaveBeenLastCalledWith({ activityId: 'a1', laneIndex: 0, version: 12 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it('keeps two same-key edits SEPARATED by more than the interaction window as distinct steps', async () => {
    vi.useFakeTimers();
    try {
      const fn = fakeLane();
      const { result } = renderHook(() => usePlanEditHistory('pl1'));
      act(() => result.current.record(lane(fn, 0, 1, 10)));
      act(() => {
        vi.advanceTimersByTime(COALESCE_WINDOW_MS + 1);
      });
      act(() => result.current.record(lane(fn, 1, 2, 11)));

      // Two deliberate gestures → two steps: it takes two undos to empty the stack.
      await act(async () => {
        await result.current.undo();
      });
      expect(result.current.canUndo).toBe(true);
      await act(async () => {
        await result.current.undo();
      });
      expect(result.current.canUndo).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not coalesce commands that target a different activity (different key)', async () => {
    const fn = fakeLane();
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(lane(fn, 0, 1, 10, 'a1'));
      result.current.record(lane(fn, 0, 1, 20, 'a2'));
    });
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.canUndo).toBe(true); // a second, distinct step remains
  });

  it('does not coalesce a non-coalescing command (a dialog edit) into a drag step', async () => {
    const fn = fakeLane();
    const plain: Command = {
      label: 'Edit',
      undo: () => Promise.resolve(),
      redo: () => Promise.resolve(),
    };
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(lane(fn, 0, 1, 10));
      result.current.record(plain); // no coalescing key — a new step even back-to-back
    });
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.canUndo).toBe(true);
  });

  it('ends the window after an undo — a later same-key edit starts a fresh step', async () => {
    const fn = fakeLane();
    const { result } = renderHook(() => usePlanEditHistory('pl1'));
    act(() => {
      result.current.record(lane(fn, 0, 1, 10));
      result.current.record(lane(fn, 1, 2, 11)); // merges → one step
    });
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.canUndo).toBe(false);
    // A same-key edit after the undo is its OWN step, not a merge into the (now empty) history.
    act(() => result.current.record(lane(fn, 0, 5, 30)));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false); // the fresh edit cleared the redo branch
  });
});
