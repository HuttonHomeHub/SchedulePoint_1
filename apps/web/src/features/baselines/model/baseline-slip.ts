import type { PlanVariance } from '../api/use-baselines';

/**
 * The working days the plan's finish has moved against the active baseline, or `undefined` when the
 * bottom bar should say nothing.
 *
 * Nothing is the answer for a read that is pending or failed (no pop-in beside Finish on first load,
 * ADR-0202, and a failed read must not read as "On baseline"), for no active baseline, and for an
 * active baseline whose days are `null` or absent (an older API, or a side with no finish). **A
 * `null` is never turned into 0**: 0 is a claim, "On baseline", and the API did not make it.
 */
export function baselineSlipDays(read: {
  isSuccess: boolean;
  data?: PlanVariance | undefined;
}): number | undefined {
  if (!read.isSuccess || !read.data) return undefined;
  const { baselineId, projectFinishVarianceDays } = read.data.summary;
  if (!baselineId) return undefined;
  return projectFinishVarianceDays ?? undefined;
}
