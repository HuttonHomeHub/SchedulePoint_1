import type { RecentlyChangedPlan } from '@repo/types';

import { useSettledCountAnnouncement } from '../hooks/use-settled-count-announcement';

import { RecentlyChangedRow } from './RecentlyChangedRow';

import { Button } from '@/components/ui/button';
import { EmptyState, ListRowSkeleton, SectionCard } from '@/components/ui/page';

/**
 * "Recently changed" — the way back into work.
 *
 * **The heading and caption are fixed by the spec's copy contract** (§2), which is a list of
 * sentences this screen may and may not say. Row attribution can say *that* a plan changed, when,
 * and who wrote last; it cannot say *what* changed, because nothing in the system records that —
 * ADR-0073 §3 excludes ordinary content edits from the audit log permanently, by decision. So
 * "Activity", "Timeline", "What's new" and "Feed" are all forbidden here: each promises a record of
 * events, which is exactly what this is not.
 *
 * **The two empties are different facts and stay apart.** "No plans have changed here yet" is about
 * this list; "this organisation has no plans" is about the organisation, and belongs to
 * `OrganisationEmptyState` — the whole screen, not this section. Collapsing them is the defect the
 * ADR-0073 C1 review caught in a live region, and it is why this section is never rendered at all
 * in the no-plans case.
 */
export function RecentlyChangedSection({
  plans,
  orgSlug,
  now,
  pending,
  error,
  onRetry,
}: {
  plans: RecentlyChangedPlan[];
  orgSlug: string;
  now: Date;
  pending: boolean;
  error: boolean;
  onRetry: () => void;
}): React.ReactElement {
  useSettledCountAnnouncement({
    pending,
    message: error
      ? null
      : plans.length === 0
        ? 'No plans have changed here yet.'
        : `${plans.length} recently changed plan${plans.length === 1 ? '' : 's'}.`,
  });

  return (
    <SectionCard
      title="Recently changed"
      description="Plans your organisation has worked on recently."
    >
      {pending ? (
        <ListRowSkeleton rows={4} />
      ) : error ? (
        <EmptyState
          size="section"
          title="We could not load recent changes."
          description="This is usually temporary."
          action={
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          }
        />
      ) : plans.length === 0 ? (
        <EmptyState
          size="section"
          title="No plans have changed here yet."
          description="Open a plan and start scheduling — it will appear here."
        />
      ) : (
        <div>
          {plans.map((plan) => (
            <RecentlyChangedRow key={plan.planId} plan={plan} orgSlug={orgSlug} now={now} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
