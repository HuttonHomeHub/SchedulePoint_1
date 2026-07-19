import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Command } from './commands';
import { MAX_HISTORY_DEPTH, usePlanEditHistory } from './use-plan-edit-history';

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
