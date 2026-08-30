import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTO_RECALC_DEBOUNCE_MS,
  AUTO_RECALC_HOLD_CAP_MS,
  usePlanAutoRecalc,
} from './use-plan-auto-recalc';

/**
 * The auto-recalc coalescer (ADR-0032 M3) is the timing-sensitive core, so it's unit-tested in
 * isolation with the recalc command mocked and fake timers driving the debounce/single-flight.
 */

interface RunHandlers {
  onSuccess?: () => void;
  onError?: (message: string) => void;
}
const recalcMock = vi.hoisted(() => ({
  isPending: false,
  run: vi.fn<(h?: RunHandlers) => void>(),
}));

vi.mock('./use-schedule', () => ({ useRecalculateCommand: () => recalcMock }));

beforeEach(() => {
  vi.useFakeTimers();
  recalcMock.run.mockReset();
  recalcMock.isPending = false;
});
afterEach(() => vi.useRealTimers());

describe('usePlanAutoRecalc', () => {
  it('coalesces a burst of notify() into a single recalc after the debounce', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.notify();
      result.current.notify();
      result.current.notify();
    });
    expect(recalcMock.run).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('flush() fires immediately, cancelling the pending debounce', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.notify();
      result.current.flush();
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
    // The cancelled debounce doesn't fire a second recalc.
    act(() => {
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('flush(onSuccess) confirms once when the manual recalc succeeds', () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => result.current.flush(onSuccess));
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled(); // not until the recalc actually resolves
    act(() => recalcMock.run.mock.calls[0]![0]?.onSuccess?.());
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  /**
   * **One settle, one owner** (the M6 gate finding). Pressing Recalculate *inside* the 500 ms
   * debounce of a canvas edit put TWO owners on the same settle: this generic confirmation
   * ("Schedule recalculated.") and the settle announcer's informative sentence naming the resulting
   * dates. `useAnnounce` clears and re-sets one polite region on the next frame, so two utterances
   * in a frame collapse to whichever lands last — dropping either the status word or the facts,
   * non-deterministically. When an edit was waiting, the informative sentence wins and this one
   * stands down; the recalculation itself still fires exactly once.
   */
  it('stands down its confirmation when a debounced edit was already waiting', () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.notify(); // an edit is now waiting inside the debounce window
      result.current.flush(onSuccess); // …and the planner presses Recalculate
    });
    expect(
      recalcMock.run,
      'the debounce is cancelled — one recalculation, not two',
    ).toHaveBeenCalledTimes(1);
    act(() => recalcMock.run.mock.calls[0]![0]?.onSuccess?.());
    expect(
      onSuccess,
      'the settle announcer owns this settle — a second owner would collapse the region',
    ).not.toHaveBeenCalled();
  });

  /**
   * **The stand-down must ask whether a settle is COMING, not whether a timer handle exists.**
   *
   * `timerRef.current` was never cleared when the debounce elapsed on its own — only `flush` and the
   * unmount cleanup nulled it — so after any auto-recalculation that fired by itself, the handle
   * stayed non-null and `editWasWaiting` read `true` for a window in which no edit was waiting at
   * all. The manual confirmation stood down, and the settle announcer had already consumed its
   * baseline on the earlier settle and said nothing either: the press produced **complete silence**.
   *
   * That is the commonest path there is — edit, let the debounce settle, press Recalculate — and it
   * is a WCAG 4.1.3 failure, since the button's only feedback to a screen-reader user is that
   * sentence. Verified red: both assertions below fail against the pre-fix hook, the first at 0.
   */
  it('confirms a press made after an auto-recalculation has settled', () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.notify();
    });
    act(() => {
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS); // the debounce elapses by itself
    });
    act(() => recalcMock.run.mock.calls[0]![0]?.onSuccess?.()); // …and that recalculation settles
    act(() => {
      result.current.flush(onSuccess); // quiet now; the planner presses Recalculate
    });
    act(() => recalcMock.run.mock.calls[1]![0]?.onSuccess?.());
    expect(
      onSuccess,
      'no edit is waiting and no settle is coming — this press owns the region',
    ).toHaveBeenCalledTimes(1);
  });

  /**
   * The other half of the same rule, and the reason the fix is not simply "clear the handle".
   *
   * An edit whose debounce has fired is no longer *waiting*, but its settle announcer is still going
   * to speak that edit's new dates when the in-flight run lands. Registering the confirmation there
   * would put two owners back on one settle — the exact defect the stand-down exists for — so the
   * test is `a timer is pending OR a run is in flight`, not the presence of a timer handle.
   */
  it('still stands down while the edit it would collide with is in flight', () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.notify();
    });
    act(() => {
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS); // run 1 is now in flight
    });
    act(() => {
      result.current.flush(onSuccess); // pressed DURING that run
    });
    act(() => recalcMock.run.mock.calls[0]![0]?.onSuccess?.()); // run 1 settles — the announcer speaks
    act(() => recalcMock.run.mock.calls[1]?.[0]?.onSuccess?.()); // the queued run settles
    expect(
      onSuccess,
      "the edit's settle announcer owns this — a second owner would collapse the region",
    ).not.toHaveBeenCalled();
  });

  it('flush(onSuccess) does not confirm when the manual recalc fails', () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() =>
      usePlanAutoRecalc('acme', 'p1', { enabled: true, onMessage: vi.fn() }),
    );
    act(() => result.current.flush(onSuccess));
    act(() => recalcMock.run.mock.calls[0]![0]?.onError?.('boom'));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does nothing when disabled (no start date / no pen)', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: false }));
    act(() => {
      result.current.notify();
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).not.toHaveBeenCalled();
  });

  it('single-flights: an edit during an in-flight recalc queues exactly one more run', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.flush(); // fire #1 (in flight, not resolved)
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
    // A second edit while #1 is in flight → queued, not a second concurrent run.
    act(() => {
      result.current.notify();
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
    // #1 settles → the queued run fires exactly once.
    act(() => recalcMock.run.mock.calls[0]![0]?.onSuccess?.());
    expect(recalcMock.run).toHaveBeenCalledTimes(2);
  });

  it('best-effort flushes a queued recalc on unmount', () => {
    const { result, unmount } = renderHook(() =>
      usePlanAutoRecalc('acme', 'p1', { enabled: true }),
    );
    act(() => {
      result.current.notify();
    });
    expect(recalcMock.run).not.toHaveBeenCalled();
    unmount();
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });
});

