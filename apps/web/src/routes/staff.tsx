import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Spinner } from '@/components/ui/spinner';
import { useStaffCspReports } from '@/features/staff/api/staff-csp-reports';
import { useStaffHealth, type RetentionTable } from '@/features/staff/api/staff-health';
import { useStaffIdentity } from '@/features/staff/api/staff-identity';
import {
  useStaffAccounts,
  useStaffActivity,
  useStaffInstallation,
} from '@/features/staff/api/staff-panels';
import {
  lastRunSentence,
  oldestSentence,
  overdueSentence,
  scheduleSentence,
  tableLabel,
} from '@/features/staff/model/retention-copy';
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
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="text-muted-foreground mt-2">
          There is nothing at this address.{' '}
          <a className="underline" href="/">
            Go to SchedulePoint
          </a>
          .
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Staff console</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Signed in as {identity.data.email}. This console operates the installation — it cannot
          reach any customer&rsquo;s clients, projects or plans.
        </p>
        {/* ADR-0086 D4 permits dual-hatting rather than refusing it — refusing would lock the only
            staff member out on day one — and the compensation it named was that the console says
            which hat is active. That was decided and never built; the UX review found it. */}
        {identity.data.dualHatted && (
          <Alert tone="info" className="mt-3">
            <strong className="font-medium">This account is also an organisation member.</strong>{' '}
            Staff-ness confers nothing inside any organisation, and nothing you do here is done as a
            member. Anything you reach in the app itself, you reach with your ordinary membership.
          </Alert>
        )}
      </header>
      <MailHealthPanel />
      <RetentionPanel />
      <SecurityPanel />
      <InstallationPanel />
      <AccountsPanel />
      <ActivityPanel />
    </main>
  );
}

/**
 * One shape for every panel: `Card` composed through its own `CardHeader`/`CardContent` parts
 * rather than a hand-rolled `p-4`, and one heading treatment.
 *
 * Written after the component review found this file was the **only** place in the codebase using
 * `Card` against its documented composition contract, five times, each reinventing the spacing
 * scale — and that two of the five panels rendered a failure as a bare un-carded `Alert` while the
 * other three boxed it, for no reason a reader could infer.
 *
 * `CardTitle` is deliberately not used: it renders an `h1` (`card.tsx:50`) and this page already
 * has one. The composition contract is what was worth reusing, not the heading element.
 */
function Panel({
  title,
  status,
  children,
}: {
  title: string;
  /**
   * What this panel says once its query settles, announced politely — WCAG 4.1.3.
   *
   * Empty while pending, and that is the whole mechanism: the region is mounted before the answer
   * exists, so filling it later is a change a screen reader speaks. Without it each panel's
   * `Spinner` (`role="status"`) simply unmounts and is replaced by silent content, leaving a
   * screen-reader user to re-explore the page to learn that panel N has finished — on the one
   * screen whose entire purpose is "is it broken *now*". The pattern is `AuditEventList`'s.
   */
  status: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium">{title}</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <p aria-live="polite" className="sr-only">
          {status}
        </p>
        {children}
      </CardContent>
    </Card>
  );
}

/** A metric. Local helper — the codebase has no promoted primitive for this shape (TECH_DEBT). */
function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Mail health — the question this console was built to answer without a shell.
 *
 * The configuration row is the part most easily left out and the part that matters most: zero
 * failures with **no transport configured** is not health, it means every send is being logged
 * instead of delivered, which looks identical in a count.
 */
