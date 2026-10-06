import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { StatGrid } from '@/components/ui/page';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { Spinner } from '@/components/ui/spinner';
import { useStaffHealth } from '@/features/staff/api/staff-health';

const MAIL_HEADING_ID = 'staff-mail-heading';
const MAIL_TRANSPORT_ID = 'staff-mail-transport-note';

/**
 * Mail health — the question this console was built to answer without a shell.
 *
 * The configuration row is the part most easily left out and the part that matters most: zero
 * failures with **no transport configured** is not health, it means every send is being logged
 * instead of delivered, which looks identical in a count.
 */
export function MailSection(): React.ReactElement {
  const health = useStaffHealth();
  const data = health.data;

  const columns: Column<NonNullable<typeof data>['recentFailures'][number]>[] = [
    /**
     * **Leading columns carry a width so the trailing one soaks the surplus.**
     *
     * Measured in Chromium: this page's four short tables want 371-660 px of content and are given
     * 1,438, and with `table-layout: auto` the surplus goes to whichever column holds the widest
     * content — which put an address at x=104 and its date at x=1,209, more than a thousand pixels
     * apart on one row. That is ADR-0098's recorded defect verbatim ("a plan's name and its change
     * time sat ~800 px apart at 1646"), where the remedy was a narrower measure.
     *
     * The measure cannot narrow here: FC-4 forbids any table on this page being narrower than the
     * 798 px it measures today, and softening a committed condition to fix a spacing complaint is
     * tuning the bar to the answer.
     *
     * **`w-full` on the TRAILING column was tried first and is withdrawn on measurement.** It does
     * take the surplus, and it squeezes every other column to `min-content` doing it: "Policy
     * violation reports" wrapped onto three lines, "Keeps for" onto two, and a recipient address
     * broke mid-word across four — the page grew from 11,066 px to 13,172. A width on the leading
     * columns is a preference rather than a claim on the remainder, so a column still grows past it
     * when its content needs to. `md:` because the widths only make sense where the surplus exists;
     * below it the table is byte-for-byte what it was.
     */
    {
      header: 'When',
      cell: (row) => new Date(row.occurredAt).toLocaleString(),
      cellClassName: 'py-2 pr-4 md:w-44',
    },
    {
      header: 'Message',
      cell: (row) => row.kind.replace(/_/g, ' '),
      cellClassName: 'py-2 pr-4 md:w-36',
    },
    {
      header: 'Recipient',
      cell: (row) => row.recipient ?? '—',
      // `break-all` alone REPLACED the default `py-2 pr-4`, so these cells had no padding at all
      // and no gap to the next column — a pre-existing defect the widths made visible.
      cellClassName: 'py-2 pr-4 break-all md:w-80',
    },
    /**
     * **The last column soaks the surplus, so the others cluster at the left.**
     *
     * Measured in Chromium: this page's four short tables want 371-660 px of content and are given
     * 1,438, and with `table-layout: auto` the surplus goes to whichever column holds the widest
     * content — which put an address at x=104 and its date at x=1,209, more than a thousand pixels
     * apart on one row. That is ADR-0098's recorded defect verbatim ("a plan's name and its change
     * time sat ~800 px apart at 1646"), where the remedy was a narrower measure.
     *
     * Here the measure cannot narrow: FC-4 forbids any table on this page being narrower than the
     * 798 px it measures today, because the epic's whole layout case was that span-by-demand
     * WIDENS the tables — and softening a committed condition to fix a spacing complaint is tuning
     * the bar to the answer. `w-full` on the trailing column takes the surplus instead, so every
     * other column falls back to its natural width and a row reads as one thing. The table's own
     * width is unchanged, so FC-4 is untouched rather than reinterpreted.
     */
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
            <Alert purpose="condition" tone="info" id={MAIL_TRANSPORT_ID}>
              <strong className="font-medium">No mail transport is configured.</strong> Every
              message is being written to the log instead of sent — which produces no failures, and
              is why the counts below read as healthy.
            </Alert>
          )}

          {/* **The two figures that can be a problem now look like it** (spec §8.15). Until this,
              a failure count and "API version 0.64.0" rendered identically, so on the page whose
              whole job is *is anything wrong* the two most alarming numbers on it carried no signal
              at all. Colour is the SECOND channel and never the only one (WCAG 1.4.1): each label
              says what it counts, and the `Status` summary above states the same condition in
              words. `Last failure` is deliberately NOT toned — a timestamp is a fact about when,
              and a date in red says "this is bad" about the one field that cannot be. */}
          <StatGrid
            columns={3}
            items={[
              {
                label: 'Failures, last hour',
                value: String(data.failuresLastHour),
                ...(data.failuresLastHour > 0 ? { tone: 'alarm' as const } : {}),
              },
              {
                label: 'Failures, last 24 hours',
                value: String(data.failuresLast24h),
                ...(data.failuresLast24h > 0 ? { tone: 'alarm' as const } : {}),
              },
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
            // **Wired, not merely placed above.** `DataTable` is a focusable `role="region"`, so a
            // screen-reader user navigating by landmark lands INSIDE it having skipped whatever sits
            // above — and this note is the one that explains why the counts read as healthy. The
            // M6 accessibility review found that the epic's own record listed it as an
            // `aria-describedby` target when it had never been one; the retention notes and the
            // policy caveat were wired, this and the `audit_events` note were not.
            {...(data.transportConfigured ? {} : { describedById: MAIL_TRANSPORT_ID })}
            columns={columns}
            query={{
              isPending: false,
              isError: false,
              data: data.recentFailures,
              refetch: () => health.refetch(),
            }}
            getRowKey={(row) => row.id}
            loadingLabel="Loading mail failures…"
            empty="No failures recorded."
          />
        </>
      )}
    </section>
  );
}
