import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TsldCanvas, type TsldCanvasHandle } from './TsldCanvas';

import type { RenderActivity } from '@/features/tsld/render/render-model';

/**
 * **The keyboard reveal's three inputs, pinned without a browser** (toolbar-redesign M4 review).
 *
 * `viewport-column.test.ts` pins the arithmetic (`clearOfObstacle`, `clusterHasRoom`); what it cannot
 * see is that `TsldCanvas` FEEDS it: the column's live rect, the visible stage's height (`clipShift`)
 * and a re-run when the stage settles a frame after the selection (`stageTick`). The journeys in
 * `e2e-minimap` watched all three go unread without failing for the right reason — with the margin
 * disabled the two reveal cases hung instead of failing — so each is pinned here against the
 * viewport the handle reports.
 *
 * jsdom lays nothing out, so every rect is supplied. The canvas root answers `ROOT`; the column and
 * the visible-stage box answer whatever the case sets.
 */
const ACTIVITIES: RenderActivity[] = [
  {
    id: 'a1',
    type: 'TASK',
    laneIndex: 5,
    label: 'a1',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
  },
];

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
let rootRect = rect(0, 0, 1200, 480);
let columnRect = rect(0, 0, 0, 0);
let boxRect = rect(0, 0, 1200, 480);
let visibleBox: HTMLDivElement;

function tick(): void {
  const due = rafCallbacks;
  rafCallbacks = [];
  act(() => {
    for (const cb of due) cb(0);
  });
}

function settleStage(): void {
  act(() => {
    for (const cb of resizeCallbacks) cb([], {} as ResizeObserver);
  });
}

beforeEach(() => {
  rafCallbacks = [];
  resizeCallbacks = [];
  rootRect = rect(0, 0, 1200, 480);
  columnRect = rect(0, 0, 0, 0);
  boxRect = rect(0, 0, 1200, 480);
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
    if (this.getAttribute('data-testid') === 'tsld-viewport-column') return columnRect;
    return rootRect;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface Mounted {
  move: () => { dx: number; dy: number };
  select: () => void;
}

/** Mount fitted with nothing selected; `select` picks `a1` and `move` is how far the view has since moved. */
function mount(): Mounted {
  const control = createRef<TsldCanvasHandle>();
  const canvas = (selectedId: string | null): React.ReactElement => (
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={selectedId}
      onSelect={vi.fn()}
      fitSignal={0}
      controlRef={control}
      visibleBoxRef={{ current: visibleBox }}
    />
  );
  const { rerender } = render(canvas(null));
  tick();
  const before = control.current!.getViewport().view;
  return {
    select: () => {
      rerender(canvas('a1'));
      tick();
    },
    move: () => {
      const after = control.current!.getViewport().view;
      return { dx: after.originX - before.originX, dy: after.originY - before.originY };
    },
  };
}

/** How far the reveal moves the view for `a1` with the rects as they are set now. */
function revealMove(): { dx: number; dy: number } {
  const mounted = mount();
  mounted.select();
  return mounted.move();
}

describe('the selection reveal is fed by the stage TsldCanvas reports', () => {
  it('moves the bar clear of the column, using the column rect it measures', () => {
    const open = revealMove();
    cleanup();
    columnRect = rect(0, 0, 1200, 480);
    const covered = revealMove();
    // The bar sits in the corner; a column over the whole stage pushes it up the way the shorter
    // route out goes, which the unobstructed reveal does not.
    expect(covered.dy).toBeLessThan(open.dy);
  });

  it('ignores the column once the stage is too short to draw it (it is withdrawn, not an obstacle)', () => {
    // 80 px of root is 40 of scene under the ruler: less than the cluster's card, so `clusterRoomRef`
    // is false and a column that is `visibility: hidden` must not push anything.
    rootRect = rect(0, 0, 1200, 80);
    boxRect = rect(0, 0, 1200, 80);
    const withdrawn = revealMove();
    cleanup();
    columnRect = rect(0, 0, 1200, 80);
    expect(revealMove()).toEqual(withdrawn);
  });

  it('reveals into the stage that is on screen, not the canvas root under a taller foot row', () => {
    const unclipped = revealMove();
    cleanup();
    // The foot row grew: the root keeps its height and the visible box loses 250 px of it.
    boxRect = rect(0, 0, 1200, 230);
    const clipped = revealMove();
    expect(clipped.dy).toBeLessThan(unclipped.dy);
  });

  it('runs the reveal again when the stage settles after the selection docked its bar', () => {
    const mounted = mount();
    mounted.select();
    const first = mounted.move();
    // The selection bar docks in the same commit as the selection and the stage shrinks a frame
    // later: the first run saw the old, taller stage.
    boxRect = rect(0, 0, 1200, 230);
    settleStage();
    tick();
    expect(mounted.move().dy).toBeLessThan(first.dy);
  });
});
