import { describe, expect, it } from 'vitest';

import type { Viewport } from '../render/render-model';

import { IDLE, reduce, type GestureCtx, type Modifiers } from './gesture-machine';

/**
 * **A press carries its select modifier** (ADR-0218 D5, `docs/specs/diagram-keys-and-selection/` M4).
 *
 * A press on a bar becomes `repositioning` (or `resizing` on an edge) whenever the machine runs, and
 * an unmoved release used to return `select` with nothing else, so the canvas called `onSelect(id)`
 * and a Ctrl- or Shift-click replaced the selection instead of toggling or extending it. The modifier
 * is captured at PRESS, as the marquee's `additive` is, so lifting the key before the button changes nothing.
 */
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const CTX: GestureCtx = { mode: 'select', view: VIEW, dataDate: '2026-01-01' };
const BODY = { id: 'a', startDay: 2, endDay: 4, laneIndex: 1 };

const grab = (kind: 'body' | 'resizeFinish' | 'resizeStart', modifiers?: Modifiers) => ({
  type: 'pointerDown' as const,
  point: { x: 30, y: 70 },
  hit: { kind, id: 'a' },
  body: BODY,
  ...(modifiers ? { modifiers } : {}),
});

describe.each(['body', 'resizeFinish', 'resizeStart'] as const)(
  'an unmoved press on %s',
  (kind) => {
    it('returns toggle for Ctrl/Cmd', () => {
      const down = reduce(IDLE, grab(kind, { ctrl: true }), CTX).state;
      expect(reduce(down, { type: 'pointerUp' }, CTX)).toMatchObject({
        select: 'a',
        selectModifier: 'toggle',
      });
    });

    it('returns span for Shift', () => {
      const down = reduce(IDLE, grab(kind, { shift: true }), CTX).state;
      expect(reduce(down, { type: 'pointerUp' }, CTX)).toMatchObject({
        select: 'a',
        selectModifier: 'span',
      });
    });

    it('prefers toggle when both are held', () => {
      const down = reduce(IDLE, grab(kind, { ctrl: true, shift: true }), CTX).state;
      expect(reduce(down, { type: 'pointerUp' }, CTX).selectModifier).toBe('toggle');
    });

    it('returns no modifier for a plain press, so the select stays a replace', () => {
      const down = reduce(IDLE, grab(kind), CTX).state;
      const out = reduce(down, { type: 'pointerUp' }, CTX);
      expect(out.select).toBe('a');
      expect(out).not.toHaveProperty('selectModifier');
    });
  },
);

describe('capture at press', () => {
  it('keeps the modifier through a jitter that stays under the move threshold', () => {
    const down = reduce(IDLE, grab('body', { ctrl: true }), CTX).state;
    const jitter = reduce(down, { type: 'pointerMove', point: { x: 31, y: 70 } }, CTX).state;
    expect(reduce(jitter, { type: 'pointerUp' }, CTX).selectModifier).toBe('toggle');
  });

  it('does not select at all when the press became a real move', () => {
    const down = reduce(IDLE, grab('body', { ctrl: true }), CTX).state;
    const moved = reduce(down, { type: 'pointerMove', point: { x: 130, y: 70 } }, CTX).state;
    const out = reduce(moved, { type: 'pointerUp' }, CTX);
    expect(out.select).toBeUndefined();
    expect(out.intent?.kind).toBe('reposition');
  });
});
