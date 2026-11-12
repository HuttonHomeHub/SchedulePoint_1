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

import { BAR_HEIGHT, BAR_PAD, DEFAULT_VIEWPORT, type RenderActivity } from '../render/render-model';

import { TsldCanvas } from './TsldCanvas';

const BAR_Y = DEFAULT_VIEWPORT.originY + BAR_PAD + BAR_HEIGHT / 2;

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
  const onIntent = vi.fn();
  const utils = render(
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-01-01"
      selectedId={null}
      onSelect={onSelect}
      onIntent={onIntent}
      mode="select"
      canReposition
      fitSignal={0}
      {...props}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  return { canvas, onSelect, onIntent };
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({});
});

const AT = { clientX: 70, clientY: BAR_Y, pointerId: 1 };
function click(
  canvas: Element,
  mods: { ctrlKey?: boolean; shiftKey?: boolean; metaKey?: boolean },
) {
  fireEvent.pointerDown(canvas, { ...AT, ...mods });
  fireEvent.pointerUp(canvas, { ...AT, ...mods });
}

/**
 * **An unmoved Ctrl- or Shift-click on a bar keeps its modifier, pen or no pen** (ADR-0218 D5).
 *
 * With a reposition handler wired, Ctrl arms the gesture machine for every reader and the pen arms it
 * for every press, so a click on a bar goes through `repositioning` and used to reach `onSelect`
 * with no modifier, which is a replace.
 */
describe('TsldCanvas — a modified click on a bar', () => {
  it.each([
    ['Ctrl, with the pen', { ctrlKey: true }, true, 'toggle'],
    ['Cmd, with the pen', { metaKey: true }, true, 'toggle'],
    ['Ctrl, without the pen', { ctrlKey: true }, false, 'toggle'],
    ['Shift, with the pen', { shiftKey: true }, true, 'span'],
    ['Shift, without the pen', { shiftKey: true }, false, 'span'],
  ] as const)('%s selects with %s', (_name, mods, editing, expected) => {
    const { canvas, onSelect, onIntent } = mount({ editing });
    click(canvas, mods);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('a1', expected);
    expect(onIntent).not.toHaveBeenCalled();
  });

  it('keeps a plain click a one-argument replace', () => {
    const { canvas, onSelect } = mount({ editing: true });
    click(canvas, {});
    expect(onSelect).toHaveBeenCalledWith('a1');
  });

  it('does not select when the Ctrl press became a move', () => {
    const { canvas, onSelect, onIntent } = mount({ editing: true });
    fireEvent.pointerDown(canvas, { ...AT, ctrlKey: true });
    fireEvent.pointerMove(canvas, { ...AT, clientX: AT.clientX + 200, ctrlKey: true });
    fireEvent.pointerUp(canvas, { ...AT, clientX: AT.clientX + 200, ctrlKey: true });
    expect(onSelect).not.toHaveBeenCalled();
    expect(onIntent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'reposition' }),
      expect.anything(),
    );
  });

  it('uses the modifier held at press, not the one held at release', () => {
    const { canvas, onSelect } = mount({ editing: true });
    fireEvent.pointerDown(canvas, { ...AT, ctrlKey: true });
    fireEvent.pointerUp(canvas, AT);
    expect(onSelect).toHaveBeenCalledWith('a1', 'toggle');
  });
});
