import { describe, expect, it } from 'vitest';

import type { Viewport } from '../render/render-model';

import { IDLE, reduce, type GestureCtx, type GestureState } from './gesture-machine';

// pxPerDay 10, origin 0 → day = floor(x/10), lane = floor(y/28).
const VIEW: Viewport = { pxPerDay: 10, originX: 0, originY: 0 };
const ctx = (mode: GestureCtx['mode']): GestureCtx => ({
  mode,
  view: VIEW,
  dataDate: '2026-01-01',
});

describe('gesture-machine: create-by-drag', () => {
  it('stays idle on pointer-down in select mode (canvas keeps its M1 pan/select path)', () => {
    const r = reduce(
      IDLE,
      { type: 'pointerDown', point: { x: 55, y: 10 }, hit: { kind: 'empty' } },
      ctx('select'),
    );
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });

  it('starts a create ghost at the pointer day/lane in add-activity mode', () => {
    const r = reduce(
      IDLE,
      { type: 'pointerDown', point: { x: 25, y: 40 }, hit: { kind: 'empty' } },
      ctx('add-activity'),
    );
    expect(r.state).toEqual({ kind: 'creating', originDay: 2, laneIndex: 1, currentDay: 2 });
    expect(r.intent).toBeUndefined();
  });

  it('tracks the current day as the pointer moves', () => {
    const start: GestureState = { kind: 'creating', originDay: 2, laneIndex: 1, currentDay: 2 };
    const r = reduce(start, { type: 'pointerMove', point: { x: 58, y: 40 } }, ctx('add-activity'));
    expect(r.state).toEqual({ kind: 'creating', originDay: 2, laneIndex: 1, currentDay: 5 });
  });

  it('commits a whole-day span on release (normalising a right-to-left drag)', () => {
    const dragged: GestureState = { kind: 'creating', originDay: 6, laneIndex: 1, currentDay: 2 };
    const r = reduce(dragged, { type: 'pointerUp' }, ctx('add-activity'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toEqual({ kind: 'create', startDay: 2, endDay: 6, laneIndex: 1 });
  });

  it('commits a 1-day task for a click (origin === current)', () => {
    const clicked: GestureState = { kind: 'creating', originDay: 3, laneIndex: 0, currentDay: 3 };
    const r = reduce(clicked, { type: 'pointerUp' }, ctx('add-activity'));
    expect(r.intent).toEqual({ kind: 'create', startDay: 3, endDay: 3, laneIndex: 0 });
  });

  it('cancels an in-flight create on escape with no intent', () => {
    const dragged: GestureState = { kind: 'creating', originDay: 2, laneIndex: 1, currentDay: 5 };
    const r = reduce(dragged, { type: 'escape' }, ctx('add-activity'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });

  it('emits nothing on a pointer-up with no active gesture', () => {
    const r = reduce(IDLE, { type: 'pointerUp' }, ctx('add-activity'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });
});
