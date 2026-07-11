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
 * Slice scope: **create-by-drag** (M2 Slice 2.1). Reposition (2.2) and link (2.3) extend
 * the `EditIntent`/`GestureState` unions and the `pointerDown` routing without changing
 * this contract.
 */

/** The active editing tool. `select` behaves like M1 (pan/select); `add-activity` draws. */
export type EditMode = 'select' | 'add-activity';

export interface GestureCtx {
  mode: EditMode;
  view: Viewport;
  /** The plan's data date (day 0), for world↔screen day mapping. */
  dataDate: string;
}

export type GestureEvent =
  | { type: 'pointerDown'; point: Point; hit: HitZone }
  | { type: 'pointerMove'; point: Point }
  | { type: 'pointerUp' }
  | { type: 'escape' };

/**
 * A committed edit, emitted on drop. The canvas produces geometry (days/lanes); `TsldPanel`
 * maps it to the reused write endpoints (create → `POST /activities`; reposition → SNET
 * `PATCH`; link → `POST /dependencies`) and the authoritative recalc.
 */
export type EditIntent = {
  kind: 'create';
  /** Inclusive whole-day span about the data date; `startDay === endDay` is a 1-day task. */
  startDay: number;
  endDay: number;
  laneIndex: number;
};

/** The live gesture. `idle` means the machine owns nothing — the canvas pans/selects (M1). */
export type GestureState =
  { kind: 'idle' } | { kind: 'creating'; originDay: number; laneIndex: number; currentDay: number };

export const IDLE: GestureState = { kind: 'idle' };

export interface Reduction {
  state: GestureState;
  /** Emitted only on a committing `pointerUp`; the shell forwards it to `onIntent`. */
  intent?: EditIntent;
}

/**
 * Advance the gesture machine. Pure: `(state, event, ctx) → { state, intent? }`. In
 * `select` mode a `pointerDown` returns `idle`, so the canvas keeps its M1 pan/select path
 * untouched; in `add-activity` mode it starts a create ghost that tracks the pointer and
 * commits a whole-day span on release. `escape` (or a release with no active gesture) resets
 * to `idle` and emits nothing.
 */
export function reduce(state: GestureState, event: GestureEvent, ctx: GestureCtx): Reduction {
  switch (event.type) {
    case 'pointerDown': {
      if (ctx.mode === 'add-activity') {
        const day = dayColumnAt(event.point.x, ctx.view);
        const laneIndex = laneRowAt(event.point.y, ctx.view);
        return { state: { kind: 'creating', originDay: day, laneIndex, currentDay: day } };
      }
      // select mode: reposition/link land in 2.2/2.3; for now the canvas pans/selects.
      return { state: IDLE };
    }
    case 'pointerMove': {
      if (state.kind === 'creating') {
        const currentDay = dayColumnAt(event.point.x, ctx.view);
        if (currentDay === state.currentDay) return { state };
        return { state: { ...state, currentDay } };
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
      return { state: IDLE };
    }
    case 'escape':
      return { state: IDLE };
  }
}
