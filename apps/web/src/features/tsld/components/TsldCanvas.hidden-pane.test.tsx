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

// The minimap bitmap build (ADR-0100, M2-T4). Spied for the same reason `paintScene` is: it is
// the minimap's expensive half and jsdom's canvas is a stub. THE load-bearing assertions here —
// the counting-stub budget gate structurally cannot see a per-frame-rebuild regression (its own
// docblock says so), and this spy is the one thing that can. Verified RED first against a naive
// implementation (the dirty-flag check replaced with `true`): the pan-only case failed, then the
// correct code was restored.
const buildMinimapBitmap = vi.hoisted(() => vi.fn());
vi.mock('@/features/tsld/render/minimap', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  buildMinimapBitmap,
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
  buildMinimapBitmap.mockClear();

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
    buildMinimapBitmap.mockClear();
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

describe('TsldCanvas minimap responsive withdrawal (M4 ux gate)', () => {
  const withMinimap = (): React.ReactElement => (
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={null}
      onSelect={vi.fn()}
      fitSignal={0}
      minimapActive
      onMinimapClose={vi.fn()}
    />
  );
  const mockWidth = (width: number) =>
    vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width,
      height: 800,
      top: 0,
      left: 0,
      right: width,
      bottom: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

  it('withdraws below 3× its own width and stays below it, and mounts where there is room', () => {
    // Below the derived floor (600px) the fixed 200×120 panel plus clearances covers more
    // than a third of the diagram and cannot be dragged aside, so it withdraws — the
    // M2-T6 "responsive withdrawal" route, built when the M4 ux gate found it missing.
    const narrow = mockWidth(500);
    const first = render(withMinimap());
    tick();
    expect(first.container.querySelector('[data-testid="tsld-minimap"]')).toBeNull();
    first.unmount();
    narrow.mockRestore();

    const wide = mockWidth(900);
    const second = render(withMinimap());
    tick();
    expect(second.container.querySelector('[data-testid="tsld-minimap"]')).not.toBeNull();
    second.unmount();
    wide.mockRestore();
  });

  it('an UNMEASURED surface never withdraws the panel (jsdom default zero-size)', () => {
    // The default-true guard: only a real measurement may suppress the panel, or every
    // jsdom suite (and the first pre-measure frame in a browser) would lose it.
    const { container } = render(withMinimap());
    tick();
    expect(container.querySelector('[data-testid="tsld-minimap"]')).not.toBeNull();
  });
});

describe('TsldCanvas minimap build discipline (ADR-0100, M2-T4)', () => {
  const canvas = (props: {
    activities?: RenderActivity[];
    selectedId?: string | null;
  }): React.ReactElement => (
    <TsldCanvas
      activities={props.activities ?? ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={props.selectedId ?? null}
      onSelect={vi.fn()}
      fitSignal={0}
      minimapActive
      onMinimapClose={vi.fn()}
    />
  );

  it('builds once on mount, then never on idle or pan-only frames', () => {
    const { container } = render(canvas({}));
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1);

    // Idle frames: nothing.
    tick();
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1);

    // A pan-only frame: the wheel handler moves the viewport and marks the SCENE dirty; the
    // minimap picture is invariant under pan, so the build must not run.
    const surface = container.querySelector('canvas.touch-none');
    expect(surface).not.toBeNull();
    act(() => {
      surface!.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 3, bubbles: true, cancelable: true }),
      );
    });
    tick();
    expect(paintScene.mock.calls.length).toBeGreaterThan(0); // the scene DID repaint
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1); // the picture did not

    // A ZOOM-only frame too — zoom changes what the scene shows, not what the plan is.
    act(() => {
      surface!.dispatchEvent(
        new WheelEvent('wheel', { deltaY: -3, ctrlKey: true, bubbles: true, cancelable: true }),
      );
    });
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1);
  });

  it('a selection change moves the marker while the build spy records zero calls', () => {
    // The agreement round's blocking finding 2, as a regression test (verified red against a
    // bitmap-resident selection — wiring `selectedId` into the dirty effect made this fail).
    const { container, rerender } = render(canvas({ selectedId: null }));
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="tsld-minimap-selection"]')).toBeNull();

    rerender(canvas({ selectedId: 'a1' }));
    tick();
    // The marker rendered (the selected activity has computed dates)…
    expect(container.querySelector('[data-testid="tsld-minimap-selection"]')).not.toBeNull();
    // …and the picture was NOT rebuilt for it.
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1);
  });

  it('the clock never rebuilds the picture — a todayOffset change costs zero builds', () => {
    // The other half of the dirty-rule pair (M4 architecture gate S5): selection was pinned
    // red-first at M2; this pins the clock. Today reaches the panel as a HOST-RESOLVED prop,
    // so a minute tick re-renders overlays and must never touch minimapDirtyRef.
    const withToday = (todayOffset: number): React.ReactElement => (
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        minimapActive
        onMinimapClose={vi.fn()}
        todayOffset={todayOffset}
        todayFraction={0.25}
      />
    );
    const { rerender } = render(withToday(5));
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1);
    rerender(withToday(6)); // midnight passed
    tick();
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1);
  });

  it('rebuilds exactly once on an activity-data change, and not at all while hidden', () => {
    const { rerender } = render(canvas({}));
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(1);

    const changed: RenderActivity[] = [
      { ...ACTIVITIES[0]!, earlyFinish: '2026-01-08' },
      {
        id: 'a2',
        type: 'TASK',
        laneIndex: 1,
        label: 'a2',
        earlyStart: '2026-01-03',
        earlyFinish: '2026-01-06',
        isCritical: true,
        isNearCritical: false,
      },
    ];
    rerender(canvas({ activities: changed }));
    tick();
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(2);

    // Hidden pane: a data change while hidden must not build (the loop stands down wholesale).
    setVisible(false);
    rerender(canvas({ activities: ACTIVITIES }));
    tick();
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(2);

    // Back on-screen: the dirty flag survived, so the next frame builds.
    setVisible(true);
    tick();
    expect(buildMinimapBitmap).toHaveBeenCalledTimes(3);
  });
});
