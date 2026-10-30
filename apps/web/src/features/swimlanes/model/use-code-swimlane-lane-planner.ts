import type { ActivitySummary } from '@repo/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { planCodeSwimlaneLanes } from './code-lane-planning';
import { codeSwimlaneInput } from './code-membership';
import type { CodeSwimlaneSource } from './use-code-swimlane-source';

import type { CodeSwimlaneLanePlanner } from '@/features/codes';
import type { BarDateSource } from '@/lib/bar-dates';
import { activityKeys } from '@/lib/query/hierarchy-keys';

/**
 * **The planner the workspace hands to every codes write** (`m4-ui-design.md` §5.3): given the rows a
 * write is about to send, the lanes that keep the diagram still while the plan's swimlanes come from the
 * code they set. See {@link planCodeSwimlaneLanes} for what it plans.
 *
 * **Stable for the life of the plan, and reading what is current when it is called.** The provider's
 * value is the dependency of every writer under it, so a planner that changed with each activity list
 * would re-render the whole workspace on each refetch; and undo and redo call it long after the step was
 * made, when what they must read is the picture of that moment. So the inputs sit in a ref the
 * component keeps current, and the activities are read from the query cache, which is where a settled
 * recalculation lands first (the way auto-resolve reads them).
 *
 * `null` while the plan's swimlanes do not come from a code: nothing is planned and no lane is sent.
 */
export function useCodeSwimlaneLanePlanner(args: {
  orgSlug: string;
  planId: string;
  /** The plan's swimlane code type, or `null` for any other source. */
  codeTypeId: string | null;
  /** The type and values reads, from the host's one `useCodeSwimlaneSource`. */
  code: Pick<CodeSwimlaneSource, 'type' | 'values' | 'planLanes'>;
  activities: readonly ActivitySummary[] | undefined;
  barDateSource: BarDateSource;
  dataDate: string | null;
  wbsBandOn: boolean;
}): CodeSwimlaneLanePlanner | null {
  const { orgSlug, planId, codeTypeId } = args;
  const queryClient = useQueryClient();
  const latest = useRef(args);
  useEffect(() => {
    latest.current = args;
  });
  const planner = useCallback<CodeSwimlaneLanePlanner>(
    (plan) => {
      const { code, activities: rendered, barDateSource, dataDate, wbsBandOn } = latest.current;
      const activities =
        queryClient.getQueryData<ActivitySummary[]>(activityKeys.listByPlan(orgSlug, planId)) ??
        rendered;
      const input =
        code.type !== undefined && code.values !== undefined && activities !== undefined
          ? codeSwimlaneInput(activities, code.type, code.values, code.planLanes)
          : null;
      return planCodeSwimlaneLanes(
        { input, activities, barDateSource, dataDate, wbsBandOn },
        plan.rows,
      );
    },
    [queryClient, orgSlug, planId],
  );
  return codeTypeId === null ? null : planner;
}
