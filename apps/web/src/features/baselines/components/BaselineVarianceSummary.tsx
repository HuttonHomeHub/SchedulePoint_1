import type { PlanVarianceSummary } from '@repo/types';

/**
 * The plan-level variance roll-up (M7, ADR-0025) — a compact one-line summary of how the
 * live schedule compares to the active baseline: the worst finish slip and the counts of
 * activities behind / added / removed. Renders nothing when the plan has no active
 * baseline (`baselineId === null`), so the caller can mount it unconditionally.
 *
 * **Names the basis** (`placement-baseline-variance`, US-2, amending ADR-0025): every
 * figure above is on the active baseline's `placementSnapshotLevel` — `PLACED` reads the
 * bars as drawn, `NETWORK` reads the pure-network dates. On `NETWORK` a second, plain
 * sentence names why (the baseline predates placement capture) and the remedy. That
 * sentence is a **standing condition, not an event** — ADR-0132's discriminator — so it is
 * plain muted text and not an `Alert`: it would read the same to a reader who opened this
 * plan five minutes later. `basis` absent (an older API image mid rolling-update,
 * ADR-0047) renders today's text with no qualifier — nothing is guessed.
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

  const basisLabel =
    summary.basis === 'PLACED'
      ? ' (placed dates)'
      : summary.basis === 'NETWORK'
        ? ' (earliest dates)'
        : '';

  return (
    <>
      <p className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium">
          vs. {summary.baselineName ?? 'active baseline'}
          {basisLabel}:
        </span>{' '}
        {parts.join(' · ')}
      </p>
      {summary.basis === 'NETWORK' ? (
        <p className="text-muted-foreground text-sm">
          This baseline was captured before placements were recorded, so bars moved by hand are not
          counted. Capture a new baseline to compare placed dates.
        </p>
      ) : null}
    </>
  );
}
