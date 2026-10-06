import { Alert } from '@/components/ui/alert';
import { AnnouncerProvider } from '@/components/ui/announcer';
import { buttonVariants } from '@/components/ui/button';
import {
  PageContainer,
  PageGrid,
  PageGridItem,
  PageHeader,
  StatusSection,
} from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { PerformanceProbePanel } from '@/features/perf-probe/ui/performance-probe-panel';
import { useStaffCspReports } from '@/features/staff/api/staff-csp-reports';
import { useStaffHealth } from '@/features/staff/api/staff-health';
import { useStaffIdentity } from '@/features/staff/api/staff-identity';
import { useStaffAccounts, useStaffInstallation } from '@/features/staff/api/staff-panels';
import { CHECK_SECTION_ID, deriveConsoleStatus } from '@/features/staff/model/console-status';
import { statusSentence } from '@/features/staff/model/retention-copy';
import { AccountsPanel } from '@/features/staff/ui/accounts-panel';
import { ActivityPanel } from '@/features/staff/ui/activity-panel';
import { DiagnosticsPanel } from '@/features/staff/ui/diagnostics-panel';
import { InstallationPanel } from '@/features/staff/ui/installation-panel';
import { MailSection } from '@/features/staff/ui/mail-panel';
import { RetentionSection } from '@/features/staff/ui/retention-panel';
import { SecurityPanel } from '@/features/staff/ui/security-panel';
import { StaffStatusSummary } from '@/features/staff/ui/status-summary';
import { useDocumentTitle } from '@/hooks/use-document-title';

/**
 * The staff console (ADR-0086) — SchedulePoint's own operations surface.
 *
 * **Canvas-free, and a sibling of the authenticated shell rather than a child of it.** Both are
 * consequences of the same decision: staff operate the *installation* and reach no customer data,
 * so there is nothing here for the Project Explorer to navigate and no plan for a canvas to draw.
 * Reaching the canvas would mean reaching plan data, which would mean holding a `Principal`, which
 * would destroy the compile-error property the whole epic rests on.
 *
 * Sitting outside `_authed` also avoids a trap the shell would otherwise spring: its home resolver
 * sends an account with **no organisations** to `/onboarding`, inviting it to create one. A
 * dedicated staff account is exactly that account, so the recommended configuration would have been
 * met with an invitation to become an Org Admin.
 *
 * **The gate is runtime evidence, never a `VITE_` constant.** Staff-ness is a server fact read from
 * `STAFF_EMAILS`, which the bundle cannot see and an operator changes without a release.
 */
