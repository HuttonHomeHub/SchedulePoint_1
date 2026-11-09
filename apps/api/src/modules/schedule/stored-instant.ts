/**
 * **Read a remote activity's stored instant, or nothing** (ADR-0212 D3 and D4; the schema design's
 * §4 "The reader").
 *
 * A stored instant is the engine's absolute minute held as a UTC `timestamptz`, so the minute is
 * `getTime() / 60000` and the round trip is exact (`m2-schema-design.md` A2). It is trusted only when
 * the REMOTE PLAN says its last recalculation wrote it: `schedule_instants_computed_at` set, which the
 * database holds equal to `schedule_computed_at` (one statement writes both, so they cannot differ).
 * A plan never calculated has neither. `null` makes the derivation read the date beside it exactly as it
 * always has (ADR-0212 D3), and counts the edge in `remoteInstantMissingCount`.
 *
 * A value that is not a whole minute is read as missing too, and reported through `onNotWholeMinute`:
 * the column is written from an `int[]`, so a fraction means a different writer, but it is ANOTHER
 * plan's column, and throwing would fail this plan's whole recalculation (a tenant-visible 500) over
 * data its own planner cannot see or fix. The date reading is the safe floor, exactly as for a plan
 * never calculated; the callback is how an operator learns which remote row to look at.
 */
export function trustedInstantMinutes(
  instant: Date | null,
  plan: {
    /** The remote activity, named in the report; not part of the stamp rule. */
    id: string;
    planId: string;
    planScheduleComputedAt: Date | null;
    planInstantsComputedAt: Date | null;
  },
  onNotWholeMinute: (corrupt: {
    remotePlanId: string;
    remoteActivityId: string;
    instant: string;
  }) => void,
): number | null {
  if (!instant) return null;
  const { planScheduleComputedAt: computedAt, planInstantsComputedAt: instantsAt } = plan;
  if (computedAt === null || instantsAt === null) return null;
  const minutes = instant.getTime() / 60_000;
  if (!Number.isInteger(minutes)) {
    onNotWholeMinute({
      remotePlanId: plan.planId,
      remoteActivityId: plan.id,
      instant: instant.toISOString(),
    });
    return null;
  }
  return minutes;
}
