/**
 * **Read a remote activity's stored instant, or nothing** (ADR-0212 D3 and D4; the schema design's
 * §4 "The reader").
 *
 * A stored instant is the engine's absolute minute held as a UTC `timestamptz`, so the minute is
 * `getTime() / 60000` and the round trip is exact (`m2-schema-design.md` A2). It is trusted only when
 * the REMOTE PLAN says its last recalculation wrote it: `schedule_instants_computed_at` set and equal
 * to `schedule_computed_at`. A recalculation by an older image moves `schedule_computed_at` and leaves
 * the instants and their stamp behind, so after a rollback the two stop matching and the date is read
 * instead, with no operator step. `null` makes the derivation read the date beside it exactly as it
 * always has (ADR-0212 D3), and counts the edge in `remoteInstantMissingCount`.
 *
 * Throws on a value that is not a whole minute: the column is written from an `int[]`, so a fraction
 * means a different writer, and a wrong bound is worse than a refused recalculation.
 */
export function trustedInstantMinutes(
  instant: Date | null,
  plan: { planScheduleComputedAt: Date | null; planInstantsComputedAt: Date | null },
): number | null {
  if (!instant) return null;
  const { planScheduleComputedAt: computedAt, planInstantsComputedAt: instantsAt } = plan;
  if (computedAt === null || instantsAt === null) return null;
  if (instantsAt.getTime() !== computedAt.getTime()) return null;
  const minutes = instant.getTime() / 60_000;
  if (!Number.isInteger(minutes)) {
    throw new Error(`A stored schedule instant is not a whole minute (${instant.toISOString()}).`);
  }
  return minutes;
}
