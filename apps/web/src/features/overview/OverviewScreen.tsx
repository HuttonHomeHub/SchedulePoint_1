import { useEffect, useMemo } from 'react';

import { useOrgOverview } from './api/overview-queries';
import { JumpBackInSection } from './components/JumpBackInSection';
import { NeedsAttentionSection } from './components/NeedsAttentionSection';
import { OrganisationEmptyState } from './components/OrganisationEmptyState';
import { RecentlyChangedSection } from './components/RecentlyChangedSection';
import { WhereWorkStandsSection } from './components/WhereWorkStandsSection';
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

  /**
   * Whether anything is genuinely waiting on this reader — independently of whether the
   * organisation has any work in it yet.
   *
   * **An empty organisation can still have something waiting on you, and the screen used to deny
   * it.** `OrganisationEmptyState` replaced *every* section, so an Org Admin who created an
   * organisation and invited their colleagues before adding a client was told "This organisation is
   * empty" while two invitations sat outstanding — the landing failing to say something true, which
   * is the defect class this whole epic exists to remove, in the one state where the reader has
   * least else to go on.
   *
   * Found by `e2e-overview/members.spec.ts` on its first run (ADR-0081: the journey is the gate).
   * No unit test could have: the screen tests render a populated organisation, because that is the
   * interesting one.
   *
   * It is deliberately NOT `!showEmptyOrganisation`: the empty state still owns the *work*
   * sections, because there genuinely is no work to show. What it may not own is the reader's own
   * inbox.
   */
  const hasWaitingItems =
    isWriter &&
    !isError &&
    data !== undefined &&
    (data.attention.heldLocks.length > 0 ||
      (data.attention.liveInvitationCount ?? 0) > 0 ||
      (data.attention.expiredInvitationCount ?? 0) > 0 ||
      (data.attention.expiringDeletedCount ?? 0) > 0);

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
          <>
            <OrganisationEmptyState
              orgSlug={orgSlug}
              isNewOrganisation={data.isNewOrganisation}
              canAddClients={isWriter}
            />
            {/* Only when there is something to say. An empty organisation with nothing waiting
                shows the empty state alone, exactly as it did — a "Needs your attention" frame
                reading "Nothing needs you right now" beneath "This organisation is empty" would be
                two ways of saying the same nothing. */}
            {hasWaitingItems ? (
              <NeedsAttentionSection attention={data.attention} orgSlug={orgSlug} pending={false} />
            ) : null}
          </>
        ) : (
          <>
            {/*
              **The order is measured, not preferred, and it corrects the approved plan.**

              `implementation-plan.md` M5-T1 step 1 specified
              `Jump back in -> Where the work stands -> Recently changed -> Needs your attention`,
              on the principle that "worst news is not first; the reader's own work is". The
              principle stands and this order keeps it. The sequence did not survive measurement.

              M0's finding was that Q3 ("is anything waiting on me?") is answered at `y = 1053`,
              **53 px below the fold** on the product owner's own screen — the one question the spec
              agreed was already answered, answered somewhere the reader has to go looking. The
              plan's order was written before any section had been measured, and it puts that
              section LAST behind two ~750 px lists: Q3 lands at **2006**, twice as far away as the
              defect M0 opened this on.

              Measured section heights at 1646 are 158 / 749 / 789 / 463 (`m5-verdict.md`), and an
              exhaustive search of all 24 orderings scores this one joint-best at **4 of 7**. Of the
              two that tie while still leading with the reader's own work, this is the one that puts
              the programme's HEALTH above the fold rather than the activity feed — which is the
              content this epic exists to add.
            */}
            <JumpBackInSection plans={resolvedRecent} orgSlug={orgSlug} />
            {isWriter && !isError ? (
              <NeedsAttentionSection
                attention={data?.attention}
                orgSlug={orgSlug}
                pending={isPending}
              />
            ) : null}
            {/*
              **Rendered only when the server sent the field.** `planStanding` is OMITTED for a
              caller who may not read schedules, rather than sent as `[]` — so `=== undefined` is
              "you may not see this" and `[]` is "there is nothing to see", and the two get
              different treatment: no frame at all, versus a frame with an empty state
              (ADR-0098; ADR-0082's first omit clause at section granularity).

              It is deliberately NOT `(data?.planStanding ?? [])`, which would collapse the two
              and render a permanently empty frame for a reader with no right to the answer — and
              would ALSO render one during the pending window, since `data` is undefined then.

              There is therefore **no skeleton for this section, on purpose**: it cannot be drawn
              without first assuming this reader is entitled to the answer, which would flash a
              frame at a Viewer who never gets one. The screen's single query means its single
              loading and failure states are already reported once, by "Recently changed".
            */}
            {data?.planStanding !== undefined ? (
              <WhereWorkStandsSection standing={data.planStanding} orgSlug={orgSlug} />
            ) : null}
            <RecentlyChangedSection
              plans={data?.recentlyChanged ?? []}
              orgSlug={orgSlug}
              now={now}
              pending={isPending}
              error={isError}
              onRetry={() => void refetch()}
            />
          </>
        )}
      </div>
    </PageContainer>
  );
}
