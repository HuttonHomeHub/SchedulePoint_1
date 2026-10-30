import type { ActivityCodeLaneInput } from '@repo/types';
import { createContext, useContext } from 'react';

import type { ActivityCodesWriteRow } from '../api/use-write-activity-codes';

import type { CodeAssignmentPlan } from './code-assignment-plan';

/**
 * The lanes a codes write carries while the plan's swimlanes come from a code (p6-activity-codes M4,
 * `m4-ui-design.md` §5.3): the activity's lane inside the band it will be in once the write lands, for
 * every bar the write moves and for the unplaced members of the bands it touches, so nothing on the
 * diagram moves but the subjects (ADR-0153).
 */
export interface CodeLanePlan {
  /** The plan's swimlane code type the lanes were planned against; the server refuses the write if the source is not it. */
  lanesCodeTypeId: string;
  lanes: ActivityCodeLaneInput[];
}

/**
 * Plans the lanes of a codes write, or answers `null` when there is nothing to carry: the plan's
 * swimlanes do not come from a code, the write touches no value of the source type, or the picture the
 * lanes would be planned against is not there. **It reads the picture as it is when it is called**, not
 * as it was when the planner was handed out, because undo and redo call it a long time after the step
 * was made.
 */
export type CodeSwimlaneLanePlanner = (plan: {
  rows: readonly ActivityCodesWriteRow[];
}) => CodeLanePlan | null;

/**
 * The seam between this feature and the swimlanes: `features/codes` declares what a codes write needs
 * and the workspace host supplies it, built from the swimlane projection, so neither this feature nor
 * `features/tsld` imports the other (`docs/TECH_DEBT.md` #548). A context rather than a prop because the
 * editor's section, the table's bar and the diagram's two bars are four call sites at different depths,
 * and all four must plan a write the same way.
 *
 * **Absent means no lanes.** A host that does not provide one writes codes exactly as before M4, which
 * is why `the workspace planner structural test` holds every workspace caller to the provider.
 */
const CodeSwimlaneLanePlannerContext = createContext<CodeSwimlaneLanePlanner | null>(null);

export const CodeSwimlaneLanePlannerProvider = CodeSwimlaneLanePlannerContext.Provider;

export function useCodeSwimlaneLanePlanner(): CodeSwimlaneLanePlanner | null {
  return useContext(CodeSwimlaneLanePlannerContext);
}

/**
 * How many activities one write names: the rows that change codes and the lane-only rows the planner
 * added. The route caps the **union**, so the bulk Set counts both.
 */
export function codeWriteSize(
  plan: Pick<CodeAssignmentPlan, 'rows'>,
  lanes: CodeLanePlan | null,
): number {
  if (lanes === null) return plan.rows.length;
  const named = new Set(plan.rows.map((row) => row.id));
  for (const lane of lanes.lanes) named.add(lane.id);
  return named.size;
}
