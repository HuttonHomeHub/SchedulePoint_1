import { MAX_CLONE_SET_SIZE, type CloneRefusal } from './clone-graph';

/**
 * What a planner is told when a copy is refused (`docs/specs/activity-copy-paste/` M1-T4, §0.4).
 *
 * One exhaustive `switch` over the refusal union, so a new refusal kind is a **compile error** here
 * rather than a silent fall-through to a generic "could not copy" — which is the shape that turns a
 * specific, fixable problem into a dead end.
 *
 * **The archived-calendar sentence names both remedies and offers no third.** The tempting
 * "helpfully" fall back to the plan calendar is forbidden: it would change the clone's dates
 * relative to its source without saying so, producing a copy that looks right and schedules
 * differently. The decision is recorded here rather than only in the spec, so it is not
 * re-litigated by the next reader who finds the refusal inconvenient.
 *
 * An archived calendar is a **new binding** for the clone even though the source sits on it happily
 * — ADR-0053 §4 refuses new usages and leaves existing ones alone, which is exactly why this case
 * exists at all and why the sentence has to explain it rather than just report it.
 */
export function refusalMessage(refusal: CloneRefusal): string {
  switch (refusal.kind) {
    case 'empty':
      return refusal.reason === 'nothing-selected'
        ? 'Select an activity to duplicate.'
        : 'There is nothing in this selection to copy.';

    case 'too-many':
      // Both numbers, always. "Too many activities" with no figure leaves the planner guessing how
      // much to trim, which is a dead end wearing a message.
      return `That is ${String(refusal.size)} activities — more than the ${String(MAX_CLONE_SET_SIZE)} that can be copied at once. Select fewer and try again.`;

    case 'lane-ceiling':
      return `The copy would need lane ${String(refusal.required)}, past the maximum of ${String(refusal.max)}. Move some activities up before copying.`;

    case 'archived-calendar': {
      const names = refusal.activityNames;
      const subject =
        names.length === 1
          ? `“${names[0] ?? ''}” is on an archived calendar`
          : `${String(names.length)} of the selected activities are on an archived calendar`;
      // Two remedies, and deliberately NOT a third: SchedulePoint will not quietly re-home the copy
      // onto the plan calendar, because that changes its dates without saying so.
      return `${subject}, and a copy would be a new use of it. Restore the calendar, or move the activity to a live one, then duplicate.`;
    }
  }
}
