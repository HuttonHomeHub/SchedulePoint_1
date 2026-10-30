import type { ActivitySummary } from '@repo/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useWriteActivityCodes } from '../api/use-write-activity-codes';

import { codeAssignmentLabel, type CodeAssignmentPlan } from './code-assignment-plan';
import { useCodeSwimlaneLanePlanner, type CodeLanePlan } from './code-swimlane-lanes';

import { activityCodesCommand, type Command } from '@/features/undo-redo';
import { ApiFetchError } from '@/lib/api/client';
import { planKeys } from '@/lib/query/hierarchy-keys';

export interface SetActivityCodesRequest {
  plan: CodeAssignmentPlan;
  /** The names of the types being set, for the undo step's label. */
  typeNames: readonly string[];
  /** Names for every value id the plan mentions, for the set-aside sentence if one is deleted later. */
  valueNames: ReadonlyMap<string, string>;
  /**
   * The lanes the write carries while the plan's swimlanes come from a code. **Absent: ask the
   * workspace's planner** (the editor's Save codes and any caller that has no plan of its own);
   * `null`: send none. Move to swimlane… and the bulk bars pass the lanes they planned, so the lanes
   * they counted against the 2,000-row cap are the lanes that are sent.
   */
  lanes?: CodeLanePlan | null;
  /** The undo step's label, when the caller words it better than "Set Area on …" ("Move … to Roof"). */
  label?: string;
}

/**
 * **Set code values on activities and remember the step** — the one entry the editor's Save codes, the
 * table's Set … and (T4) the diagram's bars all go through, so the write, the label and the undo step
 * cannot be assembled three ways.
 *
 * `record` is the workspace's history seam, absent where there is no history. **A history fault must
 * never break a write that already succeeded**: the change is on the server and the planner has been
 * told so, and losing its undo step is the smaller failure, so recording is the last thing done and is
 * caught on its own (`use-codes-actions` makes the same choice).
 */
export function useSetActivityCodes(
  orgSlug: string,
  planId: string,
  record?: (command: Command) => void,
): (request: SetActivityCodesRequest) => Promise<ActivitySummary[]> {
  const write = useWriteActivityCodes(orgSlug, planId).mutateAsync;
  const planner = useCodeSwimlaneLanePlanner();
  const queryClient = useQueryClient();
  return useCallback(
    async ({ plan, typeNames, valueNames, lanes: given, label }) => {
      const lanes = given === undefined ? (planner?.(plan) ?? null) : given;
      let saved: ActivitySummary[];
      try {
        saved = await write({
          activities: plan.rows,
          ...(lanes === null ? {} : lanes),
        });
      } catch (error) {
        // A colleague switched the swimlane source after the lanes were planned: the plan is read
        // again so the diagram follows, and the planner tries again against what it now shows.
        if (error instanceof ApiFetchError && isSourceChanged(error)) {
          void queryClient.invalidateQueries({ queryKey: planKeys.detail(orgSlug, planId) });
        }
        throw error;
      }
      try {
        record?.(
          activityCodesCommand({
            steps: plan.steps,
            label:
              label ??
              codeAssignmentLabel({
                typeNames,
                activityNames: plan.steps.map((step) => step.name),
              }),
            valueNames,
            write,
            planLanes: planner ?? undefined,
          }),
        );
      } catch (error) {
        console.error('Could not record a code change for undo', error);
      }
      return saved;
    },
    [write, record, planner, queryClient, orgSlug, planId],
  );
}

const isSourceChanged = (error: ApiFetchError): boolean =>
  (error.error.details as { reason?: string } | undefined)?.reason === 'SWIMLANE_SOURCE_CHANGED';
