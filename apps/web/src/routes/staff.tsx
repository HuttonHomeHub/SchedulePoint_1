import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { PageContainer, PageGrid, PageGridItem, PageHeader, StatGrid } from '@/components/ui/page';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { Spinner } from '@/components/ui/spinner';
import { PerformanceProbePanel } from '@/features/perf-probe/ui/performance-probe-panel';
import { useStaffCspReports } from '@/features/staff/api/staff-csp-reports';
import { useStaffHealth, type RetentionTable } from '@/features/staff/api/staff-health';
import { useStaffIdentity } from '@/features/staff/api/staff-identity';
import {
  useStaffAccounts,
  useStaffActivity,
  useStaffInstallation,
} from '@/features/staff/api/staff-panels';
import { CHECK_SECTION_ID, deriveConsoleStatus } from '@/features/staff/model/console-status';
import {
  lastRunSentence,
  oldestSentence,
  overdueSentence,
  scheduleSentence,
  statusSentence,
  tableLabel,
} from '@/features/staff/model/retention-copy';
import { DiagnosticsPanel } from '@/features/staff/ui/diagnostics-panel';
import { Panel } from '@/features/staff/ui/panel';
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
   * keyed by its cursor: called with none here, it is the identical key the panel starts on, and
   * when a reader presses *Show older* the panel moves to a new key while this one stays cached and
   * does not refetch. Two requests either way.
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
    accounts: { isPending: accounts.isPending, isError: accounts.isError, data: accounts.data },
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
  useDocumentTitle(identity.data ? 'Staff console' : 'Not found');

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
    <main>
      <PageContainer width="wide" className="space-y-6">
        {/* `actions` carries the way back, and until now there was none. The authenticated branch
            rendered a header with no link home while the NOT-FOUND branch above has one — so the
            branch for people who cannot use this page had a way out and the branch for people who
            can did not, and there is no app shell here to supply one. Nobody had noticed: not the
            spec, not M0's pictures. `docs/UX_STANDARDS.md:122`, and spec §8.15. */}
        <PageHeader
          title="Staff console"
          description={
            <>
              Signed in as {identity.data.email}. This console operates the installation — it cannot
              reach any customer&rsquo;s clients, projects or plans.
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
            <strong className="font-medium">This account is also an organisation member.</strong>{' '}
            Staff-ness confers nothing inside any organisation, and nothing you do here is done as a
            member. Anything you reach in the app itself, you reach with your ordinary membership.
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
            is the diagnosis this epic was opened on. At `width="wide"` a spanning section gets
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
          {/* The one paired row: four facts beside three controls. Installation says what this
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
            <PerformanceProbePanel />
          </PageGridItem>
          <PageGridItem span="wide">
            <ActivityPanel />
          </PageGridItem>
        </PageGrid>
      </PageContainer>
    </main>
  );
}

/**
 * Mail health — the question this console was built to answer without a shell.
 *
 * The configuration row is the part most easily left out and the part that matters most: zero
 * failures with **no transport configured** is not health, it means every send is being logged
 * instead of delivered, which looks identical in a count.
 */
function MailSection(): React.ReactElement {
  const health = useStaffHealth();
  const data = health.data;

  const columns: Column<NonNullable<typeof data>['recentFailures'][number]>[] = [
    { header: 'When', cell: (row) => new Date(row.occurredAt).toLocaleString() },
    { header: 'Message', cell: (row) => row.kind.replace(/_/g, ' ') },
    { header: 'Recipient', cell: (row) => row.recipient ?? '—', cellClassName: 'break-all' },
    { header: 'Error', cell: (row) => row.errorClass ?? '—' },
  ];

  return (
    <section aria-labelledby={MAIL_HEADING_ID} className="space-y-4">
      <CardTitle id={MAIL_HEADING_ID} level={3} className="text-sm">
        Mail
      </CardTitle>
      {health.isPending && <Spinner label="Loading mail health…" />}
      {health.isError && (
        <QueryErrorState
          label="Could not read mail health."
          onRetry={() => void health.refetch()}
        />
      )}
      {/* **`!isError &&`, not just `data !== undefined`.** `query.data` is not cleared by a failed
          refetch nor while one is in flight, so without this the failure message above renders
          directly on top of the previous run's figures, with nothing saying they are stale — the
          ADR-0140 M4 finding, which applies to four panels here. It is the worst of the three
          states, because it looks like a page that is partly working. */}
      {!health.isError && data !== undefined && (
        <>
          {!data.transportConfigured && (
            <Alert purpose="condition" tone="info">
              <strong className="font-medium">No mail transport is configured.</strong> Every
              message is being written to the log instead of sent — which produces no failures, and
              is why the counts below read as healthy.
            </Alert>
          )}

          <StatGrid
            columns={3}
            items={[
              { label: 'Failures, last hour', value: String(data.failuresLastHour) },
              { label: 'Failures, last 24 hours', value: String(data.failuresLast24h) },
              {
                label: 'Last failure',
                value:
                  data.lastFailureAt === null
                    ? 'Never'
                    : new Date(data.lastFailureAt).toLocaleString(),
              },
            ]}
          />

          {/* **The badge states the fact; the sentence states the cost.** These two switches are
              what the whole epic exists to surface, and "off" alone left a reader unable to tell
              whether it meant "nobody will be told" or "something else covers it". The transport
              alert three lines up already spelled out its consequence; these did not. */}
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.alertingConfigured ? 'neutral' : 'warning'}>
                {data.alertingConfigured ? 'Failure alerting: on' : 'Failure alerting: off'}
              </Badge>
              <Badge variant={data.heartbeatConfigured ? 'neutral' : 'warning'}>
                {data.heartbeatConfigured ? 'Heartbeat: on' : 'Heartbeat: off'}
              </Badge>
            </div>
            {!data.alertingConfigured && (
              <p className="text-muted-foreground text-sm">
                A broken relay will not notify anyone. You would find out here, or when somebody
                reports that they cannot sign in. Set <code>MAIL_ALERT_URL</code> to change that.
              </p>
            )}
            {!data.heartbeatConfigured && (
              <p className="text-muted-foreground text-sm">
                Nothing is watching whether this API is alive. An application cannot report that it
                is down, so only an external check can. Set <code>HEARTBEAT_URL</code>.
              </p>
            )}
          </div>

          <DataTable
            caption="Recent mail failures, newest first"
            columns={columns}
            query={{
              isPending: false,
              isError: false,
              data: data.recentFailures,
              refetch: () => health.refetch(),
            }}
            getRowKey={(row) => row.id}
            loadingLabel="Loading mail failures…"
            empty={<p className="text-muted-foreground text-sm">No failures recorded.</p>}
          />
        </>
      )}
    </section>
  );
}

/**
 * Is retention being honoured? (ADR-0087)
 *
 * **The leading answer is derived from the data, not reported by the sweep.** A last-run timestamp
 * alone cannot tell "the sweep is working" from "the sweep never armed" — the inverted-signal
 * problem `HeartbeatService` exists to solve one layer out, and the reason this panel leads with the
 * age of the oldest surviving row. That fact is true of the database whether or not any sweep code
 * has ever run, including on a replica that has this instant booted.
 *
 * **No hook of its own and no second request**: `useStaffHealth` already carries it, and reading a
 * staff panel is an audited act, so a second route would have written a second `staff.panel_read`
 * row on every page load (spec §4.6). TanStack Query dedupes the call with the Mail panel above.
 */
const MAIL_HEADING_ID = 'staff-mail-heading';
const RETENTION_HEADING_ID = 'staff-retention-heading';
const RETENTION_DISABLED_ID = 'retention-disabled-note';
const RETENTION_FAILING_ID = 'retention-failing-note';

function RetentionSection(): React.ReactElement {
  const health = useStaffHealth();
  const retention = health.data?.retention;
  // Read from the SAME response, because "the sweep is failing" and "anybody outside this screen
  // knows" are two different facts and the second one is unset on the deployed host today. The Mail
  // panel above already discloses this for its own failures; the UX review found that this one did
  // not, on the panel where the reader is most likely to assume somebody has been paged.
  const alertingConfigured = health.data?.alertingConfigured ?? false;

  const columns: Column<RetentionTable>[] = [
    { header: 'Table', cell: (row) => tableLabel(row.table) },
    { header: 'Keeps for', cell: (row) => `${String(row.retentionDays)} days` },
    {
      header: 'Oldest row',
      cell: (row) => (
        <>
          <span className="tabular-nums">{oldestSentence(row)}</span>
          {row.overdue && (
            // The word, not the colour (WCAG 1.4.1). The badge says "Overdue"; the sentence below
            // carries only the number the claim rests on, so a screen reader does not hear the word
            // twice in a row — which is what the first version did.
            <>
              {' '}
              <Badge variant="warning">Overdue</Badge>
              <span className="text-warning-text block text-xs">{overdueSentence(row)}</span>
            </>
          )}
        </>
      ),
    },
    { header: 'Last run', cell: (row) => lastRunSentence(row) },
  ];

  // Bound once. Called twice it did the same work twice and, more to the point, could have
  // straddled a boundary between the two calls — `now` defaults to `Date.now()`.
  const schedule = retention === undefined ? null : scheduleSentence(retention);
  // Both caveats change how the ages and the Overdue flags below should be read, and `DataTable`
  // is a focusable `role="region"` — so a reader navigating by landmark lands INSIDE it, having
  // skipped whatever sits above. `describedById` is the established fix (`my-activity.tsx`).
  const notes = [
    retention?.enabled === false ? RETENTION_DISABLED_ID : undefined,
    retention !== undefined && retention.consecutiveFailures > 0 ? RETENTION_FAILING_ID : undefined,
  ].filter((id): id is string => id !== undefined);

  return (
    <section aria-labelledby={RETENTION_HEADING_ID} className="space-y-4">
      <CardTitle id={RETENTION_HEADING_ID} level={3} className="text-sm">
        Retention
      </CardTitle>
      {health.isPending && <Spinner label="Loading retention…" />}
      {health.isError && (
        <QueryErrorState
          label="Could not read retention state."
          onRetry={() => void health.refetch()}
        />
      )}
      {/* **`!isError &&`, not just `data !== undefined`.** `query.data` is not cleared by a failed
          refetch nor while one is in flight, so without this the failure message above renders
          directly on top of the previous run's figures, with nothing saying they are stale — the
          ADR-0140 M4 finding, which applies to four panels here. It is the worst of the three
          states, because it looks like a page that is partly working. */}
      {!health.isError && retention !== undefined && (
        <>
          {!retention.enabled && (
            <Alert purpose="condition" tone="info" id={RETENTION_DISABLED_ID}>
              <strong className="font-medium">Retention sweeping is disabled.</strong> Nothing is
              being deleted. Set <code>RETENTION_SWEEP_ENABLED=true</code> to resume — the ages
              below are still real, and will keep growing until you do.
            </Alert>
          )}
          {retention.consecutiveFailures > 0 && (
            <Alert purpose="condition" tone="error" id={RETENTION_FAILING_ID}>
              <strong className="font-medium">
                The last {String(retention.consecutiveFailures)} sweep
                {retention.consecutiveFailures === 1 ? '' : 's'} failed.
              </strong>{' '}
              The next run retries automatically. The commonest causes are the database refusing the
              delete and the database being unreachable; both appear in the API log as{' '}
              <code>retention.sweep_failed</code> with the error class.{' '}
              {alertingConfigured
                ? 'An alert was sent to your webhook after the third failure.'
                : 'Nobody has been notified — no MAIL_ALERT_URL is configured, so this screen is the only signal. Set it to be told next time.'}
            </Alert>
          )}
          {/* Null while disabled — the alert above carries that state, with the action attached.
              Saying it in both places is the duplication ADR-0077 M8 removed. */}
          {schedule !== null &&
            (schedule.overdue ? (
              // A whole interval past boot with no sweep is not the routine "just started" case:
              // the boot run is unawaited and finishes in milliseconds on an idle table, so this
              // almost certainly means it is stuck. Drawing it as muted body text alongside the
              // healthy sentence is the lit-but-inert shape ADR-0059 M6 records.
              // `tone="error"` with `purpose="condition"` is the intended combination and not a
              // slip: being stuck is serious, which is what the tone says, and it is also a state
              // that was already true when the reader arrived — so it must not interrupt them. The
              // two props answer different questions (ADR-0132).
              <Alert purpose="condition" tone="error">
                {schedule.text}
              </Alert>
            ) : (
              <p className="text-muted-foreground text-sm">{schedule.text}</p>
            ))}
          <DataTable
            caption="Retention by table"
            columns={columns}
            query={{
              isPending: false,
              isError: false,
              data: retention.tables,
              refetch: () => health.refetch(),
            }}
            getRowKey={(row) => row.table}
            loadingLabel="Loading retention…"
            describedById={notes.length > 0 ? notes.join(' ') : undefined}
            empty={<p className="text-muted-foreground text-sm">Nothing is swept on a schedule.</p>}
          />
          {/* The scope, stated in the product rather than only in DEPLOYMENT.md. "Every table is
              inside its period" is otherwise an invitation to conclude that everything is bounded,
              and the most sensitive table in the system is deliberately not. */}
          <p className="text-muted-foreground text-sm">
            These are the only tables swept on a schedule. <code>audit_events</code> is{' '}
            <strong className="font-medium">not</strong> — it refuses <code>DELETE</code> in the
            database by design (ADR-0085), so it is retained indefinitely and that is a decision
            rather than an oversight.
          </p>
        </>
      )}
    </section>
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
 * **The status sentence is composed, not concatenated.** `Panel` announces one polite sentence and
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
    <Panel title="Mail and retention" id={CHECK_SECTION_ID.mail} status={clauses.join(' ')}>
      <MailSection />
      <RetentionSection />
    </Panel>
  );
}

/**
 * What the Content-Security-Policy is blocking.
 *
 * **An empty table is not proof the policy is clean, and the panel says so.** Delivery from a real
 * browser to this sink is unverified end to end (`docs/TECH_DEBT.md` #117) — the Reporting API
 * uploads out-of-band, so nothing in the repository can observe it — which means silence here reads
 * "nothing arrived", not "nothing happened". A panel that let a reader take an empty table as
 * evidence would be worse than no panel, because it would point the wrong way on the one decision
 * it exists to inform.
 */
function SecurityPanel(): React.ReactElement {
  const reports = useStaffCspReports();

  const columns: Column<NonNullable<typeof reports.data>[number]>[] = [
    {
      header: 'Directive',
      cell: (row) => (
        <>
          {row.effectiveDirective}
          {row.sourceFile !== null && (
            // The source location names what to CHANGE, which the blocked URI often cannot:
            // ADR-0074's report-only window found a violation caused by a dependency's own code.
            <span className="text-muted-foreground block text-xs break-all">
              {row.sourceFile}
              {row.lineNumber !== null && `:${String(row.lineNumber)}`}
            </span>
          )}
        </>
      ),
    },
    { header: 'Blocked', cell: (row) => row.blockedUri, cellClassName: 'break-all' },
    // `—` rather than a guess: the legacy report body carries no disposition in every engine.
    { header: 'Mode', cell: (row) => row.disposition ?? '—' },
    { header: 'Seen', cell: (row) => String(row.count), cellClassName: 'tabular-nums' },
    { header: 'Last', cell: (row) => new Date(row.lastSeenAt).toLocaleString() },
  ];

  return (
    <Panel
      title="Content-Security-Policy"
      id={CHECK_SECTION_ID.security}
      status={
        reports.isPending
          ? ''
          : reports.isError
            ? 'Policy reports could not be read.'
            : `Content-Security-Policy: ${String(reports.data?.length ?? 0)} distinct violations recorded.`
      }
    >
      <DataTable
        caption="Distinct policy violations, most recent activity first"
        columns={columns}
        query={reports}
        getRowKey={(row) => row.id}
        loadingLabel="Loading policy reports…"
        errorLabel="Could not read policy reports."
        empty={
          <Alert purpose="condition" tone="info">
            <strong className="font-medium">No violations recorded.</strong> That is not yet proof
            the policy is clean — delivery from a browser to this sink has never been verified
            end&nbsp;to&nbsp;end, so an empty table means nothing has arrived rather than nothing
            has happened. To check it yourself, open the app and load a blocked resource, then look
            here.
          </Alert>
        }
      />
    </Panel>
  );
}

/** What this installation is running. Never the mail credential — the API sends host and port only. */
function InstallationPanel(): React.ReactElement {
  const installation = useStaffInstallation();
  const data = installation.data;

  return (
    <Panel
      title="Installation"
      id={CHECK_SECTION_ID.alerting}
      status={
        installation.isPending
          ? ''
          : installation.isError
            ? 'Installation state could not be read.'
            : `Installation: API ${data?.apiVersion ?? ''}, ${data?.environment ?? ''}.`
      }
    >
      {installation.isPending && <Spinner label="Loading installation…" />}
      {installation.isError && (
        <QueryErrorState
          label="Could not read installation state."
          onRetry={() => void installation.refetch()}
        />
      )}
      {/* `!isError &&` for the reason the Mail section records: a failed refetch does not clear
          `query.data`, so without it the failure message sits on top of stale figures. */}
      {!installation.isError && data !== undefined && (
        <>
          <StatGrid
            items={[
              { label: 'API version', value: data.apiVersion },
              { label: 'Environment', value: data.environment },
              { label: 'Mail host', value: data.mailHost ?? 'Not configured' },
              { label: 'Staff addresses', value: String(data.staffCount) },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            <Badge variant={data.requireEmailVerification ? 'neutral' : 'warning'}>
              {data.requireEmailVerification
                ? 'Email verification: enforced'
                : 'Email verification: off'}
            </Badge>
            <Badge variant={data.planEditLockEnforced ? 'neutral' : 'warning'}>
              {data.planEditLockEnforced ? 'Edit lock: enforced' : 'Edit lock: off'}
            </Badge>
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * Who cannot sign in.
 *
 * **Paginated, and that is a fix rather than a feature.** The API returned `hasMore: true` and the
 * screen printed "More exist" with no way to reach them — a capability declared and not honoured,
 * found independently by the API and UX reviews. It matters most in exactly the case it was built
 * for: "did enforcing verification strand thirty existing accounts?"
 */
function AccountsPanel(): React.ReactElement {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const accounts = useStaffAccounts(cursor);
  const data = accounts.data;

  const columns: Column<NonNullable<typeof data>['unverified'][number]>[] = [
    { header: 'Address', cell: (row) => row.email, cellClassName: 'break-all' },
    { header: 'Registered', cell: (row) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <Panel
      title="Unverified accounts"
      id={CHECK_SECTION_ID.accounts}
      status={
        accounts.isPending
          ? ''
          : accounts.isError
            ? 'Accounts could not be read.'
            : `${String(data?.unverifiedTotal ?? 0)} unverified accounts.`
      }
    >
      {accounts.isPending && <Spinner label="Loading accounts…" />}
      {accounts.isError && (
        <QueryErrorState label="Could not read accounts." onRetry={() => void accounts.refetch()} />
      )}
      {/* `!isError &&` for the reason the Mail section records: a failed refetch does not clear
          `query.data`, so without it the failure message sits on top of stale figures. */}
      {!accounts.isError && data !== undefined && (
        <>
          <p className="text-muted-foreground text-sm">
            {data.unverifiedTotal === 0
              ? 'Every account has verified its address.'
              : `${String(data.unverifiedTotal)} account${data.unverifiedTotal === 1 ? '' : 's'} cannot complete verification-gated sign-in.`}
          </p>
          <DataTable
            caption="Unverified accounts, oldest first"
            columns={columns}
            query={{
              isPending: false,
              isError: false,
              data: data.unverified,
              refetch: () => accounts.refetch(),
            }}
            getRowKey={(row) => row.id}
            loadingLabel="Loading accounts…"
            empty={<></>}
          />
          {data.nextCursor !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCursor(data.nextCursor ?? undefined);
              }}
            >
              Show older
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}

/**
 * What staff have done.
 *
 * The console's own accountability, and the reason the epic is a security improvement rather than a
 * new hole: before it, every one of these operations happened over `psql` and left no record at all.
 */
function ActivityPanel(): React.ReactElement {
  const activity = useStaffActivity();

  const columns: Column<NonNullable<typeof activity.data>[number]>[] = [
    { header: 'When', cell: (row) => new Date(row.occurredAt).toLocaleString() },
    { header: 'Who', cell: (row) => row.actorLabel ?? '—', cellClassName: 'break-all' },
    {
      header: 'What',
      cell: (row) =>
        `${row.action.replace('staff.', '').replace(/_/g, ' ')}${row.subjectLabel === null ? '' : ` · ${row.subjectLabel}`}`,
    },
  ];

  return (
    <Panel
      title="Staff activity"
      status={
        activity.isPending
          ? ''
          : activity.isError
            ? 'Staff activity could not be read.'
            : `Staff activity: ${String(activity.data?.length ?? 0)} entries.`
      }
    >
      <DataTable
        caption="Staff actions, most recent first"
        columns={columns}
        query={activity}
        getRowKey={(row) => row.id}
        loadingLabel="Loading staff activity…"
        errorLabel="Could not read staff activity."
        empty={<p className="text-muted-foreground text-sm">Nothing recorded yet.</p>}
      />
    </Panel>
  );
}
