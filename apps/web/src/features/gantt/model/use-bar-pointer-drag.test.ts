import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBarPointerDrag } from './use-bar-pointer-drag';

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

const pointerDown = (clientX: number) =>
  ({
    button: 0,
    clientX,
    preventDefault: () => undefined,
    stopPropagation: () => undefined,
  }) as unknown as React.PointerEvent<HTMLElement>;

const move = (clientX: number) => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX }));
};

const up = () => {
  window.dispatchEvent(new PointerEvent('pointerup'));
};

const escape = () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};

describe('useBarPointerDrag', () => {
  it('does not arm when disabled — a bar the reader may not move has no gesture', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useBarPointerDrag({ enabled: false, onCommit }));

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
    const { result } = renderHook(() => useBarPointerDrag({ enabled: true, onCommit }));

    act(() => result.current.onPointerDown({ ...pointerDown(100), button: 2 }));
    expect(result.current.dragging).toBe(false);
  });

  it('publishes at most once per frame however many moves arrive', () => {
    // The property the ref exists for. Five moves inside one frame must produce ONE published
    // value, not five — on a virtualized list a publish per pointermove re-renders the window.
    const onCommit = vi.fn();
    const { result } = renderHook(() => useBarPointerDrag({ enabled: true, onCommit }));

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
    const { result } = renderHook(() => useBarPointerDrag({ enabled: true, onCommit }));

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
    const { result } = renderHook(() => useBarPointerDrag({ enabled: true, onCommit }));

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => up());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('cancels on Escape without committing, and stops listening', () => {
    // Cancelling is not dropping: the bar returns and nothing is written. Without it a planner who
    // starts a drag by accident must finish it and then undo — two writes and a recalculation to
    // repair a slip.
    const onCommit = vi.fn();
    const { result } = renderHook(() => useBarPointerDrag({ enabled: true, onCommit }));

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

  it('cancels its frame on unmount rather than publishing into a dead tree', () => {
    const onCommit = vi.fn();
    const { result, unmount } = renderHook(() => useBarPointerDrag({ enabled: true, onCommit }));

    act(() => result.current.onPointerDown(pointerDown(100)));
    act(() => move(150));
    expect(frames).toHaveLength(1);

    unmount();
    // A row can be virtualized away mid-drag, so the release handler is not guaranteed to run.
    expect(frames).toHaveLength(0);
  });
});
