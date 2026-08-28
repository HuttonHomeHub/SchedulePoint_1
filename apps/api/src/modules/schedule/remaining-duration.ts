/**
 * The engine's remaining working minutes for an **in-progress** activity (M2, ADR-0035 §1): the
 * explicit `remainingDurationMinutes` when set, else derived from `durationMinutes × (1 −
 * percentComplete)` (rounded, floored at 0). Undefined for a not-started or complete activity — the
 * engine ignores it there (a complete activity uses its actual finish; not-started, its full duration).
 *
 * Extracted from `schedule.service.ts` (health M1-T4) so the recalculation path and the health
 * model share ONE rule rather than two copies that drift invisibly — the ADR-0065 `routeOrthogonal`
 * argument. The parameter is a structural pick so both callers' row shapes satisfy it.
 */
export function resolveRemainingMinutes(row: {
  // Only null-ness is read from the two actuals, so both callers' date representations satisfy the
  // pick (the recalculation path holds `Date`, the health model `YYYY-MM-DD` strings).
  actualStart: Date | string | null;
  actualFinish: Date | string | null;
  remainingDurationMinutes: number | null;
  durationMinutes: number;
  percentComplete: number;
}): number | undefined {
  if (row.actualStart == null || row.actualFinish != null) return undefined;
  if (row.remainingDurationMinutes != null) return row.remainingDurationMinutes;
  return Math.max(0, Math.round(row.durationMinutes * (1 - row.percentComplete / 100)));
}
