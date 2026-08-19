import { useEffect } from 'react';

import { rememberPlan } from '../model/recent-plans';

import { useSession } from '@/features/auth';

/**
 * Record that this account opened this plan, so the overview can offer it back (ADR-0098 §4.9).
 *
 * **It lives here, not in the plan feature**, and importing it from there rather than writing three
 * lines of `localStorage` at the call site is the point: the store's key shape and its cap are one
 * decision, and a second copy of them in `features/plans` would be a second implementation of the
 * same format that nothing would report as it drifted.
 *
 * **Keyed on the plan, not on the render.** The effect's dependencies are exactly the four facts a
 * write depends on, so opening a plan writes once and re-rendering the workspace — which happens
 * constantly, on every canvas interaction — writes nothing.
 *
 * `resolved` gates it because a plan that 404s must not be remembered: the entry would be pruned on
 * the reader's next visit anyway, but it would first cost a lookup and briefly occupy one of five
 * slots that a plan they can actually open should have.
 */
export function useRememberPlan({
  orgSlug,
  planId,
  resolved,
}: {
  orgSlug: string;
  planId: string;
  resolved: boolean;
}): void {
  const { data: session } = useSession();
  const userId = session?.user.id;

  useEffect(() => {
    if (!resolved || userId === undefined || orgSlug === '' || planId === '') return;
    rememberPlan(window.localStorage, { userId, orgSlug, planId, at: Date.now() });
  }, [resolved, userId, orgSlug, planId]);
}
