import type { ActivitySummary } from '@repo/types';
import { useCallback } from 'react';

import { useWriteActivityCodes } from '../api/use-write-activity-codes';

import { codeAssignmentLabel, type CodeAssignmentPlan } from './code-assignment-plan';

import { activityCodesCommand, type Command } from '@/features/undo-redo';

export interface SetActivityCodesRequest {
  plan: CodeAssignmentPlan;
  /** The names of the types being set, for the undo step's label. */
  typeNames: readonly string[];
  /** Names for every value id the plan mentions, for the set-aside sentence if one is deleted later. */
  valueNames: ReadonlyMap<string, string>;
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
  return useCallback(
    async ({ plan, typeNames, valueNames }) => {
      const saved = await write({ activities: plan.rows });
      try {
        record?.(
          activityCodesCommand({
            steps: plan.steps,
            label: codeAssignmentLabel({
              typeNames,
              activityNames: plan.steps.map((step) => step.name),
            }),
            valueNames,
            write,
          }),
        );
      } catch (error) {
        console.error('Could not record a code change for undo', error);
      }
      return saved;
    },
    [write, record],
  );
}
