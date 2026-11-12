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
 * **`onActivateBar`: a double-click is an activation only when both presses were plain selects of the
 * same bar** (ADR-0218 D4, `docs/specs/diagram-keys-and-selection/` M3).
 *
 * The browser's `dblclick` follows any two clicks, including the two that end a drag, a Ctrl-click, a
 * pick in the Link tool or a click on empty ground. The canvas counts what each release actually did
 * and reports only the double-click whose both halves were a plain select of one bar.
 */
const BAR_Y = DEFAULT_VIEWPORT.originY + BAR_PAD + BAR_HEIGHT / 2;
const GROUND_Y = DEFAULT_VIEWPORT.originY + 6 * LANE_HEIGHT;

const bar = (id: string, laneIndex: number): RenderActivity => ({
  id,
  type: 'TASK',
  laneIndex,
  label: id,
  drawnStart: '2026-01-02',
  drawnFinish: '2026-01-05',
  isCritical: false,
  isNearCritical: false,
});
const ACTIVITIES = [bar('a1', 0), bar('a2', 1)];
const ON_A1 = { clientX: 70, clientY: BAR_Y, pointerId: 1 };
const ON_A2 = { clientX: 70, clientY: BAR_Y + LANE_HEIGHT, pointerId: 1 };
const ON_GROUND = { clientX: 400, clientY: GROUND_Y, pointerId: 1 };

function mount(props: Partial<React.ComponentProps<typeof TsldCanvas>> = {}) {
  const onActivateBar = vi.fn();
  const onIntent = vi.fn();
  const utils = render(
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={null}
      onSelect={vi.fn()}
      onActivateBar={onActivateBar}
      onIntent={onIntent}
      fitSignal={0}
      {...props}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { canvas, onActivateBar, onIntent };
}

function click(canvas: Element, at: typeof ON_A1, init: Record<string, unknown> = {}): void {
  fireEvent.pointerDown(canvas, { ...at, ...init });
  fireEvent.pointerUp(canvas, { ...at, ...init });
  fireEvent.click(canvas, { clientX: at.clientX, clientY: at.clientY, ...init });
}
function doubleClick(canvas: Element, at: typeof ON_A1, init: Record<string, unknown> = {}): void {
  click(canvas, at, init);
  click(canvas, at, init);
  fireEvent.doubleClick(canvas, { clientX: at.clientX, clientY: at.clientY, ...init });
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({});
});

describe('TsldCanvas — a double-click on a bar', () => {
  it('reports the bar after two plain selects of it', () => {
    const { canvas, onActivateBar } = mount();
    doubleClick(canvas, ON_A1);
    expect(onActivateBar).toHaveBeenCalledExactlyOnceWith('a1');
  });

  it('reports it with the pen held too, where the presses run the gesture machine, and starts no move', () => {
    const { canvas, onActivateBar, onIntent } = mount({ editing: true, canReposition: true });
    doubleClick(canvas, ON_A1);
    expect(onActivateBar).toHaveBeenCalledExactlyOnceWith('a1');
    expect(onIntent).not.toHaveBeenCalled();
  });

  it('reports a second double-click, not just the first', () => {
    const { canvas, onActivateBar } = mount();
    doubleClick(canvas, ON_A1);
    doubleClick(canvas, ON_A1);
    expect(onActivateBar).toHaveBeenCalledTimes(2);
  });

  it.each(['link', 'loe', 'marquee', 'add-activity'] as const)(
    'does nothing in the %s tool',
    (mode) => {
      const { canvas, onActivateBar } = mount({ editing: true, mode, createType: 'TASK' });
      doubleClick(canvas, ON_A1);
      expect(onActivateBar).not.toHaveBeenCalled();
    },
  );

  it('does nothing on empty ground', () => {
    const { canvas, onActivateBar } = mount();
    doubleClick(canvas, ON_GROUND);
    expect(onActivateBar).not.toHaveBeenCalled();
  });

  it('does nothing when the second click landed on a different bar', () => {
    const { canvas, onActivateBar } = mount();
    click(canvas, ON_A1);
    click(canvas, ON_A2);
    fireEvent.doubleClick(canvas, ON_A2);
    expect(onActivateBar).not.toHaveBeenCalled();
  });

  it('does nothing after a drag of the bar: the move is not a select', () => {
    const { canvas, onActivateBar, onIntent } = mount({ editing: true, canReposition: true });
    click(canvas, ON_A1);
    fireEvent.pointerDown(canvas, ON_A1);
    fireEvent.pointerMove(canvas, { ...ON_A1, clientX: ON_A1.clientX + 80 });
    fireEvent.pointerUp(canvas, { ...ON_A1, clientX: ON_A1.clientX + 80 });
    fireEvent.click(canvas);
    fireEvent.doubleClick(canvas, ON_A1);
    expect(onIntent).toHaveBeenCalled();
    expect(onActivateBar).not.toHaveBeenCalled();
  });

  it('does nothing after a pan of the ground', () => {
    const { canvas, onActivateBar } = mount();
    click(canvas, ON_A1);
    fireEvent.pointerDown(canvas, ON_A1);
    fireEvent.pointerMove(canvas, { ...ON_A1, clientX: ON_A1.clientX - 60 });
    fireEvent.pointerUp(canvas, { ...ON_A1, clientX: ON_A1.clientX - 60 });
    fireEvent.click(canvas);
    fireEvent.doubleClick(canvas, ON_A1);
    expect(onActivateBar).not.toHaveBeenCalled();
  });

  it('does nothing for a Ctrl-click or Shift-click pair: those are selection edits', () => {
    for (const init of [{ ctrlKey: true }, { shiftKey: true }]) {
      const { canvas, onActivateBar } = mount({ editing: true, canReposition: true });
      doubleClick(canvas, ON_A1, init);
      expect(onActivateBar).not.toHaveBeenCalled();
    }
  });

  it('does nothing while a create popover is open', () => {
    const { canvas, onActivateBar } = mount({
      editing: true,
      pending: { startDay: 1, endDay: 3, laneIndex: 0 },
    });
    doubleClick(canvas, ON_A1);
    expect(onActivateBar).not.toHaveBeenCalled();
  });
});
