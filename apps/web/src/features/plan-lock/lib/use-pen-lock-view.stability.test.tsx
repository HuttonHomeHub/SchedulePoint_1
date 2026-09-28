import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PlanPen } from '../api/use-plan-edit-lock';

import { usePenLockView } from './use-pen-lock-view';

/**
 * **The hook's return is referentially stable while nothing a reader can see has changed** (console
 * epic M7).
 *
 * This exists because the first attempt at that property **looked right and could not work**. The
 * hook is called at the top of the plan workspace and its result threaded through the TSLD toolbar
 * context, so a new object every render invalidates that context's memo — and with it every
 * registered command's resolution and the canvas host's render — once a second, forever, for as
 * long as a plan is open. The fix was a `useMemo`; its dependency array listed `pen`, and
 * `usePlanPen` rebuilds that object on every render. So the memo never hit and the remedy for a
 * per-second re-render recomputed per render.
 *
 * Nothing failed. No test went red, the code read correctly, and the reviewer who found the
 * original defect would have read the fix as closing it. It was caught by asking whether the input
 * was stable — which is a question, not an instrument, and is why this file exists: the property is
 * now checked rather than reasoned about.
 *
 * **Asserted on identity across a re-render with an unchanged pen**, which is the only shape that
 * discriminates. "The memo has the right dependencies" is not checkable from outside, and a test
 * that asserted the array's contents would pass against exactly the broken version.
 */

const CALLBACKS = {
  dismissLost: vi.fn(),
  startEditing: vi.fn(),
  stopEditing: vi.fn(),
  requestControl: vi.fn(),
  handoff: vi.fn(),
  takeOver: vi.fn(),
  onWriteRejected: vi.fn(),
};

/**
 * A fresh `PlanPen` **object** wrapping the same stable callbacks — which is exactly what
 * `usePlanPen` produces on every render, and the shape the broken memo could not survive.
 */
function pen(over: Partial<PlanPen> = {}): PlanPen {
  return {
    penManaged: true,
    status: {
      state: 'FREE',
      holder: null,
      requestedBy: null,
      heartbeatAt: null,
      graceEndsAt: null,
      canAcquire: true,
      canRequest: false,
      canTakeOver: false,
      canOverride: false,
    } as unknown as PlanPen['status'],
    holdsPen: false,
    isPending: false,
    lostControl: null,
    ...CALLBACKS,
    ...over,
  };
}

describe('usePenLockView keeps one identity while the lock is unchanged', () => {
  it('returns the same object across a re-render with a fresh but equivalent pen', () => {
    const { result, rerender } = renderHook(
      ({ p }: { p: PlanPen }) => usePenLockView(p, 'u-me', 1_700_000_000_000),
      {
        initialProps: { p: pen() },
      },
    );
    const first = result.current;

    // A NEW `PlanPen` literal, same contents — `usePlanPen` is not memoised, so this is what the
    // real caller hands over on every single render.
    rerender({ p: pen() });

    expect(result.current).toBe(first);
    expect(result.current.controlsProps).toBe(first.controlsProps);
  });

  it('returns a new object when the lock actually changes', () => {
    // The other half, and without it the case above is satisfied by a hook that returns a frozen
    // value and never updates — which would be a far worse defect than the one it guards.
    const { result, rerender } = renderHook(
      ({ p }: { p: PlanPen }) => usePenLockView(p, 'u-me', 1_700_000_000_000),
      {
        initialProps: { p: pen() },
      },
    );
    const first = result.current;
    expect(first.view?.actions).toEqual(['start']);

    rerender({
      p: pen({
        status: {
          state: 'HELD_BY_ME',
          holder: { id: 'u-me', name: 'Mo Hale' },
          requestedBy: null,
          heartbeatAt: null,
          graceEndsAt: null,
          canAcquire: false,
          canRequest: false,
          canTakeOver: false,
          canOverride: false,
        } as unknown as PlanPen['status'],
        holdsPen: true,
      }),
    });

    expect(result.current).not.toBe(first);
    expect(result.current.view?.actions).toEqual(['stop']);
  });

  it('returns a new object when a mutation goes in flight, because the buttons shade', () => {
    const { result, rerender } = renderHook(
      ({ p }: { p: PlanPen }) => usePenLockView(p, 'u-me', 1_700_000_000_000),
      {
        initialProps: { p: pen() },
      },
    );
    const first = result.current;
    rerender({ p: pen({ isPending: true }) });
    expect(result.current).not.toBe(first);
  });

  /**
   * M1-T2 (`docs/TECH_DEBT.md` #353): the two cases the plan asks for, against the
   * `HELD_BY_OTHER` read-only branch whose `aside` is `activeAside`'s "active {relative}" phrase
   * — the one piece of `LockView` that ticks every second without the sentence, badge or action
   * list changing. `lockViewKey` folds the aside in, so these are exactly the two states
   * `useKeyedIdentity` exists to tell apart.
   */
  const HELD_BY_OTHER_BASE = 1_700_000_000_000;
  // Hoisted so it is the SAME reference across both renders below — `holder` is one of the outer
  // memo's own listed dependencies, and a fresh `{ id, name }` literal per call would force a
  // recompute for a reason that has nothing to do with the aside this case exists to isolate
  // (the R8/M0-T4 lesson, `docs/specs/hook-deps-gate/m0-measurement.md`).
  const OTHER_HOLDER = { id: 'u-other', name: 'Alexandra Reyes' };
  function heldByOtherPen(now: number): PlanPen {
    return pen({
      status: {
        state: 'HELD_BY_OTHER',
        holder: OTHER_HOLDER,
        requestedBy: null,
        // Five minutes before `now`, so the "min ago" bucket has room to move without landing on
        // a boundary this test would need to reason about separately.
        heartbeatAt: new Date(now - 5 * 60_000).toISOString(),
        graceEndsAt: null,
        canAcquire: false,
        canRequest: false,
        canTakeOver: false,
        canOverride: false,
      } as unknown as PlanPen['status'],
    });
  }

  it('keeps identity when `now` advances within the same "active …" minute bucket', () => {
    const { result, rerender } = renderHook(
      ({ now }: { now: number }) => usePenLockView(heldByOtherPen(HELD_BY_OTHER_BASE), 'u-me', now),
      { initialProps: { now: HELD_BY_OTHER_BASE } },
    );
    const first = result.current;
    expect(first.view?.aside).toBe('active 5 min ago');

    // +1 s: still "5 min ago" — the tick that fires every second, most of which say nothing new.
    rerender({ now: HELD_BY_OTHER_BASE + 1_000 });

    expect(result.current.view?.aside).toBe('active 5 min ago');
    expect(result.current).toBe(first);
  });

  it('gives a new identity once `now` crosses the "active …" minute boundary', () => {
    const { result, rerender } = renderHook(
      ({ now }: { now: number }) => usePenLockView(heldByOtherPen(HELD_BY_OTHER_BASE), 'u-me', now),
      { initialProps: { now: HELD_BY_OTHER_BASE } },
    );
    const first = result.current;
    expect(first.view?.aside).toBe('active 5 min ago');

    // +60 s: the heartbeat is now six minutes old — a real, reader-visible change.
    rerender({ now: HELD_BY_OTHER_BASE + 60_000 });

    expect(result.current.view?.aside).toBe('active 6 min ago');
    expect(result.current).not.toBe(first);
  });
});
