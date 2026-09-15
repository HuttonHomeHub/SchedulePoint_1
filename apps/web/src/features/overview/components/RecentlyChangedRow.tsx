import type { RecentlyChangedPlan } from '@repo/types';
import { Link } from '@tanstack/react-router';

import { exactInstant, formatRelative } from '../model/relative-time';

import { ActorName } from './ActorName';

import { Badge } from '@/components/ui/badge';
import { ListRow, rowLinkClass } from '@/components/ui/page';

/**
 * One plan in "Recently changed".
 *
 * The `<time datetime>` carries the exact instant beside the relative one, because a relative time
 * is a poor primary for people accountable for dates (`docs/UX_STANDARDS.md` §6) — and it is in the
 * markup rather than a hover `title`, which a keyboard or touch reader never sees.
 *
 * **Only `DRAFT` earns a pill.** `ARCHIVED` cannot reach this list (the read excludes it — archiving
 * is how a planner says "stop showing me this"), and `ACTIVE` is every other row, so a badge on it
 * would be decoration on all-but-one row rather than a distinction.
 *
 * **The freshness line is silent when the plan is current, and that is the design.** Three states:
 * never calculated, edited since it was calculated, and current — which renders NOTHING. A line
 * reading "up to date" on most rows would be decoration on all-but-a-few, and worse, it would claim
 * more than the data supports: the check knows only that nothing has been WRITTEN since the
 * calculation, not that the dates are right. The spec's copy contract forbids "up to date", "on
 * time", "on schedule" and "late" for exactly that reason, and
 * `freshness-copy.structural.test.ts` enforces it.
 *
 * **Auto-arrange is a known false positive.** `packLanes` writes `lane_index` on every activity it
 * moves, which stamps `updated_at`, so pressing Auto-arrange after a recalculation makes every row
 * of that plan report as edited-since — truthfully, by the rule, and misleadingly to a reader who
 * changed no dates. Named here rather than discovered later as a defect; narrowing the rule to
 * "edited in a way that could move a date" would mean the client holding a second opinion about
 * what a scheduling input is, which is the thing R1 exists not to do.
 */
/**
 * Whether this plan's dates answer the question somebody is currently asking of it.
 *
 * Returns `null` for the healthy case, so a current plan costs the row no height at all.
 */
function FreshnessLine({
  plan,
  now,
}: {
  plan: RecentlyChangedPlan;
  now: Date;
}): React.ReactElement | null {
  if (plan.scheduleComputedAt === null) {
    return <p className="text-warning-text text-sm">Not yet calculated</p>;
  }
  if (!plan.editedSinceCalculated) return null;
  return (
    <p className="text-warning-text text-sm">
      Edited since it was last calculated{' '}
      <time dateTime={exactInstant(plan.scheduleComputedAt)} className="text-muted-foreground">
        ({formatRelative(plan.scheduleComputedAt, now)})
      </time>
    </p>
  );
}

export function RecentlyChangedRow({
  plan,
  orgSlug,
  now,
}: {
  plan: RecentlyChangedPlan;
  orgSlug: string;
  now: Date;
}): React.ReactElement {
  return (
    <ListRow
      primary={
        <>
          <p className="flex items-center gap-2">
            <Link
              to="/orgs/$orgSlug/plans/$planId"
              params={{ orgSlug, planId: plan.planId }}
              className={rowLinkClass}
            >
              {plan.planName}
            </Link>
            {plan.status === 'DRAFT' ? (
              <Badge size="sm" className="shrink-0">
                Draft
              </Badge>
            ) : null}
          </p>
          <p className="text-muted-foreground truncate text-sm">
            {plan.projectName} · {plan.clientName}
          </p>
          <FreshnessLine plan={plan} now={now} />
        </>
      }
      trailing={
        <p className="text-muted-foreground text-sm">
          <ActorName actor={plan.changedBy} />
          {' · '}
          <time dateTime={exactInstant(plan.changedAt)}>{formatRelative(plan.changedAt, now)}</time>
        </p>
      }
    />
  );
}
