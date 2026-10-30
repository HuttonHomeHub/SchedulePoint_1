import type { ActivityCodeAssignment } from '@repo/types';

import type { ActivityCodesWriteRow } from '../api/use-write-activity-codes';

import type { ActivityCodesStep } from '@/features/undo-redo';

/**
 * The most activities one codes write may name: the route's `maxItems` (`docs/API.md` "Codes"). The
 * 512 KB body limit is not reached with one type to a row, so this is the bound that applies to the
 * bulk Set; the real ceiling for a row with many types is the body, and the editor sends one row.
 */
export const CODE_ASSIGNMENT_LIMIT = 2000;

/** What the plan needs to know about an activity: who it is, the version to send, what it holds. */
export interface AssignableActivity {
  id: string;
  name: string;
  version: number;
  codes?: readonly ActivityCodeAssignment[] | undefined;
}

/** A target: the value to set for a type, or `null` to clear it. */
export type CodeTargets = ReadonlyMap<string, string | null>;

export interface CodeAssignmentPlan {
  /** The write body: only the activities that change, each with only the types that change. */
  rows: ActivityCodesWriteRow[];
  /** The same changes with both sides, for the undo step. */
  steps: ActivityCodesStep[];
  /** How many activities the write changes. */
  willChange: number;
  /** How many of the selection already hold every target, so nothing is sent for them. */
  alreadyHave: number;
  /** More than {@link CODE_ASSIGNMENT_LIMIT} would change: the write must not be offered. */
  tooMany: boolean;
}

const heldValue = (activity: AssignableActivity, codeTypeId: string): string | null =>
  activity.codes?.find((c) => c.codeTypeId === codeTypeId)?.codeValueId ?? null;

/**
 * **Which rows a codes write sends**, as a pure function of the selection and the target — the one place
 * the table's Set …, the diagram's bars (T4) and the editor's Save codes agree on it, and the one place
 * M4 adds the lanes a code-sourced swimlane needs (`m3-ui-design.md` §7.3 "M4 note").
 *
 * An activity that already holds every target is left out, so a no-op is neither sent nor made an undo
 * step, and a type that is already right on an activity that needs another is left out of its row. The
 * `version` comes from the activity as the caller read it: the write is all-or-nothing, so a stale one
 * refuses the lot.
 */
export function planCodeAssignment(
  activities: readonly AssignableActivity[],
  targets: CodeTargets,
): CodeAssignmentPlan {
  const rows: ActivityCodesWriteRow[] = [];
  const steps: ActivityCodesStep[] = [];
  let alreadyHave = 0;
  for (const activity of activities) {
    const changes = [...targets].flatMap(([codeTypeId, after]) => {
      const before = heldValue(activity, codeTypeId);
      return before === after ? [] : [{ codeTypeId, before, after }];
    });
    if (changes.length === 0) {
      alreadyHave += 1;
      continue;
    }
    rows.push({
      id: activity.id,
      version: activity.version,
      codes: changes.map((c) => ({ codeTypeId: c.codeTypeId, codeValueId: c.after })),
    });
    steps.push({ id: activity.id, name: activity.name, changes });
  }
  return {
    rows,
    steps,
    willChange: rows.length,
    alreadyHave,
    tooMany: rows.length > CODE_ASSIGNMENT_LIMIT,
  };
}

const activitiesText = (n: number): string => (n === 1 ? '1 activity' : `${String(n)} activities`);

/**
 * The undo step's label, with the concrete names (the S1 convention): `Set Area on “Piling”`,
 * `Set Area on 8 activities`, `Change codes on “Piling”`.
 */
export function codeAssignmentLabel(input: {
  typeNames: readonly string[];
  /** The activities the write changes, in order. */
  activityNames: readonly string[];
}): string {
  const { typeNames, activityNames } = input;
  const where =
    activityNames.length === 1 && activityNames[0] !== undefined
      ? `“${activityNames[0]}”`
      : activitiesText(activityNames.length);
  return typeNames.length === 1 && typeNames[0] !== undefined
    ? `Set ${typeNames[0]} on ${where}`
    : `Change codes on ${where}`;
}

/** What the bulk bar says a press will do, before it is pressed. */
export function codeAssignmentStatus(input: {
  typeName: string;
  /** The chosen value's name, or `null` for "None". */
  valueName: string | null;
  selected: number;
  plan: CodeAssignmentPlan;
}): string {
  const { typeName, valueName, selected, plan } = input;
  if (plan.willChange === 0) {
    return valueName === null
      ? selected === 1
        ? `It has no ${typeName} set.`
        : `None of them has ${/^[aeiou]/i.test(typeName) ? 'an' : 'a'} ${typeName} set.`
      : `${selected === 1 ? 'It’s' : 'They’re'} already set to that ${typeName}.`;
  }
  const verb =
    valueName === null
      ? `Clears ${typeName} on ${activitiesText(plan.willChange)}.`
      : `Sets ${typeName} to ${valueName} on ${activitiesText(plan.willChange)}.`;
  if (plan.alreadyHave === 0) return verb;
  const n = String(plan.alreadyHave);
  const rest =
    valueName === null
      ? `${n} already ${plan.alreadyHave === 1 ? 'has' : 'have'} no value.`
      : `${n} ${plan.alreadyHave === 1 ? 'is' : 'are'} already set to it.`;
  return `${verb} ${rest}`;
}

/** What is announced once a set lands. */
export function codeAssignedAnnouncement(input: {
  typeName: string;
  valueName: string | null;
  changed: number;
}): string {
  const { typeName, valueName, changed } = input;
  return valueName === null
    ? `Cleared ${typeName} on ${activitiesText(changed)}.`
    : `Set ${typeName} to ${valueName} on ${activitiesText(changed)}.`;
}