/**
 * **Recalculation quiescence during an open pick** (ADR-0064 T7). A two-click gesture — arm Link,
 * click the predecessor, click the successor — is only safe if the bars stay where they were
 * between the clicks. A coalesced recalculation landing mid-pick moves them, and the second click
 * lands on a different activity than the planner aimed at.
 *
 * The risk this suite exists for is not "does it defer" but "does it ever fail to un-defer". A
 * leaked hold stalls every recalculation for the rest of the session, silently, and the plan's
 * dates just quietly stop updating — so every exit path is asserted, not just the happy one.
 */
describe('usePlanAutoRecalc — holds (ADR-0064 T7)', () => {
  it('defers a notify() while held, and fires exactly once on release', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    const token = Symbol('pick');
    act(() => {
      result.current.hold(token);
      result.current.notify();
      result.current.notify();
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS * 4);
    });
    expect(
      recalcMock.run,
      'a held notify must not fire, however long you wait',
    ).not.toHaveBeenCalled();

    act(() => {
      result.current.release(token);
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('needs every hold released — one surface cannot un-hold another', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    const a = Symbol('a');
    const b = Symbol('b');
    act(() => {
      result.current.hold(a);
      result.current.hold(b);
      result.current.notify();
      result.current.release(a);
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS * 2);
    });
    expect(recalcMock.run).not.toHaveBeenCalled();
    act(() => {
      result.current.release(b);
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('ignores a release of a token it never held, and a double release', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    const mine = Symbol('mine');
    act(() => {
      result.current.hold(mine);
      result.current.notify();
      // A stray release from somewhere else must not open the gate on this pick — the whole reason
      // holds are tokens rather than a counter.
      result.current.release(Symbol('someone else'));
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS * 2);
    });
    expect(recalcMock.run).not.toHaveBeenCalled();
    act(() => {
      result.current.release(mine);
      result.current.release(mine); // idempotent
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('releases with nothing owed do not schedule a recalculation', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    const token = Symbol('pick');
    act(() => {
      result.current.hold(token);
      result.current.release(token);
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS * 2);
    });
    // A pick that changed nothing must not cost a recalculation.
    expect(recalcMock.run).not.toHaveBeenCalled();
  });

  it('fires at the cap and tells the holder its gesture is no longer protected', () => {
    const onHoldExpired = vi.fn();
    const { result } = renderHook(() =>
      usePlanAutoRecalc('acme', 'p1', { enabled: true, onHoldExpired }),
    );
    act(() => {
      result.current.hold(Symbol('abandoned'));
      result.current.notify();
      vi.advanceTimersByTime(AUTO_RECALC_HOLD_CAP_MS);
    });
    expect(onHoldExpired).toHaveBeenCalledOnce();
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('measures the cap from the FIRST hold — later holds do not extend it', () => {
    const onHoldExpired = vi.fn();
    const { result } = renderHook(() =>
      usePlanAutoRecalc('acme', 'p1', { enabled: true, onHoldExpired }),
    );
    act(() => {
      result.current.hold(Symbol('first'));
      result.current.notify();
      vi.advanceTimersByTime(AUTO_RECALC_HOLD_CAP_MS / 2);
      result.current.hold(Symbol('second'));
      vi.advanceTimersByTime(AUTO_RECALC_HOLD_CAP_MS / 2);
    });
    // The question the cap answers is "how long have the dates been stale", and that clock starts
    // once. Resetting it per hold would let a stream of picks defer indefinitely.
    expect(onHoldExpired).toHaveBeenCalledOnce();
  });

  it('an explicit flush() overrules the hold and says so', () => {
    const onHoldExpired = vi.fn();
    const { result } = renderHook(() =>
      usePlanAutoRecalc('acme', 'p1', { enabled: true, onHoldExpired }),
    );
    act(() => {
      result.current.hold(Symbol('pick'));
      result.current.notify();
      result.current.flush();
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
    expect(
      onHoldExpired,
      'the pick is no longer safe, so its owner must be told',
    ).toHaveBeenCalledOnce();
  });

  it('an unmount with a hold open still flushes the owed recalculation', () => {
    const { result, unmount } = renderHook(() =>
      usePlanAutoRecalc('acme', 'p1', { enabled: true }),
    );
    act(() => {
      result.current.hold(Symbol('pick'));
      result.current.notify();
    });
    unmount();
    // A hold cannot outlive its hook. Without this, navigating away mid-pick would drop the edit's
    // recalculation entirely — the exact case the pre-existing unmount flush was added for.
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  it('with no hold ever taken, the cadence is exactly what it was', () => {
    const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
    act(() => {
      result.current.notify();
      vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
    });
    expect(recalcMock.run).toHaveBeenCalledTimes(1);
  });

  describe('the two facts the status bar reads (M3-T4)', () => {
    it('counts EDITS, not bursts — three inside one debounce window owe three', () => {
      // The sentence the bar prints is about work the reader did. A burst coalesced into one
      // recalculation still owes three edits, and a flag would render "one drag" and "an afternoon
      // of re-sequencing" identically.
      const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
      act(() => {
        result.current.notify();
        result.current.notify();
        result.current.notify();
      });
      expect(result.current.pendingEdits).toBe(3);
      expect(recalcMock.run, 'still one run — the coalescer is unchanged').not.toHaveBeenCalled();
    });

    it('counts an edit made inside an open hold', () => {
      // A hold defers the recalculation, not the edit. Someone who arms the Link tool and drags a
      // bar has still moved it, and the plan is behind either way.
      const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
      act(() => {
        result.current.hold(Symbol('pick'));
        result.current.notify();
      });
      expect(result.current.pendingEdits).toBe(1);
    });

    it('clears the count on success and reports no failure', () => {
      const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
      act(() => {
        result.current.notify();
        vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
      });
      act(() => recalcMock.run.mock.calls[0]![0]!.onSuccess!());
      expect(result.current.pendingEdits).toBe(0);
      expect(result.current.failed).toBe(false);
    });

    it('clears only the edits the run was ASKED to compute', () => {
      // An edit made while a request is in flight must survive that request's success: it queues a
      // second run, and zeroing the counter would report the schedule as current while the request
      // that makes it so has not been sent.
      const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
      act(() => {
        result.current.notify();
        vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
      });
      act(() => {
        result.current.notify(); // arrives mid-flight; queues a second run
      });
      expect(result.current.pendingEdits).toBe(2);
      act(() => recalcMock.run.mock.calls[0]![0]!.onSuccess!());
      expect(result.current.pendingEdits, 'the mid-flight edit is still owed').toBe(1);
    });

    it('flags a failure and KEEPS the outstanding edits', () => {
      // The edits are still uncomputed, which is what makes the failure worth reporting rather than
      // merely worth logging.
      const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
      act(() => {
        result.current.notify();
        result.current.notify();
        vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
      });
      act(() => recalcMock.run.mock.calls[0]![0]!.onError!('Recalculation failed.'));
      expect(result.current.failed).toBe(true);
      expect(result.current.pendingEdits).toBe(2);
    });

    it('a later success supersedes an earlier failure', () => {
      const { result } = renderHook(() => usePlanAutoRecalc('acme', 'p1', { enabled: true }));
      act(() => {
        result.current.notify();
        vi.advanceTimersByTime(AUTO_RECALC_DEBOUNCE_MS);
      });
      act(() => recalcMock.run.mock.calls[0]![0]!.onError!('nope'));
      expect(result.current.failed).toBe(true);
      act(() => result.current.flush());
      act(() => recalcMock.run.mock.calls[1]![0]!.onSuccess!());
      // Cleared together: a bar that says the schedule is both current and out of date is worse
      // than one that says neither.
      expect(result.current.failed).toBe(false);
      expect(result.current.pendingEdits).toBe(0);
    });
  });
});