export function StaffConsoleScreen(): React.ReactElement {
  const identity = useStaffIdentity();
  /**
   * The four queries the summary reads, called HERE and passed down as facts.
   *
   * **This adds no request.** Each key is the one its panel already uses, so TanStack dedupes them
   * — which is the same mechanism that already lets the Mail and Retention halves share one
   * response. The one that needed checking rather than assuming is `useStaffAccounts`, which is
   * one infinite query: this call and the panel's share its key, the summary reads page 1 of it, and
   * pressing *Show older* fetches the next page into the same entry without refetching the first.
   * Two requests either way.
   *
   * It matters because reading a staff panel is an audited act — a second request is a second
   * `staff.panel_read` row on every page load, forever, in the table that refuses `DELETE`.
   */
  const health = useStaffHealth();
  const security = useStaffCspReports();
  const accounts = useStaffAccounts();
  const installation = useStaffInstallation();
  const status = deriveConsoleStatus({
    health: { isPending: health.isPending, isError: health.isError, data: health.data },
    security: { isPending: security.isPending, isError: security.isError, data: security.data },
    accounts: {
      isPending: accounts.isPending,
      // A failed *Show older* leaves the first page standing and is the panel's to report; the
      // summary is about whether the count could be read at all.
      isError: accounts.isError && !accounts.isFetchNextPageError,
      data: accounts.data?.pages[0],
    },
    installation: {
      isPending: installation.isPending,
      isError: installation.isError,
      data: installation.data,
    },
  });
  // Both landable states name themselves. `/staff` is reached only by typing the address — there is
  // deliberately no link to it — so the title is the first thing a screen reader announces on
  // arrival, and this was the one sibling of the authenticated shell that skipped the hook every
  // other public route calls (WCAG 2.4.2).
  // While identity is pending the title is left as the document's own, `SchedulePoint`: "Not found"
  // there was a claim made before anything had been asked, and "Staff console" would be the tell
  // ADR-0086 forbids. Only the settled answers name themselves.
  useDocumentTitle(identity.isPending ? null : identity.data ? 'Staff console' : 'Not found');

  if (identity.isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4" aria-busy="true">
        <Spinner label="Loading…" />
      </main>
    );
  }

  // `null` is the ordinary answer for almost every caller, and it is deliberately NOT an error
  // state: the API answers a non-staff caller with the same 404 it gives a route that does not
  // exist, so the honest thing to show is the same thing — not "access denied", which would confirm
  // the surface exists and is worth attacking.
  if (identity.isError || identity.data === null) {
    return (
      <main>
        <PageContainer width="narrow">
          <PageHeader
            title="Not found"
            description={
              <>
                There is nothing at this address.{' '}
                <a className="underline" href="/">
                  Go to SchedulePoint
                </a>
                .
              </>
            }
          />
        </PageContainer>
      </main>
    );
  }

  return (
    /**
     * **`/staff` had no live region at all, and nothing had noticed because nothing used one.**
     *
     * `AnnouncerProvider` is mounted by the authenticated app shell and by the auth shell; this
     * route is a sibling of both (ADR-0086) and had neither. `useAnnounce()` returns a **no-op** when
     * there is no provider above it, so the first component here to announce anything would have
     * done so into nothing — silently, with no error and nothing on screen looking wrong. Three of
     * `useClipboardCopy`'s five call sites are on this page, so mounting it is part of that change
     * rather than an extra: a mechanism that looks right and does nothing is worse than the defect
     * it replaces.
     */
    <AnnouncerProvider>
      <main>
        <PageContainer className="space-y-6">
          {/* `actions` carries the way back, and until now there was none. The authenticated branch
            rendered a header with no link home while the NOT-FOUND branch above has one — so the
            branch for people who cannot use this page had a way out and the branch for people who
            can did not, and there is no app shell here to supply one. Nobody had noticed: not the
            spec, not M0's pictures. `docs/UX_STANDARDS.md:122`, and spec §8.15. */}
          <PageHeader
            title="Staff console"
            description={
              <>
                Signed in as {identity.data.email}. This console operates the installation — it
                cannot reach any customer&rsquo;s clients, projects or plans.
              </>
            }
            actions={
              /* A plain `<a>`, not a router `<Link>`: `/staff` is outside the `_authed` shell and a
               staff account need not be a member of anything, so the destination is the app's front
               door rather than a route this one knows about. `buttonVariants` is the established way
               to give a link a button's treatment (`InviteExitLinks.tsx:29`) — `Button` renders a
               `<button>` and has no `asChild`. */
              <a className={buttonVariants({ variant: 'ghost', size: 'sm' })} href="/">
                Back to SchedulePoint
              </a>
            }
          />
          {/* ADR-0086 D4 permits dual-hatting rather than refusing it — refusing would lock the only
            staff member out on day one — and the compensation it named was that the console says
            which hat is active. That was decided and never built; the UX review found it.

            It is a SIBLING of `PageHeader` and deliberately not one of its `actions`: that slot
            renders in a `flex shrink-0 items-center gap-2` (`page-header.tsx:60`), which is right
            for a button and wrong for a full-width banner. The plan's "keep it exactly as it is"
            was ambiguous about placement (spec §8.19). */}
          {identity.data.dualHatted && (
            <Alert purpose="condition" tone="info">
              {/* **The weight came out, and the third sentence with it** (M5-T1). A bold lead-in
                  earns its place when an alert is long enough that a scanning reader would
                  otherwise have to READ it to tell which condition it is — which is why the other
                  four on this page keep theirs. This one is two sentences inside a tinted block
                  with a leading icon and a tone colour, so the weight was a fourth channel saying
                  what three already said: the ADR-0097 precedent the weight ratchet's own comment
                  chain records. The dropped sentence restated "nothing you do here is done as a
                  member" in the other direction. */}
              This account is also an organisation member. Staff-ness confers nothing inside any
              organisation, and nothing you do here is done as a member.
            </Alert>
          )}
          {/* **Zone 1: never columned.** A status answer must not sit beside anything — placed in a
            column it would be one of two things a reader's eye has to choose between, on the screen
            whose entire job is to answer one question before anything else is read.

            The derivation takes the page's OWN query results as arguments and issues nothing.
            Reading a staff panel is an audited act, so a summary that fetched for itself would
            write a second `staff.panel_read` row on every page load — and `useStaffAccounts` is
            keyed by its cursor, so a summary calling it with no cursor while the panel below holds
            one after *Show older* would be a different query rather than a deduped one. */}
          <StaffStatusSummary status={status} />
          {/* **The order is priority, and the spans are content width demand — two separate
            decisions that a single-column stack conflated.**

            ORDER answers "what does an operator arrive wanting to know?", and it is also DOM order
            and therefore the order a screen reader walks. Conditions first (mail, policy
            violations, accounts that cannot sign in), then what this installation IS, then the
            tools, then the record. M0 measured the old order's cost: Performance and Diagnostics
            sat at positions 2 and 3, inert until a button is pressed, taking ~550 px of the best
            space on the page between the panel reporting a live failure and the panels reporting
            standing conditions.

            SPAN answers "how wide does this body need to be?" — never "how important is it". A
            section whose body is a `DataTable` is `wide`, because the console's tables carry up to
            five columns including `break-all` URI and address fields, and "the tables look cramped"
            is the diagnosis this epic was opened on. At the product measure a spanning section gets
            1,438 px of table against today's 798 (+80 %); the pair below gets 732 px each, which is
            ample for four facts or three buttons.

            **Only one pair falls out of that rule, and it is recorded rather than engineered.**
            Five of the seven sections are table-bodied, so the two-column grid buys exactly one
            paired row. That is a smaller win than "two columns" sounds like, and it is the honest
            one: what actually fixes this page is the WIDTH the spanning sections gain, the ORDER,
            and (M3) the summary. Pairing more would mean either narrowing a table — which FC-4
            forbids, and which is the regression the whole span rule exists to prevent — or making a
            span depend on how much data happened to arrive, which would make the layout a function
            of the database. */}
          <PageGrid>
            <PageGridItem span="wide">
              <MailAndRetentionPanel />
            </PageGridItem>
            <PageGridItem span="wide">
              <SecurityPanel />
            </PageGridItem>
            <PageGridItem span="wide">
              <AccountsPanel />
            </PageGridItem>
            {/* The one paired row: four facts beside two controls. Installation says what this
              installation is; Diagnostics is how you ask it a question. Neither has a table, and
              neither is an order of magnitude taller than the other — which is the condition that
              keeps a two-column row from leaving the ragged void that reads as unfinished. */}
            <PageGridItem span="narrow">
              <InstallationPanel />
            </PageGridItem>
            <PageGridItem span="narrow">
              <DiagnosticsPanel />
            </PageGridItem>
            <PageGridItem span="wide">
              <PerformanceProbePanel apiVersion={installation.data?.apiVersion ?? null} />
            </PageGridItem>
            <PageGridItem span="wide">
              <ActivityPanel />
            </PageGridItem>
          </PageGrid>
        </PageContainer>
      </main>
    </AnnouncerProvider>
  );
}

