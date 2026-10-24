import type { ActivitySummary, SwimlaneSource } from '@repo/types';
import { useCallback, useMemo } from 'react';

import { useSwimlanes } from '../api/use-swimlanes';

import { manualSwimlaneInput } from './manual-membership';

import { WBS_IMPROVEMENTS_ENABLED } from '@/config/env';
import type { SwimlaneAssignment, SwimlaneAssignOutcome } from '@/features/tsld';
import { deriveDiagramSource } from '@/features/tsld/model/derive-diagram-source';
import type { TsldBulkOperations } from '@/features/tsld/model/edit-types';
import { swimlaneEditContext } from '@/features/tsld/model/swimlane-edit-context';
import {
  assignToSwimlane,
  NO_SWIMLANE_LABEL,
  ROWS_GONE_REASON,
} from '@/features/tsld/model/swimlane-lanes';
import type { BarDateSource } from '@/lib/bar-dates';

const CANNOT_PLAN_REASON = 'Swimlanes can’t be changed just now. Try again in a moment.';

/**
 * **The host's plan for Move to swimlane…** (swimlanes M2-T10, ui-architecture C10): everything the
 * selection bars and the activity editor need to file work in a swimlane, built once and handed to
 * both so they cannot plan the write two ways.
 *
 * It plans against the projection the diagram draws — `deriveDiagramSource` over the same inputs,
 * band toggle included — so a lane chosen "free" is free in the picture the panel paints from those
 * inputs (whether or not swimlanes are shown). The projection is built when a move is made, not on
 * every render: only `currentOf` needs the membership, which is cheap. It writes through the plural move's swimlane form (`moveMany` with `swimlaneLanes` and a zero
 * delta): one all-or-nothing positions batch, no `laneIndex` (SC-1), no time write, and one undo step
 * the host records with the ADR-0176 checks (`swimlaneLanesCommand`).
 *
 * `null` — which omits the control everywhere — unless the plan has hand-made swimlanes to move to:
 * source `MANUAL` and at least one swimlane, with a data date to measure spans from. While the lens
 * is not offered nothing is fetched, which is what keeps this dark until M2-T11.
 */
export function useSwimlaneAssignment(args: {
  orgSlug: string;
  planId: string;
  source: SwimlaneSource;
  /** The lens is offered at all (`SWIMLANES_LENS_OFFERED`). */
  offered: boolean;
  activities: readonly ActivitySummary[] | undefined;
  barDateSource: BarDateSource;
  dataDate: string | null;
  /** Whether the diagram is drawing swimlanes (the lens state). */
  shown: boolean;
  /** The pinned WBS band's toggle, which takes summaries out of the projection. */
  wbsBandOn: boolean;
  /** The host's plural move, which owns the write and the history. */
  moveMany: TsldBulkOperations['moveMany'] | undefined;
}): SwimlaneAssignment | null {
  const { orgSlug, planId, source, offered, activities, barDateSource, dataDate, wbsBandOn } = args;
  const { shown } = args;
  const { moveMany } = args;
  const manual = offered && source === 'MANUAL';
  const list = useSwimlanes(orgSlug, planId, manual).data;

  const input = useMemo(() => {
    if (!manual || list === undefined || list.length === 0 || activities === undefined) {
      return null;
    }
    return dataDate === null ? null : manualSwimlaneInput(activities, list);
  }, [manual, list, activities, dataDate]);

  const choices = useMemo(
    () => [
      ...(list ?? []).map((s) => ({ id: s.id, name: s.name })),
      { id: null, name: NO_SWIMLANE_LABEL },
    ],
    [list],
  );

  const currentOf = useCallback(
    (activityId: string): string | null => {
      const id = input?.membership.get(activityId) ?? null;
      // A deleted swimlane's id is kept for a restore; the bar is drawn under none.
      return id !== null && input?.swimlanes.some((s) => s.id === id) ? id : null;
    },
    [input],
  );

  const assign = useCallback(
    async (ids: readonly string[], target: string | null): Promise<SwimlaneAssignOutcome> => {
      if (!input || !moveMany || !activities || dataDate === null) {
        return { applied: false, conflict: CANNOT_PLAN_REASON, refreshable: false };
      }
      const diagram = deriveDiagramSource(activities, {
        wbsBand: { enabled: WBS_IMPROVEMENTS_ENABLED, toggleOn: wbsBandOn },
        swimlanes: input,
        source: barDateSource,
        dataDate,
      });
      const ctx = swimlaneEditContext({
        scene: diagram.swimlaneScene,
        input,
        sceneActivities: diagram.sceneActivities,
        activities,
        barDateSource,
        dataDate,
      });
      if (!ctx) return { applied: false, conflict: CANNOT_PLAN_REASON, refreshable: false };
      const move = assignToSwimlane(ctx, ids, target);
      if (move.kind === 'refuse') {
        return { applied: false, conflict: move.reason, refreshable: false };
      }
      if (move.kind === 'stay') return { applied: false, conflict: null, moved: 0 };
      const byId = new Map(activities.map((a) => [a.id, a]));
      const movedIds = move.placements.flatMap((p) => (p.materialised === true ? [] : [p.id]));
      const rows = movedIds.flatMap((id) => byId.get(id) ?? []);
      // Never move a smaller set than the one that was asked about.
      if (rows.length < movedIds.length) {
        return { applied: false, conflict: ROWS_GONE_REASON };
      }
      const name = choices.find((c) => c.id === target)?.name ?? NO_SWIMLANE_LABEL;
      const only = rows.length === 1 ? rows[0] : undefined;
      const outcome = await moveMany(
        rows,
        { dayDelta: 0, laneDelta: 0 },
        {
          swimlaneLanes: move.placements,
          label: only
            ? `Move “${only.name}” to ${name}`
            : `Move ${String(rows.length)} activities to ${name}`,
        },
      );
      return {
        applied: outcome.applied,
        conflict: outcome.conflict,
        ...(outcome.refreshable !== undefined ? { refreshable: outcome.refreshable } : {}),
        ...(outcome.applied
          ? { moved: rows.length, ...(shown ? { landed: move.landed } : {}) }
          : {}),
      };
    },
    [input, moveMany, activities, choices, dataDate, wbsBandOn, barDateSource, shown],
  );

  return useMemo(
    () => (input && moveMany ? { shown, choices, currentOf, assign } : null),
    [input, moveMany, shown, choices, currentOf, assign],
  );
}
