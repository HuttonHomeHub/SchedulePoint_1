import { useOrgOverview } from './api/overview-queries';
import { NeedsAttentionSection } from './components/NeedsAttentionSection';
import { OrganisationEmptyState } from './components/OrganisationEmptyState';
import { RecentlyChangedSection } from './components/RecentlyChangedSection';

import { PageContainer, PageHeader } from '@/components/ui/page';
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
 */
export function OverviewScreen({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const { data, isPending, isError, dataUpdatedAt, refetch } = useOrgOverview(orgSlug);
  const { data: organisations } = useOrganizations();
  const organisation = organisations?.find((candidate) => candidate.slug === orgSlug);
  const isWriter = canManageHierarchy(organisation?.role);

  const title = organisation?.name ?? data?.organisationName ?? 'Overview';
  useDocumentTitle(title);

  // `dataUpdatedAt` is 0 until the first successful fetch, which is exactly the window in which no
  // row exists to be timed — so the epoch this yields is never rendered against anything. Reading
  // the wall clock as a fallback would be an impure call during render for a value nothing reads.
  const now = new Date(dataUpdatedAt);

  const showEmptyOrganisation = data !== undefined && (data.isNewOrganisation || !data.hasPlans);

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={title}
        description="What has been happening, and what is waiting on you."
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