/**
 * Mail and retention, in one card — CQ-3.
 *
 * **Why they are one section at all.** Both are rendered from a single `useStaffHealth` response,
 * so two cards drew a boundary the data does not have. They are also the same kind of question:
 * *what is this installation doing with data over time* — messages going out, rows being deleted —
 * and an operator who wants one usually wants the other.
 *
 * **The title is neutral and both halves are `<h3>`s of equal rank, which departs from the spec's
 * own resolution** (`feature-spec.md` §8.12 said the card keeps the title "Mail" with retention as
 * a subsection). That would make retention read as a KIND of mail, which it is not, and it would
 * demote the panel an operator goes looking for by name when they want to know whether the sweep is
 * arming. A neutral parent with two equal children says what is true; a "Mail" parent says
 * something false about the hierarchy, in the one channel — the heading tree — that a screen-reader
 * user navigates by.
 *
 * **Retention keeps a heading, and that was the accepted cost of the merge.** Today it is an
 * `<h2>`, independently reachable by heading navigation; folded into mail's prose it would have
 * left the heading list entirely, and a reader would have had to open "Mail" and read its body to
 * find it. That cuts against exactly the "seasoned admin navigating with ease" framing this epic
 * was given, because **an expert AT user relies on heading and landmark shortcuts more, not less**.
 * `CardTitle` already supports `level={3}`, so this costs no shared contract change — §4.5's
 * objection was to pushing EVERY section heading down a level across the whole page, which is a
 * different and much larger thing.
 *
 * **The status sentence is composed, not concatenated.** `StatusSection` announces one polite sentence and
 * there are now two independently-settling facts behind it. They are joined with a full stop and a
 * space and each names its own subject ("Mail: …", "Retention: …"), so a screen reader speaks two
 * complete sentences rather than one run-on whose halves a listener has to separate by ear. While
 * either half is still pending its clause is absent rather than empty — a trailing separator is a
 * pause that means nothing.
 */
function MailAndRetentionPanel(): React.ReactElement {
  const health = useStaffHealth();
  const retention = health.data?.retention;

  const clauses = health.isPending
    ? []
    : health.isError
      ? ['Mail and retention state could not be read.']
      : [
          `Mail: ${String(health.data?.failuresLast24h ?? 0)} failures in the last 24 hours.`,
          retention === undefined ? null : statusSentence(retention),
        ].filter((clause): clause is string => clause !== null);

  return (
    <StatusSection title="Mail and retention" id={CHECK_SECTION_ID.mail} status={clauses.join(' ')}>
      <MailSection />
      <RetentionSection />
    </StatusSection>
  );
}
