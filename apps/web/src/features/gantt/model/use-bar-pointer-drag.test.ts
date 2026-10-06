import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRAG_INTENT_PX, useBarPointerDrag } from './use-bar-pointer-drag';

/**
 * **M3-T2 — the drag's timing, which is the part that goes wrong.**
 *
 * Three properties, none of which is visible from reading the render: the move handler publishes at
 * most once a frame; Escape cancels without committing; and a drag that never moved is a click.
 *
 * `requestAnimationFrame` is stubbed to a manual queue rather than to a timer, so "how many
 * publishes happened between two frames" is a countable fact instead of a race. Counting renders
 * through `renderHook`'s result identity would be the obvious alternative and would prove less: a
 * component can re-render for reasons this hook has nothing to do with.
 */

let frames: FrameRequestCallback[] = [];
let nextHandle = 1;

/** Run every frame currently queued, exactly once — a real frame boundary. */
function flushFrame(): void {
  const queued = frames;
  frames = [];
  for (const callback of queued) callback(performance.now());
}

beforeEach(() => {
  frames = [];
  nextHandle = 1;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return nextHandle++;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frames = [];
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const pointerDown = (clientX: number, pointerId = 1) =>
  ({
    button: 0,
    clientX,
    pointerId,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }) as unknown as React.PointerEvent<HTMLElement>;

const move = (clientX: number, pointerId = 1) => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX, pointerId }));
};

const up = (pointerId = 1) => {
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId }));
};

const escape = () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};

