import type { ActivitySummary } from '@repo/types';
import { useMemo } from 'react';

import type { DiagramSource } from '../model/derive-diagram-source';
import { drawnDaySpan } from '../model/drawn-span';
import type { TsldBulkOperations, TsldEditOutcome, TsldRepositionInput } from '../model/edit-types';
import {
  createInSwimlane,
  dropInSwimlane,
  keyboardMoveInSwimlane,
  laneRangeOf,
  moveManyInSwimlanes,
  NO_FREE_LANE_PLURAL,
  ROWS_GONE_REASON,
  swimlaneTopOf,
  topLanePluralInSwimlanes,
  type DaySpan,
  type SwimlaneCreate,
  type SwimlaneEditContext,
} from '../model/swimlane-lanes';
import type { SwimlaneInput } from '../render/project-swimlanes';

import type { BarDateSource } from '@/lib/bar-dates';

/**
 * **Everything the panel does differently while swimlanes are drawn** (swimlanes M2-T4,
 * ui-architecture C6), in one place so the panel itself reads the same with or without them.
 *
 * The canvas, the ghosts and every intent speak *display* lanes — the stack of swimlanes — while
 * `ActivitySummary.laneIndex` is the *stored* swimlane-free lane. Mixing the two moves a bar by the
 * difference between two coordinate systems. This hook owns the translation:
 *
 * - {@link SwimlaneEditing.laneActivities} is the activity list in display lanes, for geometry and
 *   wording only. Nothing written is built from it (SC-1).
 * - The reposition and plural-move wrappers turn a display lane into the bar's lane inside its
 *   swimlane, and hand the host that and **never a `laneIndex`**.
 * - `laneRange`, `topLane`, `laneFloor` and `topLaneReason` are the boundaries the drag and the
 *   nudges stop at.
 *
 * With no swimlane scene every member is `undefined` or the identity, so the panel is byte-for-byte
 * what it was (SC-3).
 */
export interface SwimlaneEditing {
  /** True while swimlanes are drawn and lane writes take the swimlane form. */
  readonly active: boolean;
  /** `activities` in display lanes; the same array when swimlanes are not drawn. */
  readonly laneActivities: readonly ActivitySummary[];
  readonly laneRange: ((id: string) => { min: number; max: number } | null) | undefined;
  /** A drop by a pointer: the lane under it, in the swimlane under it. */
  readonly repositionByPointer:
    ((input: TsldRepositionInput) => Promise<TsldEditOutcome>) | undefined;
  /** A key press: relative to the bar's own swimlane, where one past the bottom grows it. */
  readonly repositionByKeyboard:
    ((input: TsldRepositionInput) => Promise<TsldEditOutcome>) | undefined;
  readonly moveMany: TsldBulkOperations['moveMany'] | undefined;
  readonly topLane: ((id: string) => { min: number; swimlane: string } | null) | undefined;
  readonly laneFloor: ((id: string) => number) | undefined;
  readonly topLaneReason: ((count: number, total: number) => string) | undefined;
  /** Where a bar drawn at a display lane goes, or `null` off the swimlane layout. */
  readonly placeCreate: (displayLane: number, span: DaySpan) => SwimlaneCreate | null;
}

