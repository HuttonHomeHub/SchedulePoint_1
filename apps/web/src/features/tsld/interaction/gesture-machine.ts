import {
  dayColumnAt,
  laneRowAt,
  type HitZone,
  type Point,
  type Viewport,
} from '../render/render-model';

/**
 * The pure TSLD editing gesture machine (ADR-0026 D3/D5, M2). A reducer over pointer +
 * keyboard events that, given the current {@link EditMode} and viewport transform, drives
 * a small {@link GestureState} and — on commit — yields an {@link EditIntent}. It is the
 * "pure core" half of the canvas's core/shell split (mirroring `render-model`): **no**
 * canvas, DOM, React, or network, so it is exhaustively unit-testable. The imperative
 * shell (`TsldCanvas`) feeds it events, paints the transient state, and hands each intent
 * to `TsldPanel`, which owns the mutation + recalc (the canvas never mutates — ADR-0026 D8).
 *
 * Slices: **create-by-drag** (2.1) and **reposition-in-time** (2.2). Dependency-draw (2.3)
 * extends the `EditIntent`/`GestureState` unions and the `pointerDown` routing likewise.
 */

/** The active editing tool. `select` behaves like M1 (pan/select) + hit-zone reposition. */
export type EditMode = 'select' | 'add-activity';

/**
 * The minimum pointer travel (CSS px) that turns a body press into a real reposition rather
 * than a select — the same threshold M1 uses to tell a click from a pan (`TsldCanvas`). Without
 * it, at low zoom a day column can be ~2px wide, so ordinary click jitter would cross a day
 * boundary and commit an unintended SNET move on release.
 */
export const REPOSITION_THRESHOLD_PX = 4;

export interface GestureCtx {
  mode: EditMode;
  view: Viewport;
  /** The plan's data date (day 0), for world↔screen day mapping. */
  dataDate: string;
}

/** The grabbed activity's current geometry, supplied by the shell on a body pointer-down. */
export interface BodyGrab {
  id: string;
  /** Current early-start / -finish as whole-day offsets about the data date. */
  startDay: number;
  endDay: number;
  laneIndex: number;
}

export type GestureEvent =
  | { type: 'pointerDown'; point: Point; hit: HitZone; body?: BodyGrab }
  | { type: 'pointerMove'; point: Point }
  | { type: 'pointerUp' }
  | { type: 'escape' };

/**
 * A committed edit, emitted on drop. The canvas produces geometry (days/lanes); `TsldPanel`
 * maps it to the reused write endpoints (create → `POST /activities`; reposition → an SNET
 * `PATCH /activities/:id`) and the authoritative recalc.
 */
export type EditIntent =
  | {
      kind: 'create';
      /** Inclusive whole-day span about the data date; `startDay === endDay` is a 1-day task. */
      startDay: number;
      endDay: number;
      laneIndex: number;
    }
  | {
      kind: 'reposition';
      activityId: string;
      /** The new early-start day offset — imposed as an SNET constraint (ADR-0023). */
      startDay: number;
    };

/** The live gesture. `idle` means the machine owns nothing — the canvas pans/selects (M1). */
export type GestureState =
  | { kind: 'idle' }
  | { kind: 'creating'; originDay: number; laneIndex: number; currentDay: number }
  | {
      kind: 'repositioning';
      activityId: string;
      /** The day column grabbed at pointer-down (the drag reference). */
      grabDay: number;
      /** The screen x grabbed at pointer-down — for the pixel-distance select/move guard. */
      grabX: number;
      /** Whether the pointer has travelled past {@link REPOSITION_THRESHOLD_PX} since grab. */
      movedPastThreshold: boolean;
      originStartDay: number;
      spanDays: number;
      laneIndex: number;
      currentStartDay: number;
    };

export const IDLE: GestureState = { kind: 'idle' };

export interface Reduction {
  state: GestureState;
  /** Emitted only on a committing `pointerUp`; the shell forwards it to `onIntent`. */
  intent?: EditIntent;
  /** Set when a body press ended without moving — the shell should select this activity. */
  select?: string;
}

/**
 * Advance the gesture machine. Pure: `(state, event, ctx) → { state, intent?, select? }`.
 * In `select` mode, a `pointerDown` on empty space returns `idle` (the canvas keeps its M1
 * pan/select path); on a bar **body** it starts a reposition ghost that tracks the pointer by
 * whole-day columns and commits an SNET move on release — or, if it never moved, selects the
 * bar. In `add-activity` mode a drag draws a create ghost. `escape` (or a release with no
 * active gesture) resets to `idle` and emits nothing.
 */
export function reduce(state: GestureState, event: GestureEvent, ctx: GestureCtx): Reduction {
  switch (event.type) {
    case 'pointerDown': {
      if (ctx.mode === 'add-activity') {
        const day = dayColumnAt(event.point.x, ctx.view);
        const laneIndex = laneRowAt(event.point.y, ctx.view);
        return { state: { kind: 'creating', originDay: day, laneIndex, currentDay: day } };
      }
      if (event.hit.kind === 'body' && event.body) {
        const { id, startDay, endDay, laneIndex } = event.body;
        return {
          state: {
            kind: 'repositioning',
            activityId: id,
            grabDay: dayColumnAt(event.point.x, ctx.view),
            grabX: event.point.x,
            movedPastThreshold: false,
            originStartDay: startDay,
            spanDays: endDay - startDay,
            laneIndex,
            currentStartDay: startDay,
          },
        };
      }
      // select mode on empty / handle: the canvas pans/selects; link lands in 2.3.
      return { state: IDLE };
    }
    case 'pointerMove': {
      if (state.kind === 'creating') {
        const currentDay = dayColumnAt(event.point.x, ctx.view);
        if (currentDay === state.currentDay) return { state };
        return { state: { ...state, currentDay } };
      }
      if (state.kind === 'repositioning') {
        const movedPastThreshold =
          state.movedPastThreshold ||
          Math.abs(event.point.x - state.grabX) > REPOSITION_THRESHOLD_PX;
        const delta = dayColumnAt(event.point.x, ctx.view) - state.grabDay;
        const currentStartDay = state.originStartDay + delta;
        if (
          currentStartDay === state.currentStartDay &&
          movedPastThreshold === state.movedPastThreshold
        )
          return { state };
        return { state: { ...state, currentStartDay, movedPastThreshold } };
      }
      return { state };
    }
    case 'pointerUp': {
      if (state.kind === 'creating') {
        const startDay = Math.min(state.originDay, state.currentDay);
        const endDay = Math.max(state.originDay, state.currentDay);
        return {
          state: IDLE,
          intent: { kind: 'create', startDay, endDay, laneIndex: state.laneIndex },
        };
      }
      if (state.kind === 'repositioning') {
        // A press that never travelled past the pixel threshold — or that landed back on the
        // origin day — is a select, not a move (guards click-jitter at low zoom, ADR-0026 D5).
        if (!state.movedPastThreshold || state.currentStartDay === state.originStartDay) {
          return { state: IDLE, select: state.activityId };
        }
        return {
          state: IDLE,
          intent: {
            kind: 'reposition',
            activityId: state.activityId,
            startDay: state.currentStartDay,
          },
        };
      }
      return { state: IDLE };
    }
    case 'escape':
      return { state: IDLE };
  }
}
