import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TsldCanvas, type TsldCanvasHandle } from './TsldCanvas';

import type { RenderActivity } from '@/features/tsld/render/render-model';

const ACTIVITIES: RenderActivity[] = [
  {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-05',
    isCritical: true,
    isNearCritical: false,
  },
];

function renderCanvas(onSelect = vi.fn()) {
  const utils = render(
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={null}
      onSelect={onSelect}
      fitSignal={0}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { ...utils, canvas, onSelect };
}

describe('TsldCanvas', () => {
  it('renders an aria-hidden canvas (the sighted-only surface)', () => {
    const { canvas } = renderCanvas();
    expect(canvas).toHaveAttribute('aria-hidden', 'true');
  });

  it('prevents default on wheel so zooming does not scroll the page', () => {
    const { canvas } = renderCanvas();
    const event = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('treats a pointer down+up without movement as a click and calls onSelect', () => {
    const { canvas, onSelect } = renderCanvas();
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('treats a drag past the threshold as a pan, not a click (no onSelect)', () => {
    const { canvas, onSelect } = renderCanvas();
    fireEvent.pointerDown(canvas, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 40, clientY: 0, pointerId: 1 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('populates the aria-hidden date ruler with year + month labels for the data date', async () => {
    const { container } = render(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-03-16"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
      />,
    );
    const ruler = container.querySelector('[data-testid="tsld-ruler"]');
    expect(ruler).toHaveAttribute('aria-hidden', 'true'); // never in the a11y tree
    // The rAF loop fills the ruler DOM from the viewport; the current year/month are labelled.
    await waitFor(() => expect(ruler?.textContent).toContain('2026'));
    expect(ruler?.textContent).toContain('Mar');
  });

  it('exposes an imperative zoom handle that reports the active preset only on a stop change', () => {
    const controlRef = createRef<TsldCanvasHandle>();
    const onZoomStopChange = vi.fn();
    render(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-01-01"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        controlRef={controlRef}
        onZoomStopChange={onZoomStopChange}
      />,
    );
    act(() => controlRef.current!.zoomToPreset('day'));
    expect(onZoomStopChange).toHaveBeenLastCalledWith('day');
    act(() => controlRef.current!.zoomToPreset('year'));
    expect(onZoomStopChange).toHaveBeenLastCalledWith('year');
    // A second command to the SAME preset does not re-fire (coarse, stop-boundary only).
    const callsBefore = onZoomStopChange.mock.calls.length;
    act(() => controlRef.current!.zoomToPreset('year'));
    expect(onZoomStopChange.mock.calls.length).toBe(callsBefore);
  });
});
