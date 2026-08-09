import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useStaffCspReports } from '@/features/staff/api/staff-csp-reports';
import { useStaffHealth } from '@/features/staff/api/staff-health';
import { useStaffIdentity } from '@/features/staff/api/staff-identity';

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
      </header>
      <MailHealthPanel />
      <SecurityPanel />
    </main>
  );
}

/**
 * Mail health — the one question this console was built to answer without a shell.
 *
 * Counts first, because "is it broken **now**" is a number rather than a list. The configuration
 * row is the part most easily left out and the part that matters most: zero failures with **no
 * transport configured** is not health, it means every send is being logged instead of delivered,
 * which looks identical in a count and is the state a stock deployment is in.
 */
function MailHealthPanel(): React.ReactElement {
  const health = useStaffHealth();

  if (health.isPending) {
    return (
      <Card>
        <div className="flex items-center gap-2 p-4" aria-busy="true">
          <Spinner label="Loading mail health…" />
        </div>
      </Card>
    );
  }

  if (health.isError) {
    return <Alert tone="error">Could not read mail health.</Alert>;
  }

  const data = health.data;

  return (
    <Card>
      <div className="space-y-4 p-4">
        <h2 className="text-lg font-medium">Mail</h2>

        {!data.transportConfigured && (
          <Alert tone="info">
            <strong className="font-medium">No mail transport is configured.</strong> Every message
            is being written to the log instead of sent — which produces no failures, and is why the
            counts below read as healthy.
          </Alert>
        )}

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Failures, last hour" value={String(data.failuresLastHour)} />
          <Stat label="Failures, last 24 hours" value={String(data.failuresLast24h)} />
          <Stat
            label="Last failure"
            value={
              data.lastFailureAt === null ? 'Never' : new Date(data.lastFailureAt).toLocaleString()
            }
          />
        </dl>

        <div className="flex flex-wrap gap-2">
          {/* The wording carries the state, never the colour alone (WCAG 1.4.1) — which is also
              why there is no `success` badge variant to reach for here. */}
          <Badge variant={data.alertingConfigured ? 'neutral' : 'warning'}>
            {data.alertingConfigured ? 'Failure alerting: on' : 'Failure alerting: off'}
          </Badge>
          <Badge variant={data.heartbeatConfigured ? 'neutral' : 'warning'}>
            {data.heartbeatConfigured ? 'Heartbeat: on' : 'Heartbeat: off'}
          </Badge>
        </div>

        {data.recentFailures.length === 0 ? (
          <p className="text-muted-foreground text-sm">No failures recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Recent mail failures, newest first</caption>
            <thead>
              <tr className="text-muted-foreground text-left">
                <th scope="col" className="py-1 font-medium">
                  When
                </th>
                <th scope="col" className="py-1 font-medium">
                  Message
                </th>
                <th scope="col" className="py-1 font-medium">
                  Recipient
                </th>
                <th scope="col" className="py-1 font-medium">
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {data.recentFailures.map((failure) => (
                <tr key={failure.id} className="border-border border-t">
                  <td className="py-1">{new Date(failure.occurredAt).toLocaleString()}</td>
                  <td className="py-1">{failure.kind.replace(/_/g, ' ')}</td>
                  <td className="py-1">{failure.recipient ?? '—'}</td>
                  <td className="py-1">{failure.errorClass ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * What the Content-Security-Policy is blocking.
 *
 * **An empty table is not proof the policy is clean, and the panel says so.** End-to-end delivery
 * from a real browser to this sink is unverified (`docs/TECH_DEBT.md` #102) — the Reporting API
 * uploads out-of-band, so no test in the repository can observe it — which means silence here reads
 * "nothing arrived", not "nothing happened". A panel that let a reader take an empty table as
 * evidence would be worse than no panel, because it would be evidence pointing the wrong way on the
 * one decision it exists to inform.
 */
function SecurityPanel(): React.ReactElement {
  const reports = useStaffCspReports();

  if (reports.isPending) {
    return (
      <Card>
        <div className="flex items-center gap-2 p-4" aria-busy="true">
          <Spinner label="Loading policy reports…" />
        </div>
      </Card>
    );
  }

  if (reports.isError) {
    return <Alert tone="error">Could not read policy reports.</Alert>;
  }

  return (
    <Card>
      <div className="space-y-4 p-4">
        <h2 className="text-lg font-medium">Content-Security-Policy</h2>

        {reports.data.length === 0 ? (
          <Alert tone="info">
            <strong className="font-medium">No violations recorded.</strong> That is not yet proof
            the policy is clean — delivery from a browser to this sink has never been verified
            end&nbsp;to&nbsp;end, so an empty table means nothing has arrived rather than nothing
            has happened.
          </Alert>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">
              Distinct policy violations, most recent activity first
            </caption>
            <thead>
              <tr className="text-muted-foreground text-left">
                <th scope="col" className="py-1 font-medium">
                  Directive
                </th>
                <th scope="col" className="py-1 font-medium">
                  Blocked
                </th>
                <th scope="col" className="py-1 font-medium">
                  Mode
                </th>
                <th scope="col" className="py-1 font-medium">
                  Seen
                </th>
                <th scope="col" className="py-1 font-medium">
                  Last
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.data.map((row) => (
                <tr key={row.id} className="border-border border-t align-top">
                  <td className="py-1">
                    {row.effectiveDirective}
                    {row.sourceFile !== null && (
                      // The source location names what to CHANGE, which the blocked URI often
                      // cannot: ADR-0074's report-only window found a violation whose cause was a
                      // dependency's own code, absent from this repository entirely.
                      <span className="text-muted-foreground block text-xs break-all">
                        {row.sourceFile}
                        {row.lineNumber !== null && `:${String(row.lineNumber)}`}
                      </span>
                    )}
                  </td>
                  <td className="py-1 break-all">{row.blockedUri}</td>
                  <td className="py-1">
                    {/* `—` rather than a guess: the legacy report body carries no disposition in
                        every engine, and inventing one would read a real block as hypothetical. */}
                    {row.disposition ?? '—'}
                  </td>
                  <td className="py-1 tabular-nums">{row.count}</td>
                  <td className="py-1">{new Date(row.lastSeenAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
