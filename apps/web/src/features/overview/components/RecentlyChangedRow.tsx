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
 */
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
