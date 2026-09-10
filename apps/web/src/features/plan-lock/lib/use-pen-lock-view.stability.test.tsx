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
});
