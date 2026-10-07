import { useCallback, useEffect, useRef, useState } from 'react';

import { NotFoundScreen } from '@/components/layout/not-found-screen';
import { Alert } from '@/components/ui/alert';
import { AnnouncerProvider, useAnnounce } from '@/components/ui/announcer';
import {
  PageContainer,
  PageGrid,
  PageGridItem,
  SectionGroup,
  StatusMuteProvider,
} from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useProbeResults } from '@/features/perf-probe/api/probe-results';
import { PerformanceProbePanel } from '@/features/perf-probe/ui/performance-probe-panel';
import { useRefreshStaffPageReads } from '@/features/staff/api/refresh-page-reads';
import { useStaffCspReports } from '@/features/staff/api/staff-csp-reports';
import { useStaffHealth } from '@/features/staff/api/staff-health';
import { useStaffIdentity } from '@/features/staff/api/staff-identity';
import {
  useStaffAccounts,
  useStaffActivity,
  useStaffInstallation,
} from '@/features/staff/api/staff-panels';
import { deriveConsoleStatus } from '@/features/staff/model/console-status';
import { freshnessOf } from '@/features/staff/model/freshness';
import {
  GROUPS,
  HEADER,
  loadedAnnouncement,
  refreshedAnnouncement,
} from '@/features/staff/model/panel-copy';
import { AccountsPanel } from '@/features/staff/ui/accounts-panel';
import { ActivityPanel } from '@/features/staff/ui/activity-panel';
import { AlertingPanel } from '@/features/staff/ui/alerting-panel';
import { ConsoleHeader } from '@/features/staff/ui/console-header';
import { DiagnosticsPanel } from '@/features/staff/ui/diagnostics-panel';
import { InstallationPanel } from '@/features/staff/ui/installation-panel';
import { MailPanel } from '@/features/staff/ui/mail-panel';
import { OnThisPage } from '@/features/staff/ui/on-this-page';
import { RetentionPanel } from '@/features/staff/ui/retention-panel';
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
  // The console names itself only once the server has said it is one. Pending and not-found both
  // leave the title alone: the not-found branch renders `NotFoundScreen`, which sets its own, so a
  // non-staff `/staff` has the title of any unknown address (ADR-0086, #459) — and "Staff console"
  // while pending would be the tell the uniform 404 forbids.
  useDocumentTitle(identity.data ? 'Staff console' : null);

  if (identity.isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4" aria-busy="true">
        <Spinner label="Loading…" />
      </main>
    );
  }

  // `null` is the ordinary answer for almost every caller, and it is deliberately NOT an error
  // state: the API answers a non-staff caller with the same 404 it gives a route that does not
  // exist, so the honest thing to show is the same thing — the one `NotFoundScreen` the router
  // renders for any unknown address — not "access denied", which would confirm the surface exists
  // and is worth attacking. A 5xx or a network failure lands here too, on purpose.
  if (identity.isError || identity.data === null) {
    return <NotFoundScreen />;
  }

  return (
    /**
     * **`/staff` had no live region at all, and nothing had noticed because nothing used one.**
     *
     * `AnnouncerProvider` is mounted by the authenticated app shell and by the auth shell; this
     * route is a sibling of both (ADR-0086) and had neither. `useAnnounce()` returns a **no-op** when
     * there is no provider above it, so the first component here to announce anything would have
     * done so into nothing — silently, with no error and nothing on screen looking wrong. A
     * mechanism that looks right and does nothing is worse than the defect it replaces.
     */
    <AnnouncerProvider>
      <main>
        <PageContainer className="space-y-6">
          <ConsoleBody email={identity.data.email} dualHatted={identity.data.dualHatted} />
        </PageContainer>
      </main>
    </AnnouncerProvider>
  );
}

/**
 * The console proper: six reads, one status, four groups.
 *
 * **It is a component of its own so the six reads are made only for somebody the server has already
 * said is staff.** They used to be called at the top of the screen, above the identity gate, so a
 * non-staff caller's browser asked for them too and each was refused (and recorded) — an audited
 * denial for every visit by anyone who typed the address, which is the opposite of the uniform
 * "nothing here" ADR-0086 wants. It is also what lets it call `useAnnounce()`, which needs the
 * provider the screen mounts.
 *
 * **The reads are called HERE and passed down as facts.** Each key is the one its panel already
 * uses, so TanStack dedupes them: two observers of a key are one request. That is the property that
 * keeps a load at six audited reads (SC-4) however many boxes read the same response — Mail and
 * Clearing old records share `health`, Version and settings and Alerts and monitoring share
 * `installation`. A second request is a second `staff.panel_read` row on every load, forever, in the
 * table that refuses `DELETE`.
 */
