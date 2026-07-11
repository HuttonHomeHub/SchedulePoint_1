import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldCanvas } from './TsldCanvas';

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
});
