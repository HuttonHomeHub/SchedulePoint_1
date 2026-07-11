import type { DependencyType } from '@repo/types';

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
 * Slices: **create-by-drag** (2.1), **reposition-in-time** (2.2), and **dependency-draw** (2.3).
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

/** The keyboard modifiers held during a link drag, which pick the dependency type. */
export interface Modifiers {
  shift: boolean;
  alt: boolean;
}

/**
 * Map the held modifiers to a dependency type while drawing a link (ADR-0026 D5): plain drag
 * is **FS** (finish→start, the overwhelmingly common case), **Shift** is **SS**, **Alt** is
 * **FF**. **SF** has no chord — it's the rare inverse and is created through the existing
 * dependency dialog instead. Shift wins if both are held (an arbitrary but stable tiebreak).
 */
export function modifiersToLinkType(mods: Modifiers | undefined): DependencyType {
  if (mods?.shift) return 'SS';
  if (mods?.alt) return 'FF';
  return 'FS';
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
  | { type: 'pointerDown'; point: Point; hit: HitZone; body?: BodyGrab; modifiers?: Modifiers }
  | { type: 'pointerMove'; point: Point; hit?: HitZone; modifiers?: Modifiers }
  | { type: 'pointerUp'; hit?: HitZone; modifiers?: Modifiers }
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
    }
  | {
      kind: 'link';
      /** The activity the drag started from (its edge handle). */
      predecessorId: string;
      /** The activity the drag was released over. */
      successorId: string;
      /** Chosen by the held modifiers at release (see {@link modifiersToLinkType}). */
      type: DependencyType;
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
    }
  | {
      kind: 'linking';
      /** The activity whose edge handle was grabbed (the link's predecessor). */
      sourceId: string;
      /** Which end the drag sprang from, so the shell anchors the rubber-band correctly. */
      sourceHandle: 'startHandle' | 'finishHandle';
      /** The live pointer position — the rubber-band's free end. */
      point: Point;
      /** The activity currently hovered as the drop target, or null (over empty/self). */
      targetId: string | null;
      /** The type the current modifiers would create, for a live affordance. */
      type: DependencyType;
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
 * bar; on an **edge handle** it starts a dependency rubber-band that commits a `link` intent
 * when released over another activity (type from the held modifiers). In `add-activity` mode a
 * drag draws a create ghost. `escape` (or a release with no target) resets to `idle`, no intent.
 */
export function reduce(state: GestureState, event: GestureEvent, ctx: GestureCtx): Reduction {
  switch (event.type) {
    case 'pointerDown': {
      if (ctx.mode === 'add-activity') {
        const day = dayColumnAt(event.point.x, ctx.view);
        const laneIndex = laneRowAt(event.point.y, ctx.view);
        return { state: { kind: 'creating', originDay: day, laneIndex, currentDay: day } };
      }
      if ((event.hit.kind === 'startHandle' || event.hit.kind === 'finishHandle') && event.hit.id) {
        // Grab an edge handle → start a dependency rubber-band from that activity.
        return {
          state: {
            kind: 'linking',
            sourceId: event.hit.id,
            sourceHandle: event.hit.kind,
            point: event.point,
            targetId: null,
            type: modifiersToLinkType(event.modifiers),
          },
        };
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
      // select mode on empty space: the canvas pans/selects (M1), no gesture owned here.
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
      if (state.kind === 'linking') {
        // Track the free end + the hovered drop target (a different activity) + the live type.
        const hovered = event.hit;
        const targetId =
          hovered && hovered.kind !== 'empty' && hovered.id && hovered.id !== state.sourceId
            ? hovered.id
            : null;
        const type = event.modifiers ? modifiersToLinkType(event.modifiers) : state.type;
        return { state: { ...state, point: event.point, targetId, type } };
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
      if (state.kind === 'linking') {
        // Prefer the hit under the release point; fall back to the last-hovered target.
        const dropId =
          event.hit && event.hit.kind !== 'empty' && event.hit.id ? event.hit.id : state.targetId;
        // No target, or dropped back on the source → cancel with no link.
        if (!dropId || dropId === state.sourceId) return { state: IDLE };
        return {
          state: IDLE,
          intent: {
            kind: 'link',
            predecessorId: state.sourceId,
            successorId: dropId,
            type: event.modifiers ? modifiersToLinkType(event.modifiers) : state.type,
          },
        };
      }
      return { state: IDLE };
    }
    case 'escape':
      return { state: IDLE };
  }
}
