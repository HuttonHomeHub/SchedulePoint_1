import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CardTitle } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { Spinner } from '@/components/ui/spinner';
import { useStaffHealth, type RetentionTable } from '@/features/staff/api/staff-health';
import {
  lastRunSentence,
  oldestSentence,
  overdueSentence,
  scheduleSentence,
  tableLabel,
} from '@/features/staff/model/retention-copy';

const RETENTION_HEADING_ID = 'staff-retention-heading';
const RETENTION_DISABLED_ID = 'retention-disabled-note';
const RETENTION_FAILING_ID = 'retention-failing-note';
const AUDIT_RETENTION_ID = 'staff-audit-retention-note';

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
export function RetentionSection(): React.ReactElement {
  const health = useStaffHealth();
  const retention = health.data?.retention;
  // Read from the SAME response, because "the sweep is failing" and "anybody outside this screen
  // knows" are two different facts and the second one is unset on the deployed host today. The Mail
  // panel above already discloses this for its own failures; the UX review found that this one did
  // not, on the panel where the reader is most likely to assume somebody has been paged.
  const alertingConfigured = health.data?.alertingConfigured ?? false;

  const columns: Column<RetentionTable>[] = [
    { header: 'Table', cell: (row) => tableLabel(row.table), cellClassName: 'py-2 pr-4 md:w-56' },
    {
      header: 'Keeps for',
      cell: (row) => `${String(row.retentionDays)} days`,
      cellClassName: 'py-2 pr-4 md:w-28',
    },
    {
      header: 'Oldest row',
      cellClassName: 'py-2 pr-4 md:w-40',
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
    // **The `audit_events` note joins the list, and it is unconditional because the fact is.** It
    // is the one that says the most sensitive table in the system is deliberately NOT swept — the
    // "non-obvious consequence" class §4's rule keeps — and it sits AFTER the table, so a reader
    // who lands inside the region by landmark passes it in neither direction. The epic's own
    // record listed it as a wired target when it had never been one (M6 accessibility review).
    AUDIT_RETENTION_ID,
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
              {/* "Nothing is being deleted" came out: the `Status` summary at the top of the
                  page now says exactly that, in those words, and this is one of the two conditions
                  it names. What a summary row cannot carry is the remedy and the caveat, which is
                  what is left. The lead-in STAYS — a reader scrolled to this card is most of a
                  page from the summary and needs to know which condition the block is about. */}
              <strong className="font-medium">Retention sweeping is disabled.</strong> Set{' '}
              <code>RETENTION_SWEEP_ENABLED=true</code> to resume — the ages below are still real,
              and will keep growing until you do.
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
            empty="Nothing is swept on a schedule."
          />
          {/* The scope, stated in the product rather than only in DEPLOYMENT.md. "Every table is
              inside its period" is otherwise an invitation to conclude that everything is bounded,
              and the most sensitive table in the system is deliberately not. */}
          <p id={AUDIT_RETENTION_ID} className="text-muted-foreground text-sm">
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
