import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TsldCanvas } from './TsldCanvas';

import type { RenderActivity } from '@/features/tsld/render/render-model';

/**
 * The hidden-pane render-loop pause (TECH_DEBT #30d). Below `md` the workspace keeps the diagram
 * pane mounted with `display:none` while the Activities pane is showing, so without this the rAF
 * loop keeps painting a canvas nobody can see — a real battery cost on the device most likely to
 * be at that width. An `IntersectionObserver` drives a `visibleRef` the frame checks first.
 *
 * jsdom has no `IntersectionObserver`, and the component deliberately treats that as "always
 * visible" (never silently blank a real canvas because an API is missing), so the test supplies a
 * stub and drives the callback itself. `paintScene` is spied because it is the loop's expensive
 * half and the only observable one — jsdom's canvas context is a no-op stub.
 */
const paintScene = vi.hoisted(() => vi.fn());
vi.mock('@/features/tsld/render/paint', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  paintScene,
}));

const ACTIVITIES: RenderActivity[] = [
  {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    label: 'a1',
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
  },
];

/** Callbacks of every observer the component constructed, so a test can flip visibility. */
let observerCallbacks: IntersectionObserverCallback[] = [];
let rafCallbacks: FrameRequestCallback[] = [];

/** Run one animation frame: drain the queue the loop re-armed on the previous frame. */
function tick(): void {
  const due = rafCallbacks;
  rafCallbacks = [];
  act(() => {
    for (const cb of due) cb(0);
  });
}

function setVisible(isIntersecting: boolean): void {
  act(() => {
    for (const cb of observerCallbacks) {
      cb([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });
}

beforeEach(() => {
  observerCallbacks = [];
  rafCallbacks = [];
  paintScene.mockClear();

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        observerCallbacks.push(cb);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TsldCanvas hidden-pane pause', () => {
  it('stops painting while the surface is off-screen, and repaints when it returns', () => {
    const canvas = (selectedId: string | null): React.ReactElement => (
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={selectedId}
        onSelect={vi.fn()}
        fitSignal={0}
      />
    );
    const { rerender } = render(canvas(null));

    // Visible: the first frame is dirty, so it paints.
    tick();
    expect(paintScene).toHaveBeenCalled();

    // Hidden — and deliberately made DIRTY while hidden, by changing the selection. Painting is
    // dirty-gated anyway, so a test that only ticks idle frames passes with the pause removed: it
    // would be asserting "nothing changed", not "the loop stood down".
    setVisible(false);
    paintScene.mockClear();
    rerender(canvas('a1'));
    tick();
    tick();
    expect(paintScene).not.toHaveBeenCalled();

    // Back on-screen: the observer re-arms the dirty flag, so the very next frame repaints rather
    // than waiting for the next incidental invalidation — otherwise the pane returns blank.
    setVisible(true);
    tick();
    expect(paintScene).toHaveBeenCalled();
  });
});
