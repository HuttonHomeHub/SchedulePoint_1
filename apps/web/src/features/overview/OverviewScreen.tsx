import { useEffect, useMemo } from 'react';

import { useOrgOverview } from './api/overview-queries';
import { JumpBackInSection } from './components/JumpBackInSection';
import { NeedsAttentionSection } from './components/NeedsAttentionSection';
import { OrganisationEmptyState } from './components/OrganisationEmptyState';
import { RecentlyChangedSection } from './components/RecentlyChangedSection';
import { prunePlans, readRecentPlanIds } from './model/recent-plans';

import { PageContainer, PageHeader } from '@/components/ui/page';
import { useSession } from '@/features/auth';
import { useOrganizations } from '@/features/organizations';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { canManageHierarchy } from '@/hooks/use-org-role';

/**
 * The organisation overview — the first screen after sign-in, and the landing every organisation
 * route resolves to.
 *
 * **A thin host.** It owns the one query, the role gate and the choice between "this organisation
 * has nothing yet" and "here is what has been happening"; it owns no layout of its own. The frame,
 * the heading, the sections, the rows, the skeletons and the empty states are all archetypes
 * (`components/ui/page/`), which is ADR-0097 Landing B's condition — a beautiful one-off on the
 * flagship screen would falsify the epic's thesis on its first outing.
 *
 * **One query for the whole screen, and therefore one Retry.** All three sections resolve the same
 * organisation, check the same permission and read the same database in the same request, so
 * partial failure is not a real mode and per-section error isolation would buy nothing while
 * costing a second round trip on the coldest path in the product.
 *
 * **The clock comes from `dataUpdatedAt`, not from `Date.now()` at render.** Every row needs a
 * `now` to render "20 minutes ago" against, and reading the wall clock per row would time a dozen
 * rows against a dozen slightly different instants; reading it per render would make the list a new
 * value on every paint. `dataUpdatedAt` is the moment the payload actually arrived, which is the
 * instant those relative times are honestly relative to.
 *
 * **The `<h1>` is read from the already-loaded organisations query, not from the overview payload.**
 * Both carry the same name, but the org list is warm before this screen mounts — the shell resolved
 * it to render the navigator — so taking it from there means the heading is correct on first paint
 * instead of reading "Overview" and swapping to the organisation's name a moment later. A page
 * heading that changes after arrival is a heading a screen-reader has already announced.
 *
 * **"Jump back in" costs no request.** The remembered ids are read from `localStorage` and sent as
 * a parameter on the overview call the screen is already making (ADR-0098 §4.9) — the constraint
 * that made the section acceptable on the coldest path in the product. They are read ONCE per
 * mount: re-reading on every render would make the query key a new value each time the workspace
 * re-rendered, and the ids do not change while this screen is open.
 */
export function OverviewScreen({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const { data: session } = useSession();
  const userId = session?.user.id;

  // Read once per mount — see the docblock. `userId` is the only thing that can legitimately
  // change it, and that only happens across a sign-out, which unmounts this screen.
  const recentPlanIds = useMemo(
    () => (userId === undefined ? [] : readRecentPlanIds(window.localStorage, { userId, orgSlug })),
    [userId, orgSlug],
  );

  const { data, isPending, isError, dataUpdatedAt, refetch } = useOrgOverview(
    orgSlug,
    recentPlanIds,
  );
  const { data: organisations } = useOrganizations();
  const organisation = organisations?.find((candidate) => candidate.slug === orgSlug);
  const isWriter = canManageHierarchy(organisation?.role);

  const title = organisation?.name ?? data?.organisationName ?? 'Overview';
  useDocumentTitle(title);

  // `dataUpdatedAt` is 0 until the first successful fetch, which is exactly the window in which no
  // row exists to be timed — so the epoch this yields is never rendered against anything. Reading
  // the wall clock as a fallback would be an impure call during render for a value nothing reads.
  const now = new Date(dataUpdatedAt);

  const resolvedRecent = data?.recentPlans ?? [];

  // Prune on settle: an id the server did not hand back is gone, out of reach, or was never real —
  // three states this deliberately cannot tell apart. Dropping it stops it costing a lookup on
  // every subsequent load, and is the only write this screen makes.
  useEffect(() => {
    if (data === undefined || userId === undefined || recentPlanIds.length === 0) return;
    prunePlans(window.localStorage, {
      userId,
      orgSlug,
      keep: data.recentPlans.map((plan) => plan.planId),
    });
  }, [data, userId, orgSlug, recentPlanIds.length]);

  const showEmptyOrganisation = data !== undefined && (data.isNewOrganisation || !data.hasPlans);

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={title}
        // **Role-aware, because the fixed version was false for two of the four roles.** The
        // screen shows "what is waiting on you" only for a reader who can hold an editing lock,
        // invite, or restore — "Needs your attention" is not rendered at all for a Viewer or a
        // Contributor (spec §2 US-2), so promising it to them is exactly the copy defect the
        // spec's own contract exists to prevent: a sentence that reads perfectly and describes a
        // screen they are not looking at.
        description={
          isWriter
            ? 'What has been happening, and what is waiting on you.'
            : 'What your organisation has been working on.'
        }
      />

      <div className="mt-6 flex flex-col gap-6">
        {showEmptyOrganisation ? (
          <OrganisationEmptyState
            orgSlug={orgSlug}
            isNewOrganisation={data.isNewOrganisation}
            canAddClients={isWriter}
          />
        ) : (
          <>
            <JumpBackInSection plans={resolvedRecent} orgSlug={orgSlug} />
            <RecentlyChangedSection
              plans={data?.recentlyChanged ?? []}
              orgSlug={orgSlug}
              now={now}
              pending={isPending}
              error={isError}
              onRetry={() => void refetch()}
            />
            {isWriter && !isError ? (
              <NeedsAttentionSection
                attention={data?.attention}
                orgSlug={orgSlug}
                pending={isPending}
              />
            ) : null}
          </>
        )}
      </div>
    </PageContainer>
  );
}
