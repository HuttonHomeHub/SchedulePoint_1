import { PlanFacts } from './plan-facts';
import { scheduleStateAttr, type ScheduleState } from './schedule-state';

import { PlanFactsHost } from '@/components/layout/workspace/plan-facts-host';

/**
 * The plan status bar — grid row 3 (ADR-0099 D5, Graphite M7), now a **thin host** (M2-T1).
 *
 * The facts and the schedule-state region moved to {@link PlanFacts}, and the pure state derivation
 * to `./schedule-state`, because M2 gives this content **two possible hosts**: the activities handle
 * row on a wide plan layout, and this bar below `md`, where that row is not mounted at all.
 *
 * **This file re-exports `deriveScheduleState`, `scheduleStateAttr` and `ScheduleState`
 * deliberately.** `plan-status-bar.test.tsx` imports them from here, and the extraction's acceptance
 * condition was that the suite passes **unedited** — it is the before/after oracle, so moving its
 * imports would have destroyed the only evidence that nothing changed (the ADR-0078
 * barrel-preserving argument). Consumers may import from either place; new ones should prefer
 * `./schedule-state`.
 */
export { deriveScheduleState, scheduleStateAttr, type ScheduleState } from './schedule-state';

export function PlanStatusBar(props: {
  activityCount: number | undefined;
  criticalCount: number | undefined;
  dataDate: string | null | undefined;
  projectFinish: string | null | undefined;
  /** What the schedule owes the reader — see {@link ScheduleState}. */
  scheduleState: ScheduleState;
  /** Run a recalculation now. Called only from the `stale` state with no refusal. */
  onRecalculate: () => void;
  /** The summary has not arrived. Distinct from "arrived and empty", which is a real answer. */
  pending: boolean;
}): React.ReactElement {
  // **The registry decides where these render, with no conditional here** (M2-T4). An outlet is
  // mounted only by the COLLAPSED activities bar, so the rule falls out rather than being written:
  // collapsed, the facts portal into the row the planner is already reading and this slot is empty;
  // expanded, that bar has unmounted and they render here; below `md` there is no bar at all and
  // they render here too. Three states, one mechanism, no branch to get wrong.
  //
  // `plan-status-bar.test.tsx` mounts this with no provider, so `PlanFactsHost` finds no outlet and
  // renders in place — which is why that suite still passes unedited through this change.
  return (
    <PlanFactsHost>
      <PlanFacts {...props} />
    </PlanFactsHost>
  );
}

// Referenced so the re-export above is not mistaken for dead code by a reader skimming the file.
void scheduleStateAttr;
