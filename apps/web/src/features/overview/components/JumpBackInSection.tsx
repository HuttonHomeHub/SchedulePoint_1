import type { RecentPlan } from '@repo/types';
import { Link } from '@tanstack/react-router';

import { SectionCount } from './SectionCount';

import { ListRow, RowSubject, SectionCard, rowLinkClass } from '@/components/ui/page';

/**
 * "Jump back in" — the plans this reader was recently working in.
 *
 * **It is the one personalised section every role gets.** "Needs your attention" cannot serve a
 * Viewer or a Contributor, because there is nothing on it they can act on; this is the reader's own
 * history, so it works identically for all four roles.
 *
 * **Absent when empty, not empty.** A second device, a new browser, private mode, or an account
 * that has not opened a plan yet all produce the same thing: no heading, no frame, no "you haven't
 * opened anything". A section addressed to the reader personally, permanently blank, is the defect
 * `NeedsAttentionSection` returns `null` for one section along.
 *
 * **Every name here came from the server on this load.** The browser stores ids only (§4.9 D10b),
 * so a renamed plan shows its current name, and a plan that was deleted or has moved out of the
 * reader's reach is simply not in this list — which is also why a click can never land on a 404.
 * There is deliberately nothing saying "one of your recent plans is gone": that sentence would name
 * a plan to somebody who may no longer be entitled to know it exists.
 */
export function JumpBackInSection({
  plans,
  orgSlug,
  fill,
}: {
  plans: RecentPlan[];
  orgSlug: string;
  /** Fill the height the grid gives and scroll the body — see `SectionCard`. */
  fill?: boolean;
}): React.ReactElement | null {
  if (plans.length === 0) return null;

  return (
    <SectionCard
      title="Jump back in"
      fill={fill}
      action={<SectionCount count={plans.length} noun="plan" />}
    >
      <div>
        {plans.map((plan) => (
          <ListRow
            key={plan.planId}
            primary={
              <RowSubject
                name={
                  <Link
                    to="/orgs/$orgSlug/plans/$planId"
                    params={{ orgSlug, planId: plan.planId }}
                    className={rowLinkClass}
                  >
                    {plan.planName}
                  </Link>
                }
                context={`${plan.projectName} · ${plan.clientName}`}
              />
            }
          />
        ))}
      </div>
    </SectionCard>
  );
}
