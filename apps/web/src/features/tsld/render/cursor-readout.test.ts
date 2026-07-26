import { describe, expect, it } from 'vitest';

import type { GestureState } from '../interaction/gesture-machine';

import { cursorReadout } from './cursor-readout';
import { ELAPSED_DAY_WALK, screenXOfDay, type Viewport } from './render-model';

/**
 * Cursor date readout (ADR-0054 §2). The contract worth pinning is not the formatting — it is
 * **which day** each gesture reports: the one that will be COMMITTED, taken from the gesture
 * state, never the raw pixel under the pointer. A drag that snaps to whole days must show the day
 * it lands on, or the readout is worse than none.
 */
const VIEW: Viewport = { pxPerDay: 12, originX: 60, originY: 40 };
const DATA_DATE = '2026-01-01';

const read = (state: GestureState, point: { x: number; y: number } | null = null) =>
  cursorReadout({ state, point, view: VIEW, dataDate: DATA_DATE });

describe('cursorReadout — the day reported is the day committed', () => {
  it('reports the tentative START while repositioning, not the pointer', () => {
    const state: GestureState = {
      kind: 'repositioning',
      activityId: 'a',
      grabDay: 3,
      grabX: 0,
      grabY: 0,
      movedPastThreshold: true,
      originStartDay: 3,
      spanDays: 4,
      laneIndex: 0,
      currentStartDay: 9,
      currentLaneIndex: 0,
    };
    // A pointer parked far from the snapped day must not move the readout.
    const out = read(state, { x: 1234, y: 0 });
    expect(out?.x).toBe(screenXOfDay(9, VIEW));
  });

  it('reports the tentative FINISH on a finish-edge resize', () => {
    const state: GestureState = {
      kind: 'resizing',
      activityId: 'a',
      edge: 'finish',
      grabX: 0,
      movedPastThreshold: true,
      originStartDay: 2,
      originDurationDays: 3,
      laneIndex: 0,
      currentStartDay: 2,
      currentDurationDays: 5,
    };
    // Inclusive finish = 2 + 5 - 1 = 6; the guideline sits on that day's right-hand boundary.
    expect(read(state)?.x).toBe(screenXOfDay(7, VIEW));
  });

  it('reports the tentative START on a start-edge resize — the edge being held', () => {
    const state: GestureState = {
      kind: 'resizing',
      activityId: 'a',
      edge: 'start',
      grabX: 0,
      movedPastThreshold: true,
      originStartDay: 2,
      originDurationDays: 3,
      laneIndex: 0,
      currentStartDay: 4,
      currentDurationDays: 1,
    };
    expect(read(state)?.x).toBe(screenXOfDay(4, VIEW));
  });

  it('reports the span and its inclusive duration while creating', () => {
    const state: GestureState = { kind: 'creating', originDay: 2, laneIndex: 0, currentDay: 6 };
    expect(read(state)?.label).toMatch(/·\s*5d$/);
  });

  it('reads the span the same way when the drag runs right-to-left', () => {
    const forward: GestureState = { kind: 'creating', originDay: 2, laneIndex: 0, currentDay: 6 };
    const backward: GestureState = { kind: 'creating', originDay: 6, laneIndex: 0, currentDay: 2 };
    expect(read(backward)).toEqual(read(forward));
  });

  it('falls back to the pointer’s own day column when idle', () => {
    const x = screenXOfDay(11, VIEW) + 3; // mid-column
    expect(read({ kind: 'idle' }, { x, y: 0 })?.x).toBe(screenXOfDay(11, VIEW));
  });

  it('yields nothing when idle with no pointer — nothing honest to report', () => {
    expect(read({ kind: 'idle' }, null)).toBeNull();
  });

  it('defers to the ADR-0052 lag chip during a lag drag rather than racing it', () => {
    const state: GestureState = {
      kind: 'lagDragging',
      dependencyId: 'd',
      depType: 'FS',
      grabX: 0,
      movedPastThreshold: true,
      originLagDays: 0,
      currentLagDays: 3,
      predStartDay: 0,
      predFinishDay: 2,
      walk: ELAPSED_DAY_WALK,
      anchorY: 50,
    };
    expect(read(state, { x: 100, y: 50 })).toBeNull();
  });

  it('reports a date for every gesture that changes a date', () => {
    const linking: GestureState = {
      kind: 'linking',
      sourceId: 'a',
      sourceHandle: 'finishHandle',
      point: { x: 200, y: 60 },
      targetId: null,
      type: 'FS',
    };
    // A link drag changes no date, so it reads as a plain date ruler under the pointer.
    expect(read(linking, { x: 200, y: 60 })?.label).toBeTruthy();
  });
});