function MailHealthPanel(): React.ReactElement {
  const health = useStaffHealth();
  const data = health.data;

  const columns: Column<NonNullable<typeof data>['recentFailures'][number]>[] = [
    { header: 'When', cell: (row) => new Date(row.occurredAt).toLocaleString() },
    { header: 'Message', cell: (row) => row.kind.replace(/_/g, ' ') },
    { header: 'Recipient', cell: (row) => row.recipient ?? '—', cellClassName: 'break-all' },
    { header: 'Error', cell: (row) => row.errorClass ?? '—' },
  ];

  return (
    <Panel
      title="Mail"
      status={
        health.isPending
          ? ''
          : health.isError
            ? 'Mail health could not be read.'
            : `Mail: ${String(data?.failuresLast24h ?? 0)} failures in the last 24 hours.`
      }
    >
      {health.isPending && <Spinner label="Loading mail health…" />}
      {health.isError && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            Could not read mail health.
          </p>
          <Button variant="outline" size="sm" onClick={() => void health.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data !== undefined && (
        <>
          {!data.transportConfigured && (
            <Alert tone="info">
              <strong className="font-medium">No mail transport is configured.</strong> Every
              message is being written to the log instead of sent — which produces no failures, and
              is why the counts below read as healthy.
            </Alert>
          )}

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Failures, last hour" value={String(data.failuresLastHour)} />
            <Stat label="Failures, last 24 hours" value={String(data.failuresLast24h)} />
            <Stat
              label="Last failure"
              value={
                data.lastFailureAt === null
                  ? 'Never'
                  : new Date(data.lastFailureAt).toLocaleString()
              }
            />
          </dl>

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
    </Panel>
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
function RetentionPanel(): React.ReactElement {
  const health = useStaffHealth();
  const retention = health.data?.retention;

  const columns: Column<RetentionTable>[] = [
    { header: 'Table', cell: (row) => tableLabel(row.table) },
    { header: 'Keeps for', cell: (row) => `${String(row.retentionDays)} days` },
    {
      header: 'Oldest row',
      cell: (row) => (
        <>
          <span className="tabular-nums">{oldestSentence(row)}</span>
          {row.overdue && (
            // The word, not the colour (WCAG 1.4.1). The badge repeats what the sentence below
            // already says in full, including the number the claim rests on — an operator who
            // cannot see that has to open a shell, which is what this console exists to avoid.
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

  const overdueCount = retention?.tables.filter((table) => table.overdue).length ?? 0;

  return (
    <Panel
      title="Retention"
      status={
        health.isPending
          ? ''
          : health.isError
            ? 'Retention state could not be read.'
            : retention === undefined
              ? ''
              : !retention.enabled
                ? 'Retention: sweeping is disabled.'
                : overdueCount === 0
                  ? 'Retention: every table is inside its period.'
                  : `Retention: ${String(overdueCount)} table${overdueCount === 1 ? ' is' : 's are'} overdue.`
      }
    >
      {health.isPending && <Spinner label="Loading retention…" />}
      {health.isError && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            Could not read retention state.
          </p>
          <Button variant="outline" size="sm" onClick={() => void health.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {retention !== undefined && (
        <>
          {!retention.enabled && (
            <Alert tone="info">
              <strong className="font-medium">Retention sweeping is disabled.</strong> Nothing is
              being deleted. Set <code>RETENTION_SWEEP_ENABLED=true</code> to resume — the ages
              below are still real, and will keep growing until you do.
            </Alert>
          )}
          {retention.consecutiveFailures > 0 && (
            <Alert tone="error">
              <strong className="font-medium">
                The last {String(retention.consecutiveFailures)} sweep
                {retention.consecutiveFailures === 1 ? '' : 's'} failed.
              </strong>{' '}
              The next run retries automatically; if the count keeps climbing, the API log carries
              the reason under <code>retention.sweep_failed</code>.
            </Alert>
          )}
          {/* Null while disabled — the alert above carries that state, with the action attached.
              Saying it in both places is the duplication ADR-0077 M8 removed. */}
          {scheduleSentence(retention) !== null && (
            <p className="text-muted-foreground text-sm">{scheduleSentence(retention)}</p>
          )}
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
            empty={<p className="text-muted-foreground text-sm">Nothing is swept on a schedule.</p>}
          />
        </>
      )}
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
          <Alert tone="info">
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
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            Could not read installation state.
          </p>
          <Button variant="outline" size="sm" onClick={() => void installation.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data !== undefined && (
        <>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="API version" value={data.apiVersion} />
            <Stat label="Environment" value={data.environment} />
            <Stat label="Mail host" value={data.mailHost ?? 'Not configured'} />
            <Stat label="Staff addresses" value={String(data.staffCount)} />
          </dl>
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
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            Could not read accounts.
          </p>
          <Button variant="outline" size="sm" onClick={() => void accounts.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {data !== undefined && (
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
