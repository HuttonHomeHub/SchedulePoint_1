import { describe, expect, it } from 'vitest';

import { makeWorkingDayWalk, type Viewport } from '../render/render-model';

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

describe('gesture-machine: two-click link tool (M5)', () => {
  const body = (id: string): { kind: 'body'; id: string } => ({ kind: 'body', id });

  it('ignores clicks outside link mode', () => {
    const r = reduce(IDLE, { type: 'click', hit: body('a') }, ctx('select'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });

  it('first body click picks the predecessor', () => {
    const r = reduce(IDLE, { type: 'click', hit: body('a') }, ctx('link'));
    expect(r.state).toEqual({ kind: 'linkPicking', predecessorId: 'a' });
    expect(r.intent).toBeUndefined();
  });

  it('a click on empty space with no pick does nothing', () => {
    const r = reduce(IDLE, { type: 'click', hit: { kind: 'empty' } }, ctx('link'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });

  it('second body click commits the link with the tool-selected type', () => {
    const picked: GestureState = { kind: 'linkPicking', predecessorId: 'a' };
    const r = reduce(picked, { type: 'click', hit: body('b') }, { ...ctx('link'), linkType: 'SS' });
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toEqual({
      kind: 'link',
      predecessorId: 'a',
      successorId: 'b',
      type: 'SS',
    });
  });

  it('defaults the link type to FS when none is supplied', () => {
    const picked: GestureState = { kind: 'linkPicking', predecessorId: 'a' };
    const r = reduce(picked, { type: 'click', hit: body('b') }, ctx('link'));
    expect(r.intent).toMatchObject({ kind: 'link', type: 'FS' });
  });

  it('clicking the same activity again cancels the pick (no self-link)', () => {
    const picked: GestureState = { kind: 'linkPicking', predecessorId: 'a' };
    const r = reduce(picked, { type: 'click', hit: body('a') }, ctx('link'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });

  it('clicking empty space cancels an in-progress pick', () => {
    const picked: GestureState = { kind: 'linkPicking', predecessorId: 'a' };
    const r = reduce(picked, { type: 'click', hit: { kind: 'empty' } }, ctx('link'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });

  it('escape clears a pick', () => {
    const picked: GestureState = { kind: 'linkPicking', predecessorId: 'a' };
    expect(reduce(picked, { type: 'escape' }, ctx('link')).state).toEqual(IDLE);
  });
});

describe('gesture-machine: two-click LOE endpoint-pick tool (Stage D)', () => {
  const body = (id: string): { kind: 'body'; id: string } => ({ kind: 'body', id });

  it('ignores clicks outside loe mode (mutual exclusion with select/link/add)', () => {
    // A body click in any non-loe mode never starts an LOE pick.
    expect(reduce(IDLE, { type: 'click', hit: body('a') }, ctx('select')).state).toEqual(IDLE);
    expect(reduce(IDLE, { type: 'click', hit: body('a') }, ctx('add-activity')).state).toEqual(
      IDLE,
    );
    // In link mode a body click starts a LINK pick, never a loePicking state.
    expect(reduce(IDLE, { type: 'click', hit: body('a') }, ctx('link')).state).toEqual({
      kind: 'linkPicking',
      predecessorId: 'a',
    });
  });

  it('first body click picks the start driver and prompts for the finish', () => {
    const r = reduce(IDLE, { type: 'click', hit: body('a') }, ctx('loe'));
    expect(r.state).toEqual({ kind: 'loePicking', startId: 'a' });
    expect(r.intent).toBeUndefined();
    expect(r.loe).toEqual({ kind: 'start', startId: 'a' });
  });

  it('a click on empty space with no pick does nothing', () => {
    const r = reduce(IDLE, { type: 'click', hit: { kind: 'empty' } }, ctx('loe'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
    expect(r.loe).toBeUndefined();
  });

  it('second body click commits a loeSpan intent (start → finish)', () => {
    const picked: GestureState = { kind: 'loePicking', startId: 'a' };
    const r = reduce(picked, { type: 'click', hit: body('b') }, ctx('loe'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toEqual({ kind: 'loeSpan', startDriverId: 'a', finishDriverId: 'b' });
  });

  it('rejects picking the SAME activity twice — stays armed and re-prompts (no self-span)', () => {
    const picked: GestureState = { kind: 'loePicking', startId: 'a' };
    const r = reduce(picked, { type: 'click', hit: body('a') }, ctx('loe'));
    // The pick is retained (not cancelled) and no span is committed.
    expect(r.state).toEqual(picked);
    expect(r.intent).toBeUndefined();
    expect(r.loe).toEqual({ kind: 'reprompt' });
  });

  it('clicking empty space cancels an in-progress pick (tool stays armed)', () => {
    const picked: GestureState = { kind: 'loePicking', startId: 'a' };
    const r = reduce(picked, { type: 'click', hit: { kind: 'empty' } }, ctx('loe'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
    expect(r.loe).toEqual({ kind: 'cancel' });
  });

  it('escape clears a pick', () => {
    const picked: GestureState = { kind: 'loePicking', startId: 'a' };
    expect(reduce(picked, { type: 'escape' }, ctx('loe')).state).toEqual(IDLE);
  });

  it('a loe-mode click never routes through the link path (no link intent)', () => {
    const picked: GestureState = { kind: 'loePicking', startId: 'a' };
    const r = reduce(picked, { type: 'click', hit: body('b') }, { ...ctx('loe'), linkType: 'SS' });
    expect(r.intent?.kind).toBe('loeSpan');
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

describe('gesture-machine: finish-edge resize (ADR-0052 M2)', () => {
  // pxPerDay 10 → day = floor(x/10). Bar a: days 2..5 (duration 4) at lane 1; finish edge at x=60.
  const body = { id: 'a', startDay: 2, endDay: 5, laneIndex: 1 };
  const grab = (): GestureState =>
    reduce(
      IDLE,
      {
        type: 'pointerDown',
        point: { x: 58, y: 40 },
        hit: { kind: 'resizeFinish', id: 'a' },
        body,
      },
      ctx('select'),
    ).state;
  const move = (state: GestureState, x: number): GestureState =>
    reduce(state, { type: 'pointerMove', point: { x, y: 40 } }, ctx('select')).state;

  it('starts a resizing state on a resizeFinish grab, seeded from the bar geometry', () => {
    expect(grab()).toEqual({
      kind: 'resizing',
      activityId: 'a',
      edge: 'finish',
      grabX: 58,
      movedPastThreshold: false,
      originStartDay: 2,
      originDurationDays: 4,
      laneIndex: 1,
      currentStartDay: 2,
      currentDurationDays: 4,
    });
  });

  it('snaps the tentative duration to whole day columns as the pointer moves', () => {
    // x=85 → day column 8 as the new inclusive finish → duration 8 - 2 + 1 = 7.
    expect(move(grab(), 85)).toMatchObject({
      kind: 'resizing',
      currentDurationDays: 7,
      movedPastThreshold: true,
    });
  });

  it('commits a resize intent with the new duration on release', () => {
    const up = reduce(move(grab(), 85), { type: 'pointerUp' }, ctx('select'));
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toEqual({
      kind: 'resize',
      activityId: 'a',
      edge: 'finish',
      newDurationDays: 7,
    });
  });

  it('clamps the duration at one day when dragged left past the start', () => {
    // x=5 → day 0, before the start day (2) → clamped to duration 1, never inverted.
    const up = reduce(move(grab(), 5), { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toEqual({
      kind: 'resize',
      activityId: 'a',
      edge: 'finish',
      newDurationDays: 1,
    });
  });

  it('selects (no intent) when the press never moved', () => {
    const up = reduce(grab(), { type: 'pointerUp' }, ctx('select'));
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toBeUndefined();
    expect(up.select).toBe('a');
  });

  it('selects (no intent) when a sub-threshold jitter crosses a day at low zoom', () => {
    // pxPerDay 2: a 3px jitter crosses a day column but stays under the 4px threshold — the same
    // click-jitter guard as reposition, so it must select, not commit a 1-day duration change.
    const lowZoom: GestureCtx = {
      mode: 'select',
      view: { pxPerDay: 2, originX: 0, originY: 0 },
      dataDate: '2026-01-01',
    };
    const lowBody = { id: 'a', startDay: 0, endDay: 4, laneIndex: 0 };
    const grabbed = reduce(
      IDLE,
      {
        type: 'pointerDown',
        point: { x: 9, y: 5 },
        hit: { kind: 'resizeFinish', id: 'a' },
        body: lowBody,
      },
      lowZoom,
    ).state;
    const moved = reduce(grabbed, { type: 'pointerMove', point: { x: 12, y: 5 } }, lowZoom);
    expect(moved.state).toMatchObject({ kind: 'resizing', movedPastThreshold: false });
    const up = reduce(moved.state, { type: 'pointerUp' }, lowZoom);
    expect(up.intent).toBeUndefined();
    expect(up.select).toBe('a');
  });

  it('selects (no intent) when the drag lands back on the original duration', () => {
    // Out past a day boundary (threshold trips), then back onto the origin finish column.
    const wandered = move(move(grab(), 85), 58);
    const up = reduce(wandered, { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toBeUndefined();
    expect(up.select).toBe('a');
  });

  it('cancels a resize on escape with no intent', () => {
    const r = reduce(move(grab(), 85), { type: 'escape' }, ctx('select'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });

  it('is inert on a resizeFinish grab without the bar geometry (nothing to resize)', () => {
    const r = reduce(
      IDLE,
      { type: 'pointerDown', point: { x: 58, y: 40 }, hit: { kind: 'resizeFinish', id: 'a' } },
      ctx('select'),
    );
    expect(r.state).toEqual(IDLE);
  });

  it('is inert on a resizeStart grab without the bar geometry (nothing to resize)', () => {
    const r = reduce(
      IDLE,
      { type: 'pointerDown', point: { x: 21, y: 40 }, hit: { kind: 'resizeStart', id: 'a' } },
      ctx('select'),
    );
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });

  it('flag-off parity: startHandle/finishHandle hits still start the linking rubber-band', () => {
    // Without the resize vocabulary (classifyHit called with no options — the flag-off path), a
    // bar-end press classifies as start/finishHandle and behaves exactly as before this milestone.
    const r = reduce(
      IDLE,
      { type: 'pointerDown', point: { x: 58, y: 40 }, hit: { kind: 'finishHandle', id: 'a' } },
      ctx('select'),
    );
    expect(r.state).toMatchObject({ kind: 'linking', sourceId: 'a', sourceHandle: 'finishHandle' });
  });
});

describe('gesture-machine: start-edge resize (ADR-0052 M3)', () => {
  // pxPerDay 10 → day = floor(x/10). Bar a: days 2..5 (duration 4) at lane 1; start edge at x=20,
  // inclusive finish day 5 (pinned throughout).
  const body = { id: 'a', startDay: 2, endDay: 5, laneIndex: 1 };
  const grab = (): GestureState =>
    reduce(
      IDLE,
      {
        type: 'pointerDown',
        point: { x: 21, y: 40 },
        hit: { kind: 'resizeStart', id: 'a' },
        body,
      },
      ctx('select'),
    ).state;
  const move = (state: GestureState, x: number): GestureState =>
    reduce(state, { type: 'pointerMove', point: { x, y: 40 } }, ctx('select')).state;

  it('starts a resizing state with edge start, seeded from the bar geometry', () => {
    expect(grab()).toEqual({
      kind: 'resizing',
      activityId: 'a',
      edge: 'start',
      grabX: 21,
      movedPastThreshold: false,
      originStartDay: 2,
      originDurationDays: 4,
      laneIndex: 1,
      currentStartDay: 2,
      currentDurationDays: 4,
    });
  });

  it('moves the start and recomputes the duration off the pinned finish as the pointer moves', () => {
    // x=5 → day 0 as the new start → duration = 5 - 0 + 1 = 6 (finish still day 5).
    expect(move(grab(), 5)).toMatchObject({
      kind: 'resizing',
      currentStartDay: 0,
      currentDurationDays: 6,
      movedPastThreshold: true,
    });
    // x=45 → day 4 → duration = 5 - 4 + 1 = 2 (shrunk from the left, finish pinned).
    expect(move(grab(), 45)).toMatchObject({
      kind: 'resizing',
      currentStartDay: 4,
      currentDurationDays: 2,
    });
  });

  it('clamps the start at the finish day (duration never below 1, bar never inverted)', () => {
    // x=95 → day 9, past the inclusive finish (5) → clamped to start=5, duration 1.
    expect(move(grab(), 95)).toMatchObject({
      kind: 'resizing',
      currentStartDay: 5,
      currentDurationDays: 1,
    });
  });

  it('commits a start-edge resize intent with the new start + duration on release', () => {
    const up = reduce(move(grab(), 5), { type: 'pointerUp' }, ctx('select'));
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toEqual({
      kind: 'resize',
      activityId: 'a',
      edge: 'start',
      newStartDay: 0,
      newDurationDays: 6,
    });
  });

  it('selects (no intent) when the press never moved, or landed back on the origin start', () => {
    const untouched = reduce(grab(), { type: 'pointerUp' }, ctx('select'));
    expect(untouched.intent).toBeUndefined();
    expect(untouched.select).toBe('a');
    // Out past a day boundary (threshold trips), then back onto the origin start column.
    const wandered = move(move(grab(), 5), 25);
    const up = reduce(wandered, { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toBeUndefined();
    expect(up.select).toBe('a');
  });

  it('cancels a start-edge resize on escape with no intent', () => {
    const r = reduce(move(grab(), 5), { type: 'escape' }, ctx('select'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
  });
});

describe('gesture-machine: lag-anchor drag (ADR-0052 M3)', () => {
  // Synthetic week: offsets 0–4 working, 5–6 not (repeating). Predecessor days 0..2; an FS+1
  // anchor sits at walk(3, 1) = day 4 (x=40..49 under pxPerDay 10).
  const working = (d: number): boolean => ((d % 7) + 7) % 7 < 5;
  const walk = makeWorkingDayWalk(working);
  const grabLag = (lagDays = 1): GestureState =>
    reduce(
      IDLE,
      {
        type: 'pointerDown',
        point: { x: 42, y: 14 },
        hit: { kind: 'lagAnchor', id: 's', dependencyId: 'd1' },
        lag: {
          dependencyId: 'd1',
          type: 'FS',
          lagDays,
          predStartDay: 0,
          predFinishDay: 2,
          walk,
          anchorY: 14,
        },
      },
      ctx('select'),
    ).state;
  const move = (state: GestureState, x: number): GestureState =>
    reduce(state, { type: 'pointerMove', point: { x, y: 14 } }, ctx('select')).state;

  it('starts a lagDragging state seeded from the grab context', () => {
    expect(grabLag()).toEqual({
      kind: 'lagDragging',
      dependencyId: 'd1',
      depType: 'FS',
      grabX: 42,
      movedPastThreshold: false,
      originLagDays: 1,
      currentLagDays: 1,
      predStartDay: 0,
      predFinishDay: 2,
      walk,
      anchorY: 14,
    });
  });

  it('is inert on a lagAnchor hit without the grab context', () => {
    const r = reduce(
      IDLE,
      {
        type: 'pointerDown',
        point: { x: 42, y: 14 },
        hit: { kind: 'lagAnchor', id: 's', dependencyId: 'd1' },
      },
      ctx('select'),
    );
    expect(r.state).toEqual(IDLE);
  });

  it('snaps the tentative lag to whole working days via the inverse anchor mapping', () => {
    // FS from finish day 2: lag 0 anchors day 3, lag 1 → day 4, lag 2 → day 7 (5/6 non-working).
    expect(move(grabLag(), 75)).toMatchObject({ kind: 'lagDragging', currentLagDays: 2 });
    // A pointer over a non-working day (day 5) snaps toward zero: still lag 1.
    expect(move(grabLag(), 55)).toMatchObject({ kind: 'lagDragging', currentLagDays: 1 });
    expect(move(grabLag(), 32)).toMatchObject({ kind: 'lagDragging', currentLagDays: 0 });
  });

  it('goes negative (a lead) when dragged left of the zero-lag anchor', () => {
    // Day 2 is one working day LEFT of the zero-lag anchor (day 3) → lag -1.
    expect(move(grabLag(), 25)).toMatchObject({ kind: 'lagDragging', currentLagDays: -1 });
  });

  it('commits a lag intent with the new signed lag on release', () => {
    const up = reduce(move(grabLag(), 75), { type: 'pointerUp' }, ctx('select'));
    expect(up.state).toEqual(IDLE);
    expect(up.intent).toEqual({ kind: 'lag', dependencyId: 'd1', newLagDays: 2 });
  });

  it('commits nothing when the press never moved, or the lag landed back unchanged', () => {
    const untouched = reduce(grabLag(), { type: 'pointerUp' }, ctx('select'));
    expect(untouched.state).toEqual(IDLE);
    expect(untouched.intent).toBeUndefined();
    expect(untouched.select).toBeUndefined();
    // Threshold tripped but back on the original lag column → no intent.
    const wandered = move(move(grabLag(), 75), 42);
    const up = reduce(wandered, { type: 'pointerUp' }, ctx('select'));
    expect(up.intent).toBeUndefined();
  });

  it('cancels a lag drag on escape with no intent', () => {
    const r = reduce(move(grabLag(), 75), { type: 'escape' }, ctx('select'));
    expect(r.state).toEqual(IDLE);
    expect(r.intent).toBeUndefined();
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
