import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no 2D context: the painters are mocked so the rAF loop has something to call. Nothing
// here asserts on paint.
vi.mock('../render/paint', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  paintScene: vi.fn(() => []),
  paintInteractionLayer: vi.fn(),
  paintResourceStrip: vi.fn(),
}));

import {
  BAR_HEIGHT,
  BAR_PAD,
  DEFAULT_VIEWPORT,
  LANE_HEIGHT,
  type RenderActivity,
} from '../render/render-model';

import { TsldCanvas } from './TsldCanvas';

/**
 * **`onPressComplete`: every press on the scene ends by telling the host** (ADR-0218 D1).
 *
 * The host answers by moving focus to the diagram's list. The canvas's part is only to say a press
 * is over, after it has done whatever the press was (select, move, pan, marquee, link pick), and to
 * say it from the `click` too, because on touch a focus made on `pointerup` is undone by the
 * compatibility `mousedown` that follows it. It must stay silent in the Add tool and while a create
 * popover is open, where the popover's field owns focus.
 */
const BAR_Y = DEFAULT_VIEWPORT.originY + BAR_PAD + BAR_HEIGHT / 2;
const GROUND_Y = DEFAULT_VIEWPORT.originY + 6 * LANE_HEIGHT;

const ACTIVITIES: RenderActivity[] = [
  {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    label: 'a1',
    drawnStart: '2026-01-02',
    drawnFinish: '2026-01-05',
    isCritical: false,
    isNearCritical: false,
  },
];

function mount(props: Partial<React.ComponentProps<typeof TsldCanvas>> = {}) {
  const onSelect = vi.fn();
  const onPressComplete = vi.fn();
  const utils = render(
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={null}
      onSelect={onSelect}
      onPressComplete={onPressComplete}
      fitSignal={0}
      {...props}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { canvas, onSelect, onPressComplete };
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({});
});

describe('TsldCanvas — a finished press is reported', () => {
  it('reports after the selection has been made, so the host sees the new selection', () => {
    const order: string[] = [];
    const { canvas } = mount({
      onSelect: () => order.push('select'),
      onPressComplete: () => order.push('complete'),
    });
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    expect(order).toEqual(['select', 'complete']);
  });

  it('reports a click on empty ground, and a pan', () => {
    const { canvas, onPressComplete } = mount();
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: GROUND_Y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: GROUND_Y, pointerId: 1 });
    expect(onPressComplete).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: GROUND_Y, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: GROUND_Y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 300, clientY: GROUND_Y, pointerId: 1 });
    expect(onPressComplete).toHaveBeenCalledTimes(2);
  });

  it('reports a gesture-machine release too (a bar pressed while editing)', () => {
    const { canvas, onSelect, onPressComplete } = mount({ editing: true, canReposition: true });
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    expect(onSelect).toHaveBeenCalledWith('a1');
    expect(onPressComplete).toHaveBeenCalledTimes(1);
  });

  it('reports a release outside the canvas (a cancelled gesture)', () => {
    const { canvas, onPressComplete } = mount({ editing: true, canReposition: true });
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 5000, clientY: BAR_Y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 5000, clientY: BAR_Y, pointerId: 1 });
    expect(onPressComplete).toHaveBeenCalledTimes(1);
  });

  it('reports again from the click that follows (touch: the mousedown after pointerup stole focus)', () => {
    const { canvas, onPressComplete } = mount();
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.click(canvas);
    expect(onPressComplete).toHaveBeenCalledTimes(2);
  });

  it('reports in the Link and LOE tools, which are click-driven', () => {
    for (const mode of ['link', 'loe'] as const) {
      const { canvas, onPressComplete } = mount({ editing: true, mode });
      fireEvent.pointerDown(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
      expect(onPressComplete).toHaveBeenCalledTimes(1);
    }
  });

  it('is silent in the Add tool, where the release opens the name popover', () => {
    const { canvas, onPressComplete } = mount({
      editing: true,
      mode: 'add-activity',
      createType: 'TASK',
    });
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.click(canvas);
    expect(onPressComplete).not.toHaveBeenCalled();
  });

  it('is silent while a create popover is open', () => {
    const { canvas, onPressComplete } = mount({
      editing: true,
      pending: { startDay: 1, endDay: 3, laneIndex: 0 },
    });
    fireEvent.pointerDown(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 70, clientY: BAR_Y, pointerId: 1 });
    fireEvent.click(canvas);
    expect(onPressComplete).not.toHaveBeenCalled();
  });
});
