import { fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The minimap's navigation contract (ADR-0100 M3): drag, click-to-jump and the keyboard all
 * commit through the host's ONE `onCenterWorld`/`onPanPages`; continuous gestures are silent
 * and discrete jumps announce once; Escape is an in-flight-only rung. The Escape halves were
 * **verified red both ways** — (a) with the rung removed, the mid-drag restore case fails;
 * (b) with the `dragging` guard removed (a naive always-on listener), the at-rest case fails.
 */
const announce = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

import { MINIMAP_BOX, TsldMinimap, type MinimapWindow } from './TsldMinimap';

import type { RenderActivity } from '@/features/tsld/render/render-model';

const WINDOW: MinimapWindow = {
  startIso: '2026-02-01',
  endIso: '2026-03-01',
  laneFrom: 4,
  laneTo: 23,
};

function activity(overrides: Partial<RenderActivity> = {}): RenderActivity {
  return {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    label: 'a1',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-06-30',
    isCritical: false,
    isNearCritical: false,
    ...overrides,
  };
}

function mount(over: Partial<React.ComponentProps<typeof TsldMinimap>> = {}) {
  const onCenterWorld = vi.fn((_day: number | null, _lane: number | null) => WINDOW);
  const onPanPages = vi.fn((_dx: number, _dy: number) => WINDOW);
  const readCentre = vi.fn(() => ({ day: 50, lane: 5 }));
  const utils = render(
    <TsldMinimap
      activities={[activity(), activity({ id: 'a2', laneIndex: 9 })]}
      dataDate="2026-01-01"
      selectedId={null}
      bottomOffsetPx={0}
      onClose={vi.fn()}
      bitmapCanvasRef={createRef<HTMLCanvasElement>()}
      rectRef={createRef<HTMLDivElement>()}
      onCenterWorld={onCenterWorld}
      onPanPages={onPanPages}
      readCentre={readCentre}
      {...over}
    />,
  );
  return { onCenterWorld, onPanPages, ...utils };
}

beforeEach(() => {
  vi.useFakeTimers();
  announce.mockClear();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('TsldMinimap — navigation (M3)', () => {
  it('arrow keys page-pan through onPanPages, and a held burst coalesces to ONE announcement', () => {
    const { onPanPages } = mount();
    const group = screen.getByRole('group', { name: 'Diagram overview' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    fireEvent.keyDown(group, { key: 'ArrowRight' });
    fireEvent.keyDown(group, { key: 'ArrowDown' });
    expect(onPanPages.mock.calls).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
    ]);
    expect(announce).not.toHaveBeenCalled(); // nothing until the burst settles
    vi.advanceTimersByTime(450);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]![0]).toMatch(/^Viewing .*lanes 5–24\.$/);
  });

  it('Home and End centre the first/last dated day on the time axis only, announcing at once', () => {
    const { onCenterWorld } = mount();
    const group = screen.getByRole('group', { name: 'Diagram overview' });
    fireEvent.keyDown(group, { key: 'Home' });
    expect(onCenterWorld).toHaveBeenCalledTimes(1);
    expect(onCenterWorld.mock.calls[0]![1]).toBeNull(); // the lane axis holds
    fireEvent.keyDown(group, { key: 'End' });
    expect(onCenterWorld).toHaveBeenCalledTimes(2);
    const [homeDay] = onCenterWorld.mock.calls[0]!;
    const [endDay] = onCenterWorld.mock.calls[1]!;
    expect(endDay).toBeGreaterThan(homeDay ?? Number.NaN);
    expect(announce).toHaveBeenCalledTimes(2); // discrete jumps speak immediately
  });

  it('a click outside the rectangle jumps through the SAME commit and announces once', () => {
    const { onCenterWorld, container } = mount();
    const surface = container.querySelector('[data-minimap-surface]')!;
    fireEvent.click(surface, { clientX: 50, clientY: 60 });
    expect(onCenterWorld).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('dragging the pad commits per move silently, then announces once on release', () => {
    const { onCenterWorld } = mount();
    const pad = screen.getByTestId('tsld-minimap-rect-pad');
    fireEvent.pointerDown(pad, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 30, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 50, clientY: 30, pointerId: 1 });
    expect(onCenterWorld).toHaveBeenCalledTimes(2); // one commit per move
    expect(announce).not.toHaveBeenCalled(); // continuous gestures are silent
    fireEvent.pointerUp(pad, { pointerId: 1 });
    expect(announce).toHaveBeenCalledTimes(1); // the commit that sticks, spoken once
  });

  it('Escape mid-drag restores the press viewport and is claimed (preventDefault)', () => {
    const { onCenterWorld } = mount();
    const pad = screen.getByTestId('tsld-minimap-rect-pad');
    fireEvent.pointerDown(pad, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 60, clientY: 40, pointerId: 1 });
    onCenterWorld.mockClear();

    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true); // the rung answered, so outer rungs stand down
    expect(onCenterWorld).toHaveBeenCalledTimes(1); // the restore commit
  });

  it('Escape at REST is not claimed — the minimap adds no rung while nothing is dragging', () => {
    const { onCenterWorld } = mount();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    expect(onCenterWorld).not.toHaveBeenCalled();
  });

  it('a pad press never reaches the surface as a click-to-jump', () => {
    const { onCenterWorld } = mount();
    const pad = screen.getByTestId('tsld-minimap-rect-pad');
    fireEvent.click(pad, { clientX: 10, clientY: 10 });
    expect(onCenterWorld).not.toHaveBeenCalled();
  });

  it('Ctrl-drag on the pad is an ordinary pan, never a marquee (that chord is the scene’s)', () => {
    // The scene's marquee arms in a REACT handler on the canvas element — a different subtree,
    // so a pad press cannot reach it structurally; the pad also stops React propagation. Both
    // halves asserted: a React listener wrapping the panel sees nothing, and the pan happened.
    const onCenterWorld = vi.fn(() => WINDOW);
    const sceneSaw = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- test scaffold standing in for the scene's own pointer handler
      <div onPointerDown={sceneSaw}>
        <TsldMinimap
          activities={[activity()]}
          dataDate="2026-01-01"
          selectedId={null}
          bottomOffsetPx={0}
          onClose={vi.fn()}
          bitmapCanvasRef={createRef<HTMLCanvasElement>()}
          rectRef={createRef<HTMLDivElement>()}
          onCenterWorld={onCenterWorld}
          onPanPages={vi.fn(() => WINDOW)}
          readCentre={() => ({ day: 50, lane: 5 })}
        />
      </div>,
    );
    const pad = screen.getByTestId('tsld-minimap-rect-pad');
    fireEvent.pointerDown(pad, {
      button: 0,
      ctrlKey: true,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
    });
    fireEvent.pointerMove(pad, { ctrlKey: true, clientX: 40, clientY: 20, pointerId: 1 });
    expect(onCenterWorld).toHaveBeenCalled(); // it pans…
    expect(sceneSaw).not.toHaveBeenCalled(); // …and the press never escapes toward the scene
    fireEvent.pointerUp(pad, { pointerId: 1 });
  });

  it('the hit pad is never smaller than 24×24 whatever the rectangle collapses to (M3-T6)', () => {
    mount();
    const pad = screen.getByTestId('tsld-minimap-rect-pad');
    expect(pad.style.minWidth).toBe('24px');
    expect(pad.style.minHeight).toBe('24px');
    expect(MINIMAP_BOX.width).toBeGreaterThan(24);
  });
});
