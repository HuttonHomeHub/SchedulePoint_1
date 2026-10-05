/**
 * **"Edited since it was calculated"** — the one rule, shared by the organisation overview and the
 * plan response, so the two screens a planner reads it on cannot disagree (`docs/TECH_DEBT.md` #452).
 *
 * True when a scheduling input was written after the last recalculation:
 * `schedule_inputs_changed_at > schedule_computed_at` (see `markScheduleInputsChanged` and the
 * column's docblock in `schema.prisma`). A plan that has never been calculated is NOT "edited since"
 * — there is no since; that is its own state, said in its own words.
 */
export function isEditedSinceCalculated(
  scheduleComputedAt: Date | null,
  scheduleInputsChangedAt: Date,
): boolean {
  return (
    scheduleComputedAt !== null && scheduleInputsChangedAt.getTime() > scheduleComputedAt.getTime()
  );
}
