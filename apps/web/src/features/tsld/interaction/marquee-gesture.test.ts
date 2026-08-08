import { describe, expect, it } from 'vitest';

import type { Viewport } from '../render/render-model';

import { IDLE, reduce, type GestureCtx, type GestureState } from './gesture-machine';

/**
 * The marquee sweep state (`docs/specs/canvas-multi-select/` M2-T3).
 *
 * The assertions that carry the design are the ones about what the marquee must **not** take:
 * a plain empty-ground drag still pans (the single most-used gesture on this canvas), and a press
 * on a bar still repositions. A marquee that stole either would be a far worse trade than no
 * marquee at all, so those are the first two tests.
 */
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const ctx = (mode: GestureCtx['mode']): GestureCtx => ({
  mode,
  view: VIEW,
  dataDate: '2026-01-01',
});

const EMPTY = { kind: 'empty' as const };
const press = (x: number, y: number, ctrl = false) => ({
  type: 'pointerDown' as const,
  point: { x, y },
  hit: EMPTY,
  modifiers: { shift: false, alt: false, ctrl },
});

describe('arming', () => {
  it('does NOT arm on a plain empty-ground drag — that is still the pan', () => {
    const { state } = reduce(IDLE, press(10, 10), ctx('select'));
    expect(state).toEqual(IDLE);
  });

  it('arms in select mode when ctrl/cmd is held', () => {
    const { state } = reduce(IDLE, press(10, 10, true), ctx('select'));
    expect(state.kind).toBe('marqueeing');
  });

  it('arms with no modifier when the marquee tool is armed', () => {
    const { state } = reduce(IDLE, press(10, 10), ctx('marquee'));
    expect(state.kind).toBe('marqueeing');
  });

  it('does not arm on a bar — a press on a body is still a reposition/select', () => {
    const onBar = {
      type: 'pointerDown' as const,
      point: { x: 10, y: 10 },
      hit: { kind: 'body' as const, id: 'a' },
      modifiers: { shift: false, alt: false, ctrl: true },
    };
    const { state } = reduce(IDLE, onBar, ctx('select'));
    expect(state.kind).not.toBe('marqueeing');
  });

  it('captures `additive` at PRESS, so releasing the modifier mid-drag cannot turn an add into a replace', () => {
    const armed = reduce(IDLE, press(10, 10, true), ctx('select')).state;
    const moved = reduce(
      armed,
      { type: 'pointerMove', point: { x: 90, y: 90 }, modifiers: { shift: false, alt: false } },
      ctx('select'),
    ).state;
    const { intent } = reduce(moved, { type: 'pointerUp' }, ctx('select'));
    expect(intent).toMatchObject({ kind: 'marquee', additive: true });
  });
});

describe('tracking and commit', () => {
  /** Arms via the tool mode (so `additive` is false) unless `ctrl` asks for the select-mode chord. */
  const sweep = (from: [number, number], to: [number, number], ctrl = false): GestureState => {
    const mode = ctrl ? 'select' : 'marquee';
    const armed = reduce(IDLE, press(from[0], from[1], ctrl), ctx(mode)).state;
    return reduce(armed, { type: 'pointerMove', point: { x: to[0], y: to[1] } }, ctx(mode)).state;
  };

  it('tracks raw screen points — no day-column snapping', () => {
    // 13px is not a day boundary at 10px/day. Snapping would make the drawn rectangle lag the
    // pointer, which is worst exactly where a planner is being precise.
    const state = sweep([3, 7], [13, 27]);
    expect(state).toMatchObject({
      kind: 'marqueeing',
      originPoint: { x: 3, y: 7 },
      currentPoint: { x: 13, y: 27 },
    });
  });

  it('commits a normalised rectangle however the drag ran', () => {
    const downRight = reduce(sweep([10, 10], [60, 70]), { type: 'pointerUp' }, ctx('select'));
    const upLeft = reduce(sweep([60, 70], [10, 10]), { type: 'pointerUp' }, ctx('select'));
    const expected = { kind: 'marquee', rect: { x: 10, y: 10, w: 50, h: 60 }, additive: false };
    expect(downRight.intent).toEqual(expected);
    expect(upLeft.intent).toEqual(expected);
    expect(downRight.state).toEqual(IDLE);
  });

  it('commits a ZERO-area release — that is how a click on empty ground clears a selection', () => {
    const armed = reduce(IDLE, press(20, 20, true), ctx('select')).state;
    const { intent } = reduce(armed, { type: 'pointerUp' }, ctx('select'));
    expect(intent).toEqual({ kind: 'marquee', rect: { x: 20, y: 20, w: 0, h: 0 }, additive: true });
  });

  it('Escape abandons the sweep with no intent — nothing is selected and nothing is written', () => {
    const state = sweep([10, 10], [60, 70]);
    const { state: after, intent } = reduce(state, { type: 'escape' }, ctx('select'));
    expect(after).toEqual(IDLE);
    expect(intent).toBeUndefined();
  });

  it('never emits an edit intent — a marquee writes nothing', () => {
    const { intent } = reduce(sweep([10, 10], [60, 70]), { type: 'pointerUp' }, ctx('select'));
    expect(intent?.kind).toBe('marquee');
  });
});
