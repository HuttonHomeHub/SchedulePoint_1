import { PlanFacts } from './plan-facts';
import { scheduleStateAttr, type ScheduleState } from './schedule-state';

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
  // Rendered in place, exactly as before. M2-T2 gives this an outlet; until then the only change is
  // where the markup is declared, which is what makes the unedited suite meaningful.
  return <PlanFacts {...props} />;
}

// Referenced so the re-export above is not mistaken for dead code by a reader skimming the file.
void scheduleStateAttr;
