import { codeSwimlaneValues, type CodeSwimlaneMember } from '@repo/layout';
import { SWIMLANE_LIMIT, type ActivitySummary, type CodeTypeSummary } from '@repo/types';

import { codeOptionReason } from './code-swimlane-copy';

/** One code type as the source picker offers it. */
export interface CodeSourceChoice {
  id: string;
  name: string;
  /** How many values of it live activities (not WBS summaries) carry: what would be drawn. */
  valuesInUse: number;
  /** Why it cannot be chosen, or `null`: no values in use, or more than swimlanes can show. */
  reason: string | null;
}

/**
 * The plan's code types as the picker offers them, in type order, each with its values-in-use count
 * and the reason it is shaded, if it is. **The count is the shared rule** (`codeSwimlaneValues`, the
 * one the API's 422 and the scene read), applied to the activity list the web already holds: no
 * request, and web and server agree on what "in use" means. **This relies on the list carrying live
 * values only** — a deleted value is never in an activity's `codes` (`code-assignment.repository.ts`
 * joins `deleted_at IS NULL`) — so the distinct values its carriers name are the type's live ones;
 * `code-source-choices.test.ts` pins the count against a carrier of a value the type no longer lists.
 */
export function codeSourceChoices(
  types: readonly CodeTypeSummary[],
  activities: readonly ActivitySummary[],
): CodeSourceChoice[] {
  const members = new Map<string, CodeSwimlaneMember[]>();
  const carried = new Map<string, Map<string, { id: string }>>();
  for (const a of activities) {
    for (const c of a.codes ?? []) {
      let list = members.get(c.codeTypeId);
      let ids = carried.get(c.codeTypeId);
      if (list === undefined || ids === undefined) {
        list = [];
        ids = new Map();
        members.set(c.codeTypeId, list);
        carried.set(c.codeTypeId, ids);
      }
      list.push({ type: a.type, valueId: c.codeValueId });
      ids.set(c.codeValueId, { id: c.codeValueId });
    }
  }
  return types.map((type) => {
    const valuesInUse = codeSwimlaneValues(
      [...(carried.get(type.id)?.values() ?? [])],
      members.get(type.id) ?? [],
    ).length;
    return {
      id: type.id,
      name: type.name,
      valuesInUse,
      reason: codeOptionReason(type.name, valuesInUse, SWIMLANE_LIMIT),
    };
  });
}

/**
 * Which type the picker holds: what the planner picked while it can still be chosen, else the type the
 * plan is drawn by now (kept even if it has since become unchoosable, so the dialog reads "already
 * come from this" rather than naming another code), else the first that can be chosen — so a planner
 * who picks the card can press the button at once. `null` when nothing can be chosen.
 */
export function resolveCodeChoice(
  choices: readonly CodeSourceChoice[],
  picked: string | null,
  current: string | null,
): string | null {
  const pickedOne = choices.find((c) => c.id === picked && c.reason === null);
  if (pickedOne !== undefined) return pickedOne.id;
  const held = choices.find((c) => c.id === current);
  if (held !== undefined) return held.id;
  return choices.find((c) => c.reason === null)?.id ?? null;
}
