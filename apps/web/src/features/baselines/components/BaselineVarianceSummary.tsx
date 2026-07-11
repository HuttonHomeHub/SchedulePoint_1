import type { PlanVarianceSummary } from '@repo/types';

/**
 * The plan-level variance roll-up (M7, ADR-0025) — a compact one-line summary of how the
 * live schedule compares to the active baseline: the worst finish slip and the counts of
 * activities behind / added / removed. Renders nothing when the plan has no active
 * baseline (`baselineId === null`), so the caller can mount it unconditionally.
 */
export function BaselineVarianceSummary({
  summary,
}: {
  summary: PlanVarianceSummary;
}): React.ReactElement | null {
  if (summary.baselineId === null) return null;

  const worst =
    summary.worstFinishSlipDays !== null && summary.worstFinishSlipDays > 0
      ? `worst slip ${summary.worstFinishSlipDays} d`
      : 'on or ahead of baseline';
  const parts = [worst, `${summary.behindCount} behind`];
  if (summary.addedCount > 0) parts.push(`${summary.addedCount} added`);
  if (summary.removedCount > 0) parts.push(`${summary.removedCount} removed`);

  return (
    <p className="text-muted-foreground text-sm">
      <span className="text-foreground font-medium">
        vs. {summary.baselineName ?? 'active baseline'}:
      </span>{' '}
      {parts.join(' · ')}
    </p>
  );
}
