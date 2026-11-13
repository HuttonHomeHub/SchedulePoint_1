import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { activityRect } from '../render/geometry';

import { sceneOrigin, TsldCanvas, type TsldCanvasHandle } from './TsldCanvas';

import type { RenderActivity } from '@/features/tsld/render/render-model';

/**
 * **A bar the pointer selected is moved only when the stage hides some of it; a key keeps its margin**
 * (diagram-keys-and-selection M6, ADR-0219; `m5-measurement.md` H2).
 *
 * The selection reveal used to hold every selected bar 60 px clear of the visible edge, so a click
 * on a bar still wholly on screen slid it when the dock took a strip of the stage below it. The two
 * cases below are the same stage, the same bar and the same selection; the only difference is whether
 * the selection came from a pointer release on the bar or from the keyboard (a re-render with the
 * id, which is how the listbox reaches the canvas). jsdom lays nothing out, so the stage is the
 * canvas root's 480 px with the visible box set shorter, as `TsldCanvas.reveal-wiring.test.tsx` does.
 */
const ACTIVITIES: RenderActivity[] = [
  {
    id: 'a1',
    type: 'TASK',
    laneIndex: 2,
    label: 'a1',
    drawnStart: '2026-01-02',
    drawnFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
  },
];
const DATA_DATE = '2026-01-01';
const ROOT_HEIGHT = 480;

const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
  toJSON: () => ({}),
});

let rafCallbacks: FrameRequestCallback[] = [];
let resizeCallbacks: ResizeObserverCallback[] = [];
let boxRect = rect(0, 0, 1200, ROOT_HEIGHT);
let columnRect = rect(0, 0, 0, 0);
let visibleBox: HTMLDivElement;

function tick(): void {
  const due = rafCallbacks;
  rafCallbacks = [];
  act(() => {
    for (const cb of due) cb(0);
  });
}

beforeEach(() => {
  rafCallbacks = [];
  resizeCallbacks = [];
  boxRect = rect(0, 0, 1200, ROOT_HEIGHT);
  columnRect = rect(0, 0, 0, 0);
  visibleBox = document.createElement('div');
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        resizeCallbacks.push(cb);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLDivElement,
  ) {
    if (this === visibleBox) return boxRect;
    // No obstacle unless a case sets one: most of this file is about the margin, not the column.
    if (this.getAttribute('data-testid') === 'tsld-viewport-column') return columnRect;
    return rect(0, 0, 1200, ROOT_HEIGHT);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface Mounted {
  /** The bar's rectangle in the canvas, before any selection. */
  bar: { x: number; y: number; w: number; h: number };
  /** Select `a1` from the pointer (a click on the bar) or from the keyboard, and settle. */
  select: (via: 'pointer' | 'keyboard') => void;
  /** How far the view's origin has moved since mount. */
  moved: () => number;
}

/** `sceneHeight` is how much of the scene (below the ruler) the stage leaves visible, from the bar's rectangle. */
function mount(sceneHeight: (bar: { y: number; h: number }) => number): Mounted {
  const control = createRef<TsldCanvasHandle>();
  const onSelect = vi.fn();
  const canvasEl = (selectedId: string | null): React.ReactElement => (
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate={DATA_DATE}
      selectedId={selectedId}
      onSelect={onSelect}
      mode="select"
      fitSignal={0}
      controlRef={control}
      visibleBoxRef={{ current: visibleBox }}
    />
  );
  const { rerender, container } = render(canvasEl(null));
  tick();
  const before = control.current!.getViewport().view;
  const bar = activityRect(ACTIVITIES[0]!, before, DATA_DATE)!;
  boxRect = rect(0, 0, 1200, sceneHeight(bar) + sceneOrigin(0, 0).top);
  // The stage settles under the bar, as it does a frame after a dock appears.
  act(() => {
    for (const cb of resizeCallbacks) cb([], {} as ResizeObserver);
  });
  const canvas = container.querySelector('canvas')!;
  return {
    bar,
    select: (via) => {
      if (via === 'pointer') {
        const at = { clientX: bar.x + bar.w / 2, clientY: bar.y + bar.h / 2, pointerId: 1 };
        fireEvent.pointerDown(canvas, at);
        fireEvent.pointerUp(canvas, at);
        expect(onSelect).toHaveBeenCalledWith('a1');
      }
      rerender(canvasEl('a1'));
      tick();
    },
    moved: () => control.current!.getViewport().view.originY - before.originY,
  };
}

describe('the selection reveal and where the selection came from', () => {
  it('does not move a bar the pointer selected while the stage still shows all of it', () => {
    // 20 px of stage below the bar: wholly visible, but inside the keyboard's 60 px margin.
    const mounted = mount((bar) => bar.y + bar.h + 20);
    mounted.select('pointer');
    expect(mounted.moved()).toBe(0);
  });

  it('moves the same bar for a keyboard selection, by the margin the keyboard keeps', () => {
    const mounted = mount((bar) => bar.y + bar.h + 20);
    mounted.select('keyboard');
    expect(mounted.moved()).toBeLessThan(0);
  });

  it('moves a pointer-selected bar the stage hides, by the least that shows all of it', () => {
    // The stage ends halfway down the bar: 'hidden by the shrink'.
    const mounted = mount((bar) => bar.y + bar.h / 2);
    mounted.select('pointer');
    expect(mounted.moved()).toBeCloseTo(-mounted.bar.h / 2, 5);
  });

  it('moves a keyboard-selected hidden bar further than a pointer one (it keeps the margin)', () => {
    const pointer = mount((bar) => bar.y + bar.h / 2);
    pointer.select('pointer');
    const pointerMove = pointer.moved();
    cleanup();
    const keyboard = mount((bar) => bar.y + bar.h / 2);
    keyboard.select('keyboard');
    expect(keyboard.moved()).toBeLessThan(pointerMove);
  });

  it('does not clear the corner column for a bar the pointer selected, and does for a key', () => {
    const pointer = mount((bar) => bar.y + bar.h + 20);
    // The column's box lies over the whole stage, as the real one's wider-than-painted box can.
    columnRect = rect(0, 0, 1200, ROOT_HEIGHT);
    act(() => {
      for (const cb of resizeCallbacks) cb([], {} as ResizeObserver);
    });
    pointer.select('pointer');
    expect(pointer.moved()).toBe(0);
    cleanup();
    columnRect = rect(0, 0, 0, 0);
    const keyboard = mount((bar) => bar.y + bar.h + 20);
    columnRect = rect(0, 0, 1200, ROOT_HEIGHT);
    act(() => {
      for (const cb of resizeCallbacks) cb([], {} as ResizeObserver);
    });
    keyboard.select('keyboard');
    expect(keyboard.moved()).not.toBe(0);
  });
});
