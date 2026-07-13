import { describe, expect, it } from 'vitest';

import type { Viewport } from '../render/render-model';

import {
  IDLE,
  modifiersToLinkType,
  reduce,
  type GestureCtx,
  type GestureState,
} from './gesture-machine';

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
    expect(r.intent).toEqual({
      kind: 'create',
      type: 'TASK',
      startDay: 2,
      endDay: 6,
      laneIndex: 1,
    });
  });

  it('commits a 1-day task for a click (origin === current)', () => {
    const clicked: GestureState = { kind: 'creating', originDay: 3, laneIndex: 0, currentDay: 3 };
    const r = reduce(clicked, { type: 'pointerUp' }, ctx('add-activity'));
    expect(r.intent).toEqual({
      kind: 'create',
      type: 'TASK',
      startDay: 3,
      endDay: 3,
      laneIndex: 0,
    });
  });

  it('carries the ctx createType onto the intent (ADR-0032 M4)', () => {
    const clicked: GestureState = { kind: 'creating', originDay: 3, laneIndex: 0, currentDay: 3 };
    const r = reduce(
      clicked,
      { type: 'pointerUp' },
      {
        ...ctx('add-activity'),
        createType: 'START_MILESTONE',
      },
    );
    expect(r.intent).toMatchObject({ kind: 'create', type: 'START_MILESTONE' });
  });

  it('collapses a milestone draw to a zero-length point at the origin day', () => {
    // A milestone has no duration — a drag from day 6 back to day 2 still pins a single point (day 6).
    const dragged: GestureState = { kind: 'creating', originDay: 6, laneIndex: 1, currentDay: 2 };
    const r = reduce(
      dragged,
      { type: 'pointerUp' },
      {
        ...ctx('add-activity'),
        createType: 'FINISH_MILESTONE',
      },
    );
    expect(r.intent).toEqual({
      kind: 'create',
      type: 'FINISH_MILESTONE',
      startDay: 6,
      endDay: 6,
      laneIndex: 1,
    });
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
      grabX: 25,
      grabY: 40,
      movedPastThreshold: false,
      originStartDay: 2,
      spanDays: 3,
      laneIndex: 1,
      currentStartDay: 2,
      currentLaneIndex: 1,
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

  it('selects (does not reposition) when a sub-threshold jitter crosses a day at low zoom', () => {
    // A near-minimum zoom where one day column is ~2px wide: a 3px click jitter crosses a day
    // boundary but is under the 4px move threshold, so it must select, not commit an SNET move.
    const lowZoom: GestureCtx = {
      mode: 'select',
      view: { pxPerDay: 2, originX: 0, originY: 0 },
      dataDate: '2026-01-01',
    };
    const lowBody = { id: 'a', startDay: 5, endDay: 8, laneIndex: 0 };
    const grabbed = reduce(
      IDLE,
      {
        type: 'pointerDown',
        point: { x: 11, y: 5 },
        hit: { kind: 'body', id: 'a' },
        body: lowBody,
      },
      lowZoom,
    ).state;
    const moved = reduce(grabbed, { type: 'pointerMove', point: { x: 14, y: 5 } }, lowZoom);
    // The ghost tracks to the next day column, but the move stayed under the pixel threshold.
    expect(moved.state).toMatchObject({ kind: 'repositioning', movedPastThreshold: false });
    const up = reduce(moved.state, { type: 'pointerUp' }, lowZoom);
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

describe('gesture-machine: free-2D drag (M4)', () => {
  // pxPerDay 10, LANE_HEIGHT 28. Grab a lane-1 bar at (x25 → day 2, y40).
  const body = { id: 'a', startDay: 2, endDay: 5, laneIndex: 1 };
  const grab = (): GestureState =>
    reduce(
      IDLE,
      { type: 'pointerDown', point: { x: 25, y: 40 }, hit: { kind: 'body', id: 'a' }, body },
      ctx('select'),
    ).state;
  const move = (state: GestureState, x: number, y: number): GestureState =>
    reduce(state, { type: 'pointerMove', point: { x, y } }, ctx('select')).state;

  it('tracks the live lane as the pointer moves vertically (round dy / LANE_HEIGHT)', () => {
    // Down one full row (dy 28) → lane 2; the threshold trips on the vertical axis alone.
    const moved = move(grab(), 25, 68);
    expect(moved).toMatchObject({
      kind: 'repositioning',
      currentStartDay: 2,
      currentLaneIndex: 2,
      movedPastThreshold: true,
    });
  });

  it('commits a lane-only reposition (no startDay) when only the lane changed', () => {
    const up = reduce(move(grab(), 25, 68), { type: 'pointerUp' }, ctx('select'));
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toEqual({ kind: 'reposition', activityId: 'a', laneIndex: 2 });
  });

  it('commits both axes in one intent when the drag changed day and lane', () => {
    const up = reduce(move(grab(), 55, 68), { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toEqual({ kind: 'reposition', activityId: 'a', startDay: 5, laneIndex: 2 });
  });

  it('half-cell vertical wander on a time move yields NO lane change (dead-zone)', () => {
    // dx → day 5; dy 10px rounds to 0 lanes, so the lane is untouched — a pure time move.
    const up = reduce(move(grab(), 55, 50), { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toEqual({ kind: 'reposition', activityId: 'a', startDay: 5 });
  });

  it('sub-day horizontal wander on a lane move yields NO day change (dead-zone)', () => {
    // dx 2px stays in day column 2; dy 28 → lane 2 — a pure lane move.
    const up = reduce(move(grab(), 27, 68), { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toEqual({ kind: 'reposition', activityId: 'a', laneIndex: 2 });
  });

  it('clamps the lane at 0 when dragged above the first row', () => {
    // dy −56px → −2 lanes from lane 1 → clamped to 0.
    const up = reduce(move(grab(), 25, -16), { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toEqual({ kind: 'reposition', activityId: 'a', laneIndex: 0 });
  });

  it('selects (no intent) when a 2D drag returns to the origin day AND lane', () => {
    const wandered = move(move(grab(), 55, 68), 25, 40);
    const up = reduce(wandered, { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toBeUndefined();
    expect(up.select).toBe('a');
  });
});

describe('gesture-machine: dependency-draw', () => {
  it('maps modifiers to a dependency type (plain FS, Shift SS, Alt FF)', () => {
    expect(modifiersToLinkType(undefined)).toBe('FS');
    expect(modifiersToLinkType({ shift: false, alt: false })).toBe('FS');
    expect(modifiersToLinkType({ shift: true, alt: false })).toBe('SS');
    expect(modifiersToLinkType({ shift: false, alt: true })).toBe('FF');
    expect(modifiersToLinkType({ shift: true, alt: true })).toBe('SS'); // shift wins the tiebreak
  });

  const grabHandle = (
    kind: 'startHandle' | 'finishHandle',
    modifiers?: { shift: boolean; alt: boolean },
  ) =>
    reduce(
      IDLE,
      {
        type: 'pointerDown',
        point: { x: 90, y: 12 },
        hit: { kind, id: 'a' },
        ...(modifiers ? { modifiers } : {}),
      },
      ctx('select'),
    ).state;

  it('starts a rubber-band from an edge handle in select mode', () => {
    expect(grabHandle('finishHandle')).toEqual({
      kind: 'linking',
      sourceId: 'a',
      sourceHandle: 'finishHandle',
      point: { x: 90, y: 12 },
      targetId: null,
      type: 'FS',
    });
  });

  it('tracks the hovered target and live modifier type as the pointer moves', () => {
    const moved = reduce(
      grabHandle('finishHandle'),
      {
        type: 'pointerMove',
        point: { x: 200, y: 40 },
        hit: { kind: 'body', id: 'b' },
        modifiers: { shift: true, alt: false },
      },
      ctx('select'),
    );
    expect(moved.state).toMatchObject({ kind: 'linking', targetId: 'b', type: 'SS' });
  });

  it('ignores the source itself as a drop target while moving', () => {
    const moved = reduce(
      grabHandle('startHandle'),
      { type: 'pointerMove', point: { x: 95, y: 12 }, hit: { kind: 'startHandle', id: 'a' } },
      ctx('select'),
    );
    expect(moved.state).toMatchObject({ kind: 'linking', targetId: null });
  });

  it('commits a link intent on release over another activity (type from modifiers)', () => {
    const up = reduce(
      grabHandle('finishHandle'),
      { type: 'pointerUp', hit: { kind: 'body', id: 'b' }, modifiers: { shift: false, alt: true } },
      ctx('select'),
    );
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toEqual({ kind: 'link', predecessorId: 'a', successorId: 'b', type: 'FF' });
  });

  it('cancels with no intent when released over empty space', () => {
    const up = reduce(
      grabHandle('finishHandle'),
      { type: 'pointerUp', hit: { kind: 'empty' } },
      ctx('select'),
    );
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toBeUndefined();
  });

  it('cancels with no intent when released back on the source', () => {
    const up = reduce(
      grabHandle('finishHandle'),
      { type: 'pointerUp', hit: { kind: 'finishHandle', id: 'a' } },
      ctx('select'),
    );
    expect(up.intent).toBeUndefined();
  });

  it('cancels a link on escape', () => {
    const r = reduce(grabHandle('finishHandle'), { type: 'escape' }, ctx('select'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });
});
