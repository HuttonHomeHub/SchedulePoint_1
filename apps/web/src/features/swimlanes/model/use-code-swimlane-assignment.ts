import type { ActivitySummary } from '@repo/types';
import { useCallback, useMemo } from 'react';

import { laneRowsOf, planCodeSwimlaneMove } from './code-lane-planning';
import { codeSwimlaneInput } from './code-membership';
import type { CodeSwimlaneSource } from './use-code-swimlane-source';

import {
  codeErrorText,
  codeValueName,
  planCodeAssignment,
  useSetActivityCodes,
} from '@/features/codes';
import type { SwimlaneAssignment, SwimlaneAssignOutcome } from '@/features/tsld';
import { ROWS_GONE_REASON } from '@/features/tsld/model/swimlane-lanes';
import type { Command } from '@/features/undo-redo';
import type { BarDateSource } from '@/lib/bar-dates';

const CANNOT_PLAN_REASON = 'Swimlanes can’t be changed just now. Try again in a moment.';

/**
 * **The host's plan for Move to swimlane… while the plan's swimlanes come from a code** (p6-activity-codes
 * M4, `m4-ui-design.md` §5.2): the same {@link SwimlaneAssignment} the hand-made source gives the
 * selection bars, the table's bulk bar and the Swimlane column, so none of them changes.
 *
 * **A swimlane here is a value, so moving is writing it.** `assign` plans the move exactly as the
 * hand-made path does, against the projection the diagram draws, then sends **one** `PATCH
 * …/activities/codes` carrying the source type's new value for each mover and the lane of every bar the
 * move places, neighbours it must pin included. It goes through {@link useSetActivityCodes}, so the undo
 * step is the codes step and is one step, and a mover's lane lands in its new band at the basis the
 * server derives from the value it has after the write.
 *
 * **The choices are the bands on screen, then "No <type>"** (owner decision 2026-10-30): a value nobody
 * uses yet is not a band, and is reached with Set code…, whose picker searches every value. That keeps
 * the control a native select within its "up to 100" basis. Past 100 bands the diagram keeps drawing
 * them all and so does this list.
 *
 * `null` — which omits the control everywhere — while the type or its values have not arrived, or there
 * is no data date to measure spans from.
 */
export function useCodeSwimlaneAssignment(args: {
  orgSlug: string;
  planId: string;
  /** The plan's swimlane code type reads, from the host's one `useCodeSwimlaneSource`. */
  code: Pick<CodeSwimlaneSource, 'type' | 'values' | 'planLanes'>;
  activities: readonly ActivitySummary[] | undefined;
  barDateSource: BarDateSource;
  dataDate: string | null;
  /** Whether the diagram is drawing swimlanes (the lens state). */
  shown: boolean;
  wbsBandOn: boolean;
  /** The workspace's history seam, for the one undo step. */
  record: ((command: Command) => void) | undefined;
}): SwimlaneAssignment | null {
  const { orgSlug, planId, code, activities, barDateSource, dataDate, shown, wbsBandOn, record } =
    args;
  const setCodes = useSetActivityCodes(orgSlug, planId, record);
  const { type, values, planLanes } = code;

  const input = useMemo(
    () =>
      type === undefined || values === undefined || activities === undefined
        ? null
        : codeSwimlaneInput(activities, type, values, planLanes),
    [type, values, activities, planLanes],
  );

  const choices = useMemo(
    () =>
      input === null
        ? []
        : [
            ...input.swimlanes.map((s) => ({ id: s.id, name: s.name })),
            { id: null, name: input.noneName ?? `No ${type?.name ?? 'value'}` },
          ],
    [input, type],
  );

  const currentOf = useCallback(
    (activityId: string): string | null => input?.membership.get(activityId) ?? null,
    [input],
  );

  const assign = useCallback(
    async (ids: readonly string[], target: string | null): Promise<SwimlaneAssignOutcome> => {
      if (
        input === null ||
        type === undefined ||
        values === undefined ||
        activities === undefined
      ) {
        return { applied: false, conflict: CANNOT_PLAN_REASON, refreshable: false };
      }
      const move = planCodeSwimlaneMove(
        { input, activities, barDateSource, dataDate, wbsBandOn },
        ids,
        target,
      );
      if (move === null)
        return { applied: false, conflict: CANNOT_PLAN_REASON, refreshable: false };
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
      const plan = planCodeAssignment(rows, new Map([[type.id, target]]));
      // A mover already holding the value is drawn elsewhere only when it is a summary, which is never
      // a member of a code swimlane: there is nothing to write for it.
      if (plan.willChange === 0) return { applied: false, conflict: null, moved: 0 };
      const versions = new Map(activities.map((a) => [a.id, a.version]));
      const name = choices.find((c) => c.id === target)?.name ?? `No ${type.name}`;
      const only = rows.length === 1 ? rows[0] : undefined;
      try {
        await setCodes({
          plan,
          typeNames: [type.name],
          valueNames: new Map(values.map((v) => [v.id, codeValueName(v)] as const)),
          lanes: { lanesCodeTypeId: type.id, lanes: laneRowsOf(move.placements, versions) },
          label: only
            ? `Move “${only.name}” to ${name}`
            : `Move ${String(rows.length)} activities to ${name}`,
        });
      } catch (error) {
        return {
          applied: false,
          conflict: codeErrorText(`move to ${name}`, error, type.name),
          refreshable: false,
        };
      }
      return {
        applied: true,
        conflict: null,
        moved: plan.willChange,
        ...(shown ? { landed: move.landed } : {}),
      };
    },
    [input, type, values, activities, choices, barDateSource, dataDate, wbsBandOn, shown, setCodes],
  );

  return useMemo(
    () => (input !== null && dataDate !== null ? { shown, choices, currentOf, assign } : null),
    [input, dataDate, shown, choices, currentOf, assign],
  );
}