describe('useBarPointerDrag', () => {
  it('does not arm when disabled — a bar the reader may not move has no gesture', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useBarPointerDrag({ enabled: false, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100)));
    expect(result.current.dragging).toBe(false);
    act(() => {
      move(180);
      up();
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ignores a non-primary button, so a right-click cannot start a drag', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown({ ...pointerDown(100), button: 2 }));
    expect(result.current.dragging).toBe(false);
  });

  it('publishes at most once per frame however many moves arrive', () => {
    // The property the ref exists for. Five moves inside one frame must produce ONE published
    // value, not five — on a virtualized list a publish per pointermove re-renders the window.
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => {
      move(110);
      move(120);
      move(130);
      move(140);
      move(150);
    });
    expect(frames).toHaveLength(1);

    act(() => flushFrame());
    // And the published value is the LATEST, not the first — a frame shows where the pointer is now.
    expect(result.current.deltaX).toBe(50);
  });

  it('commits the total movement once, on release', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => {
      move(160);
      flushFrame();
      move(220);
      flushFrame();
      up();
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(120);
    expect(result.current.dragging).toBe(false);
  });

  it('treats a drag that never moved as a click, not a write', () => {
    // Committing zero would burn a version bump and a recalculation on a bar the planner merely
    // touched — and a press on a bar is how selection works.
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => up());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('cancels on Escape without committing, and stops listening', () => {
    // Cancelling is not dropping: the bar returns and nothing is written. Without it a planner who
    // starts a drag by accident must finish it and then undo — two writes and a recalculation to
    // repair a slip.
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => {
      move(200);
      flushFrame();
      escape();
    });

    expect(result.current.dragging).toBe(false);
    act(() => up());
    expect(onCommit).not.toHaveBeenCalled();

    // The listeners really are gone — a further move must not resurrect the drag.
    act(() => {
      move(300);
      up();
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('treats a browser pointercancel as a cancel — a touch scroll must not commit a stale drag', () => {
    // The browser takes the pointer over (a touch becomes a scroll) and sends `pointercancel`
    // INSTEAD of `pointerup`. With no handler the window listeners stayed attached, and the next
    // unrelated `pointerup` anywhere committed the delta of a drag the planner never finished.
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => {
      move(200);
      flushFrame();
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
    });
    expect(result.current.dragging).toBe(false);

    act(() => up());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('cancels its frame on unmount rather than publishing into a dead tree', () => {
    const onCommit = vi.fn();
    const { result, unmount } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => move(150));
    expect(frames).toHaveLength(1);

    unmount();
    // A row can be virtualized away mid-drag, so the release handler is not guaranteed to run.
    expect(frames).toHaveLength(0);
  });

  it('removes its window listeners on unmount, so a later release cannot commit a dead drag', () => {
    // The unmount effect used to cancel the frame only. A row virtualized away mid-drag left four
    // listeners on the window, and the next unrelated `pointerup` called `onCommit` for a bar that
    // was no longer on screen.
    const onCommit = vi.fn();
    const { result, unmount } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => move(150));
    unmount();

    up();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ignores a second pointer: neither its move, its release nor its cancel touches the drag', () => {
    // A second finger landing mid-drag must not move the bar, drop it or cancel it — each event is
    // matched to the pointer that started the gesture.
    const onCommit = vi.fn();
    const { result } = renderHook(() =>
      useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
    );

    act(() => result.current.onPointerDown(pointerDown(100, 1)));
    act(() => {
      move(500, 2);
      up(2);
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 2 }));
    });
    expect(result.current.dragging).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      move(160, 1);
      up(1);
    });
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(60);
  });

  describe('a press on a bar that cannot move', () => {
    const refused = (over: Record<string, unknown> = {}) =>
      ({ ...pointerDown(100), ...over }) as unknown as React.PointerEvent<HTMLElement>;
    const moveXY = (clientX: number, clientY: number) =>
      window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, pointerId: 1 }));

    it('calls onRefused once for a sideways drag, never commits', () => {
      const onCommit = vi.fn();
      const onRefused = vi.fn();
      const { result } = renderHook(() =>
        useBarPointerDrag({ enabled: false, touchArmed: true, onCommit, onRefused }),
      );
      act(() => result.current.onPointerDown(refused()));
      act(() => {
        move(130);
        move(160);
        up(1);
      });
      expect(onRefused).toHaveBeenCalledOnce();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('ignores a vertical drag, which is a text selection', () => {
      const onRefused = vi.fn();
      const { result } = renderHook(() =>
        useBarPointerDrag({ enabled: false, touchArmed: true, onCommit: vi.fn(), onRefused }),
      );
      act(() => result.current.onPointerDown(refused({ clientY: 0 })));
      act(() => {
        moveXY(101, 80);
        up(1);
      });
      expect(onRefused).not.toHaveBeenCalled();
    });

    it('ignores a touch, which is a scroll', () => {
      const onRefused = vi.fn();
      const { result } = renderHook(() =>
        useBarPointerDrag({ enabled: false, touchArmed: true, onCommit: vi.fn(), onRefused }),
      );
      act(() => result.current.onPointerDown(refused({ pointerType: 'touch' })));
      act(() => {
        move(160);
        up(1);
      });
      expect(onRefused).not.toHaveBeenCalled();
    });
  });
  describe('a finger or stylus on a bar that is not selected (ADR-0177 D2)', () => {
    const typed = (pointerType: string, preventDefault = vi.fn()) =>
      ({
        ...pointerDown(100),
        pointerType,
        preventDefault,
      }) as unknown as React.PointerEvent<HTMLElement>;

    it.each(['touch', 'pen'])(
      'an unarmed %s press neither starts, commits, refuses nor prevents the default',
      (pointerType) => {
        const onCommit = vi.fn();
        const onRefused = vi.fn();
        const preventDefault = vi.fn();
        const { result } = renderHook(() =>
          // `enabled: false` is the case that matters: without the early return the press would
          // reach the refusal path and an unarmed stylus would announce a refusal nobody attempted.
          useBarPointerDrag({ enabled: false, touchArmed: false, onCommit, onRefused }),
        );
        act(() => result.current.onPointerDown(typed(pointerType, preventDefault)));
        act(() => {
          move(160);
          up(1);
        });
        expect(result.current.dragging).toBe(false);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(onRefused).not.toHaveBeenCalled();
        expect(onCommit).not.toHaveBeenCalled();
      },
    );

    it.each(['touch', 'pen'])(
      'an unarmed %s press on a MOVABLE bar does not drag it',
      (pointerType) => {
        const onCommit = vi.fn();
        const preventDefault = vi.fn();
        const { result } = renderHook(() =>
          useBarPointerDrag({ enabled: true, touchArmed: false, onCommit }),
        );
        act(() => result.current.onPointerDown(typed(pointerType, preventDefault)));
        act(() => {
          move(160);
          up(1);
        });
        expect(result.current.dragging).toBe(false);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(onCommit).not.toHaveBeenCalled();
      },
    );

    it('an armed touch or pen press drags as a mouse does', () => {
      for (const pointerType of ['touch', 'pen']) {
        const onCommit = vi.fn();
        const { result } = renderHook(() =>
          useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
        );
        act(() => result.current.onPointerDown(typed(pointerType)));
        act(() => {
          move(160);
          up(1);
        });
        expect(onCommit).toHaveBeenCalledExactlyOnceWith(60);
      }
    });

    it('an empty pointerType is not gated: only touch and pen are', () => {
      const onCommit = vi.fn();
      const { result } = renderHook(() =>
        useBarPointerDrag({ enabled: true, touchArmed: false, onCommit }),
      );
      act(() => result.current.onPointerDown(typed('')));
      act(() => {
        move(160);
        up(1);
      });
      expect(onCommit).toHaveBeenCalledExactlyOnceWith(60);
    });

    it('an unarmed MOUSE press is unchanged: it still drags, and a refused one is still refused', () => {
      const onCommit = vi.fn();
      const onRefused = vi.fn();
      const drag = renderHook(() =>
        useBarPointerDrag({ enabled: true, touchArmed: false, onCommit }),
      );
      act(() => drag.result.current.onPointerDown(typed('mouse')));
      act(() => {
        move(160);
        up(1);
      });
      expect(onCommit).toHaveBeenCalledExactlyOnceWith(60);

      const refused = renderHook(() =>
        useBarPointerDrag({ enabled: false, touchArmed: false, onCommit, onRefused }),
      );
      act(() => refused.result.current.onPointerDown(typed('mouse')));
      act(() => {
        move(160);
        up(1);
      });
      expect(onRefused).toHaveBeenCalledOnce();
    });
  });

  describe('cancel() and intentExceeded() — what a hold needs before it opens a menu', () => {
    it('cancel() clears the ghost, removes the Escape listener and commits nothing', () => {
      const onCommit = vi.fn();
      const removed = vi.spyOn(window, 'removeEventListener');
      const { result } = renderHook(() =>
        useBarPointerDrag({ enabled: true, touchArmed: true, onCommit }),
      );
      act(() => result.current.onPointerDown(pointerDown(100)));
      expect(result.current.dragging).toBe(true);

      act(() => result.current.cancel());
      expect(result.current.dragging).toBe(false);
      expect(removed).toHaveBeenCalledWith('keydown', expect.any(Function), true);

      // The release that follows the hold must not commit a dead drag.
      act(() => {
        move(160);
        up(1);
      });
      expect(onCommit).not.toHaveBeenCalled();
      removed.mockRestore();
    });

    it('cancel() between gestures is a no-op', () => {
      const { result } = renderHook(() =>
        useBarPointerDrag({ enabled: true, touchArmed: true, onCommit: vi.fn() }),
      );
      expect(() => act(() => result.current.cancel())).not.toThrow();
      expect(result.current.dragging).toBe(false);
    });

    it('reports intent only once the press has travelled past DRAG_INTENT_PX', () => {
      const { result } = renderHook(() =>
        useBarPointerDrag({ enabled: true, touchArmed: true, onCommit: vi.fn() }),
      );
      expect(result.current.intentExceeded()).toBe(false);
      act(() => result.current.onPointerDown(pointerDown(100)));
      act(() => move(100 + DRAG_INTENT_PX));
      expect(result.current.intentExceeded()).toBe(false);
      act(() => move(100 + DRAG_INTENT_PX + 1));
      expect(result.current.intentExceeded()).toBe(true);
      act(() => result.current.cancel());
      expect(result.current.intentExceeded()).toBe(false);
    });
  });
});