function ConsoleBody({
  email,
  dualHatted,
}: {
  email: string;
  dualHatted: boolean;
}): React.ReactElement {
  const health = useStaffHealth();
  const security = useStaffCspReports();
  const accounts = useStaffAccounts();
  const installation = useStaffInstallation();
  // The two reads the summary does not draw on but the freshness line and the load sentence do.
  const activity = useStaffActivity();
  const probeHistory = useProbeResults();

  const status = deriveConsoleStatus({
    health: { isPending: health.isPending, isError: health.isError, data: health.data },
    security: { isPending: security.isPending, isError: security.isError, data: security.data },
    accounts: {
      isPending: accounts.isPending,
      // A failed *Show more* leaves the rows standing and is the box's to report; the summary is
      // about whether the count could be read at all.
      isError: accounts.isError && !accounts.isFetchNextPageError,
      data: accounts.data?.pages[0],
    },
    installation: {
      isPending: installation.isPending,
      isError: installation.isError,
      data: installation.data,
    },
  });
  const freshness = freshnessOf(
    [health, security, accounts, installation, activity, probeHistory].map((query) => ({
      dataUpdatedAt: query.dataUpdatedAt,
      isError: query.isError && !(query === accounts && accounts.isFetchNextPageError),
      isPending: query.isPending,
    })),
  );

  const announce = useAnnounce();
  const refreshReads = useRefreshStaffPageReads();
  const [refreshing, setRefreshing] = useState(false);
  // **A second flag, not `refreshing`** (ADR-0178 D8). `refreshing` clears one microtask after
  // `setRefreshed`, which is before the render that carries the answer has been committed and the
  // page has spoken; unmuting there would let a late query notification speak from a box. This one
  // is cleared by the effect below, after `announce(...)`.
  const [muted, setMuted] = useState(false);
  // Set when a refresh has finished and is waiting for the render that shows its answer.
  const [refreshed, setRefreshed] = useState<{ firstPageSize: number | null } | null>(null);
  const loadAnnounced = useRef(false);

  // **One sentence when the page has settled, instead of one per box** (ADR-0178 D-6, SC-6). A
  // standing condition is not an event (ADR-0132); the summary above is not live either, so this is
  // the single place the page speaks on arrival.
  useEffect(() => {
    if (!freshness.settled || loadAnnounced.current) return;
    loadAnnounced.current = true;
    announce(loadedAnnouncement(status.sentence));
  }, [announce, freshness.settled, status.sentence]);

  // **After the render that carries the new answer, not before it.** Query observers are notified
  // on a later task than the one the refetch resolves on, so announcing from the click handler would
  // read the headline of the page as it was. The sentence is read through a ref so a later change to
  // the headline does not announce a refresh that already happened; only a new `refreshed` does.
  const sentence = useRef(status.sentence);
  useEffect(() => {
    sentence.current = status.sentence;
  });
  useEffect(() => {
    if (refreshed === null) return;
    announce(refreshedAnnouncement(sentence.current, refreshed.firstPageSize));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the unmute must follow the committed announcement, which only an effect observes
    setMuted(false);
  }, [announce, refreshed]);

  const refresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    setMuted(true);
    void refreshReads()
      .then(
        (result) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              setRefreshed(result);
              resolve();
            }, 0);
          }),
      )
      // A read that rejects never reaches the announcing effect, which is the only thing that
      // unmutes: without this the boxes would stay silent for the rest of the session. Not in
      // `.finally`, which would also unmute on success before the page has spoken.
      .catch((error: unknown) => {
        setMuted(false);
        console.error('Could not refresh the staff console reads', error);
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [refreshReads, refreshing]);

  return (
    <>
      <ConsoleHeader
        email={email}
        freshness={freshness}
        refreshing={refreshing}
        onRefresh={refresh}
      />
      {/* ADR-0086 D4 permits dual-hatting rather than refusing it — refusing would lock the only
          staff member out on day one — and the compensation it named was that the console says
          which hat is active. It is a SIBLING of the header and not one of its `actions`: that slot
          is a `flex shrink-0` row, right for a button and wrong for a full-width banner. */}
      {dualHatted && (
        <Alert purpose="condition" tone="info">
          {HEADER.dualHat}
        </Alert>
      )}
      {/* **Never columned.** A status answer must not sit beside anything: placed in a column it
          would be one of two things a reader's eye has to choose between, on the screen whose
          entire job is to answer one question before anything else is read. */}
      <StaffStatusSummary status={status} onRetryAll={refresh} retrying={refreshing} />
      <OnThisPage />
      {/* **Grouped by what the reader came to do, not by where the data comes from** (ADR-0178):
          conditions, then what this installation is, then the tools, then the record. The order is
          DOM order and therefore the order a screen reader walks; the one pair side by side is two
          short key-value lists, which is the only place a second column buys anything (ADR-0143 D3's
          span-by-demand rule, kept). */}
      <StatusMuteProvider muted={muted}>
        <SectionGroup {...GROUPS.conditions} backToTopHref="#staff-top">
          <MailPanel />
          <RetentionPanel />
          <SecurityPanel />
          <AccountsPanel />
        </SectionGroup>
        <SectionGroup {...GROUPS.installation} backToTopHref="#staff-top">
          <PageGrid>
            <PageGridItem span="narrow">
              <InstallationPanel />
            </PageGridItem>
            <PageGridItem span="narrow">
              <AlertingPanel />
            </PageGridItem>
          </PageGrid>
        </SectionGroup>
        <SectionGroup {...GROUPS.tools} backToTopHref="#staff-top">
          <DiagnosticsPanel />
          <PerformanceProbePanel apiVersion={installation.data?.apiVersion ?? null} />
        </SectionGroup>
        <SectionGroup {...GROUPS.record} backToTopHref="#staff-top">
          <ActivityPanel />
        </SectionGroup>
      </StatusMuteProvider>
    </>
  );
}