export function useSwimlaneEditing(args: {
  activities: readonly ActivitySummary[];
  diagramSource: Pick<DiagramSource, 'swimlaneScene' | 'sceneActivities'>;
  swimlanes: SwimlaneInput | null;
  barDateSource: BarDateSource;
  dataDate: string | null;
  /** The panel's noted reposition seam; every write goes through it. */
  reposition: ((input: TsldRepositionInput) => Promise<TsldEditOutcome>) | undefined;
  /** The host's plural move, when it supplies one. */
  bulkMoveMany: TsldBulkOperations['moveMany'] | undefined;
}): SwimlaneEditing {
  const { activities, diagramSource, swimlanes, barDateSource, dataDate, reposition } = args;
  const { bulkMoveMany } = args;
  const scene = diagramSource.swimlaneScene;

  const laneActivities = useMemo(() => {
    if (scene === null) return activities;
    return activities.map((a) => {
      const lane = scene.displayLanes.get(a.id);
      return lane === undefined ? a : { ...a, laneIndex: lane };
    });
  }, [activities, scene]);

  const ctx = useMemo<SwimlaneEditContext | null>(() => {
    if (scene === null || swimlanes === null || dataDate === null) return null;
    const spans = new Map<string, DaySpan>();
    const stored = new Map<string, number>();
    for (const a of diagramSource.sceneActivities) {
      stored.set(a.id, a.laneIndex);
      const span = drawnDaySpan(a, barDateSource, dataDate);
      if (span !== null) spans.set(a.id, span);
    }
    const rows = new Map(activities.map((a) => [a.id, a]));
    return {
      scene,
      input: swimlanes,
      spans,
      stored,
      remembered: (id, swimlaneId) =>
        rows
          .get(id)
          ?.swimlaneLanes.find((l) =>
            swimlaneId === null
              ? l.basis === 'NO_SWIMLANE'
              : l.basis === 'SWIMLANE' && l.swimlaneId === swimlaneId,
          )?.laneIndex,
    };
  }, [scene, swimlanes, dataDate, diagramSource.sceneActivities, activities, barDateSource]);

  const reposeBy = useMemo(() => {
    if (!reposition) return undefined;
    const make =
      (mode: 'pointer' | 'keyboard') =>
      async (input: TsldRepositionInput): Promise<TsldEditOutcome> => {
        if (!ctx || input.laneIndex === undefined) return reposition(input);
        const move =
          mode === 'pointer'
            ? dropInSwimlane(ctx, input.activityId, input.laneIndex)
            : keyboardMoveInSwimlane(ctx, input.activityId, input.laneIndex);
        if (move.kind === 'refuse') {
          return { applied: false, conflict: move.reason, refreshable: false };
        }
        const facts = { swimlane: move.landed };
        // The key-press hook tracks an absolute target: when the bar landed anywhere but where the
        // press aimed (a swimlane grows one lane at a time, an occupied lane is passed), it must
        // extend from where the bar IS. A bar sent to another swimlane's lane is not "aimed" at a
        // display lane at all.
        const onward =
          !move.landed.changedSwimlane && move.landed.displayLane !== input.laneIndex
            ? { laneIndex: move.landed.displayLane }
            : {};
        if (move.kind === 'stay') {
          if (input.startDay === undefined) {
            return { applied: false, conflict: null, ...facts, laneIndex: move.landed.displayLane };
          }
          const timeOnly = await reposition({
            activityId: input.activityId,
            startDay: input.startDay,
          });
          return { ...timeOnly, ...facts, laneIndex: move.landed.displayLane };
        }
        const outcome = await reposition({
          activityId: input.activityId,
          ...(input.startDay !== undefined ? { startDay: input.startDay } : {}),
          swimlaneLanes: move.placements,
        });
        return { ...outcome, ...facts, ...onward };
      };
    return { pointer: make('pointer'), keyboard: make('keyboard') };
  }, [reposition, ctx]);

  const moveMany = useMemo<TsldBulkOperations['moveMany'] | undefined>(() => {
    if (!bulkMoveMany || !ctx) return bulkMoveMany;
    const stored = new Map(activities.map((a) => [a.id, a]));
    return async (rows, delta, options) => {
      const writeRows = rows.flatMap((r) => stored.get(r.id) ?? []);
      // Never move a smaller set than the one that was asked about.
      if (writeRows.length < rows.length) return { applied: false, conflict: ROWS_GONE_REASON };
      if (delta.laneDelta === 0) return bulkMoveMany(writeRows, delta, options);
      const move = moveManyInSwimlanes(
        ctx,
        rows.map((r) => r.id),
        delta.laneDelta,
      );
      if (move.kind === 'refuse') {
        return { applied: false, conflict: move.reason, refreshable: false };
      }
      if (move.kind === 'stay') {
        return { applied: false, conflict: NO_FREE_LANE_PLURAL, refreshable: false };
      }
      const outcome = await bulkMoveMany(
        writeRows,
        { dayDelta: delta.dayDelta, laneDelta: 0 },
        { ...options, swimlaneLanes: move.placements },
      );
      // What actually moved, for the sentence: some bars may have found no free lane and stayed.
      return {
        ...outcome,
        swimlaneMoved: {
          moved: move.placements.filter((p) => p.materialised !== true).length,
          total: rows.length,
          direction: delta.laneDelta < 0 ? 'up' : 'down',
        },
      };
    };
  }, [bulkMoveMany, ctx, activities]);

  const laneRange = useMemo(() => (ctx ? (id: string) => laneRangeOf(ctx, id) : undefined), [ctx]);
  const topLane = useMemo(() => (ctx ? (id: string) => swimlaneTopOf(ctx, id) : undefined), [ctx]);
  const laneFloor = useMemo(
    () => (ctx ? (id: string) => swimlaneTopOf(ctx, id)?.min ?? 0 : undefined),
    [ctx],
  );

  return {
    active: ctx !== null,
    laneActivities,
    laneRange,
    repositionByPointer: ctx ? reposeBy?.pointer : reposition,
    repositionByKeyboard: ctx ? reposeBy?.keyboard : reposition,
    moveMany,
    topLane,
    laneFloor,
    topLaneReason: ctx ? topLanePluralInSwimlanes : undefined,
    placeCreate: (displayLane, span) => (ctx ? createInSwimlane(ctx, displayLane, span) : null),
  };
}
