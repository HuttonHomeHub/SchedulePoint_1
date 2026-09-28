import { isZeroDurationTask, type ActivitySummary, type DependencySummary } from '@repo/types';

import type { ScopeGate } from '@/features/activities/lib/activity-editor-gating';

/**
 * **The one label, spelled once** (ADR-0162 decision 4, M4-T2).
 *
 * The selection bar renders it icon-only, as the accessible name and the ADR-0117 name tooltip
 * (M0-T5 measured that no labelled candidate keeps the foot row on one line at 1646); the Gantt row
 * menu and the activities table's row menu render it as text. Three surfaces, one string, so a copy
 * change reaches all three or none. `make-milestone-label.structural.test.ts` refuses a table that
 * spells it inline.
 */
export const MAKE_MILESTONE_LABEL = 'Make milestone…';

/**
 * What **Make milestone…** may do for one activity, derived once for all three surfaces.
 *
 * `applies: false` means the action is **omitted**: it does not apply to this object (ADR-0082's
 * omit clause). `enabled: false` means it is **shaded** with a reason the reader can act on.
 */
export type MakeMilestoneGate =
  | { applies: false }
  | { applies: true; enabled: true; reason: null }
  | { applies: true; enabled: false; reason: string };

type MakeMilestoneSubject = Pick<
  ActivitySummary,
  'type' | 'durationMinutes' | 'resourceAssignmentCount'
>;

/** Why a resourced zero-duration task cannot convert (spec US-3). */
export function resourcedReason(count: number): string {
  const [noun, them] =
    count === 1 ? ['1 resource assignment', 'it'] : [`${count} resource assignments`, 'them'];
  return `It has ${noun}. A milestone does no work; remove ${them} in Resources first.`;
}

/**
 * **One pure derivation, called by every surface that offers the action** (spec D6).
 *
 * 1. Not a zero-duration `TASK` → omitted.
 * 2. `definitionGate.writable === false` → shaded with the gate's own sentence (pen or role).
 * 3. Live resource assignments → shaded with {@link resourcedReason}.
 * 4. Otherwise open.
 *
 * **The pen or role reason wins over the assignments reason** (step 2 before step 3), for the reason
 * `GanttRowMenu`'s structure items give: a reader without the pen should be told that, not a fact
 * they cannot act on yet.
 *
 * `definitionGate` is the workspace's `activityEditorGating.general`, **passed by identity** — the
 * object the editor and the table already receive. A second `{ writable, reason }` assembled beside
 * it would drift, and the drift is invisible because each surface looks right alone (ADR-0062).
 *
 * `resourceAssignmentCount` is `null` for any row the server did not count (M4-T1, FC-9's remedy):
 * that is every row that is not a zero-duration task, and step 1 has already omitted those. A null
 * on a zero-duration task (a row read before the field existed) is read as unresourced: the server
 * does not refuse the conversion (spec E19), so the gate is advice and not a guard.
 */
export function deriveMakeMilestoneGate(
  activity: MakeMilestoneSubject,
  definitionGate: Pick<ScopeGate, 'writable' | 'reason'>,
): MakeMilestoneGate {
  if (!isZeroDurationTask(activity.type, activity.durationMinutes)) return { applies: false };
  if (!definitionGate.writable) {
    // `ScopeGate.reason` is present whenever `writable` is false (its docblock); the fallback is
    // unreachable today and says nothing false if a future gate forgets it.
    return { applies: true, enabled: false, reason: definitionGate.reason ?? 'Not available.' };
  }
  const count = activity.resourceAssignmentCount ?? 0;
  if (count > 0) return { applies: true, enabled: false, reason: resourcedReason(count) };
  return { applies: true, enabled: true, reason: null };
}

/** The two types Make milestone… can convert to. */
export type MilestoneChoice = 'FINISH_MILESTONE' | 'START_MILESTONE';

/**
 * **The preselected option: Finish when the task has a predecessor, Start otherwise** (spec D5).
 *
 * The rule the MSPDI importer already uses for a zero-duration task, so the product has one such
 * rule. It is a one-time default the planner sees and confirms, not a standing date rule: decision 1
 * rejected choosing a DATE convention per task from its links, and this chooses nothing the planner
 * does not confirm.
 */
export function defaultMilestoneType(
  activityId: string,
  dependencies: readonly Pick<DependencySummary, 'successor'>[],
): MilestoneChoice {
  return dependencies.some((d) => d.successor.id === activityId)
    ? 'FINISH_MILESTONE'
    : 'START_MILESTONE';
}
