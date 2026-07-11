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

describe('gesture-machine: reposition-in-time', () => {
  const body = { id: 'a', startDay: 2, endDay: 5, laneIndex: 1 };
  const grab = (): GestureState =>
    reduce(
      IDLE,
      { type: 'pointerDown', point: { x: 25, y: 40 }, hit: { kind: 'body', id: 'a' }, body },
      ctx('select'),
    ).state;

  it('starts a reposition ghost when a bar body is grabbed in select mode', () => {
    expect(grab()).toEqual({
      kind: 'repositioning',
      activityId: 'a',
      grabDay: 2,
      originStartDay: 2,
      spanDays: 3,
      laneIndex: 1,
      currentStartDay: 2,
    });
  });

  it('shifts the start day by whole day columns as the pointer moves', () => {
    const moved = reduce(grab(), { type: 'pointerMove', point: { x: 55, y: 40 } }, ctx('select'));
    expect(moved.state).toMatchObject({ kind: 'repositioning', currentStartDay: 5 });
  });

  it('commits an SNET reposition intent on release after a move', () => {
    const moved = reduce(grab(), { type: 'pointerMove', point: { x: 55, y: 40 } }, ctx('select'));
    const up = reduce(moved.state, { type: 'pointerUp' }, ctx('select'));
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toEqual({ kind: 'reposition', activityId: 'a', startDay: 5 });
  });

  it('selects (does not reposition) when a bar is pressed without moving', () => {
    const up = reduce(grab(), { type: 'pointerUp' }, ctx('select'));
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toBeUndefined();
    expect(up.select).toBe('a');
  });

  it('creates (mode wins) even on a bar body in add-activity mode', () => {
    const r = reduce(
      IDLE,
      { type: 'pointerDown', point: { x: 25, y: 40 }, hit: { kind: 'body', id: 'a' }, body },
      ctx('add-activity'),
    );
    expect(r.state).toMatchObject({ kind: 'creating' });
  });
});
