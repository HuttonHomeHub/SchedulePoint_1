import { Badge } from '@/components/ui/badge';
import { ConditionStrip } from '@/components/ui/condition-strip';
import { DataTable, type Column } from '@/components/ui/data-table';
import { QueryPanel } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import {
  useStaffHealth,
  type Retention,
  type RetentionTable,
} from '@/features/staff/api/staff-health';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';
import { RETENTION } from '@/features/staff/model/panel-copy';
import {
  lastRunSentence,
  oldestSentence,
  overdueSentence,
  scheduleSentence,
  statusSentence,
  tableLabel,
} from '@/features/staff/model/retention-copy';
import { formatRelative } from '@/lib/relative-time';

const RETENTION_NOTE_IDS = {
  off: 'staff-retention-off-note',
  failing: 'staff-retention-failing-note',
  stuck: 'staff-retention-stuck-note',
  footnote: 'staff-retention-footnote',
} as const;

/**
 * Clearing old records: is the automatic deletion being honoured? (ADR-0087)
 *
 * **The leading answer is derived from the data, not reported by the sweep.** A last-run timestamp
 * alone cannot tell "the sweep is working" from "the sweep never armed" — the inverted-signal
 * problem `HeartbeatService` exists to solve one layer out, and the reason the table leads with the
 * age of the oldest surviving row. That fact is true of the database whether or not any sweep code
 * has ever run, including on a replica that has this instant booted.
 *
 * **It shares a response with Mail, not a box** (ADR-0178): `useStaffHealth` already carries it, and
 * reading a staff panel is an audited act, so a second route would have written a second
 * `staff.panel_read` row on every page load. TanStack dedupes the call with the Mail panel.
 */
export function RetentionPanel(): React.ReactElement {
  const health = useStaffHealth();

  return (
    <QueryPanel
      title="Clearing old records"
      id={CHECK_SECTION_ID.retention}
      description={RETENTION.intro}
      query={health}
      skeleton={<Spinner label="Loading old-record clearing…" />}
      errorLabel="Couldn't load old-record clearing."
      errorStatus="Old-record clearing couldn't be loaded."
      settledStatus={(data) => statusSentence(data.retention)}
    >
      {(data) => <RetentionBody retention={data.retention} alerted={data.alertingConfigured} />}
    </QueryPanel>
  );
}

function RetentionBody({
  retention,
  alerted,
}: {
  retention: Retention;
  alerted: boolean;
}): React.ReactElement {
  const now = new Date();
  // Bound once: called twice it did the same work twice and could have straddled a boundary between
  // the two calls.
  const schedule = scheduleSentence(retention, now.getTime());
  const failing = retention.enabled && retention.consecutiveFailures > 0;
  // Only one condition strip is drawn at a time, so a note is a description target only when ITS
  // strip is the one on screen: an id that resolves to nothing describes the table as nothing.
  const stuck = retention.enabled && !failing && schedule?.overdue === true;

  const columns: Column<RetentionTable>[] = [
    { header: 'Record', cell: (row) => tableLabel(row.table), width: 'fit' },
    { header: 'Kept for', cell: (row) => `${String(row.retentionDays)} days`, width: 'fit' },
    {
      header: 'Oldest still held',
      width: 'fit',
      cell: (row) => (
        <>
          <span className="tabular-nums">{oldestSentence(row)}</span>
          {row.overdue && (
            // The word, not the colour (WCAG 1.4.1). The badge says "Overdue"; the line under it
            // carries only the number the claim rests on.
            <>
              {' '}
              <Badge variant="warning">Overdue</Badge>
              <span className="text-warning-text block text-xs">{overdueSentence(row)}</span>
            </>
          )}
        </>
      ),
    },
    { header: 'Last run', cell: (row) => lastRunSentence(row), width: 'auto' },
  ];

  // Every note that changes how the ages and the Overdue flags should be read is a description
  // target: the table is a focusable region and a reader navigating by landmark lands INSIDE it.
  const notes = [
    retention.enabled ? undefined : RETENTION_NOTE_IDS.off,
    failing ? RETENTION_NOTE_IDS.failing : undefined,
    stuck ? RETENTION_NOTE_IDS.stuck : undefined,
    RETENTION_NOTE_IDS.footnote,
  ].filter((id) => id !== undefined);

  const failure = RETENTION.failing(
    retention.consecutiveFailures,
    retention.intervalMinutes,
    alerted,
  );

  return (
    <>
      {!retention.enabled ? (
        <ConditionStrip
          id={RETENTION_NOTE_IDS.off}
          verdict={RETENTION.off.verdict}
          howToFix={
            <p>
              Set <code>RETENTION_SWEEP_ENABLED=true</code> on the server and restart SchedulePoint.
            </p>
          }
        >
          {RETENTION.off.sentence}
        </ConditionStrip>
      ) : failing ? (
        <ConditionStrip
          id={RETENTION_NOTE_IDS.failing}
          tone="error"
          verdict={failure.verdict}
          howToFix={
            <p>
              The server log explains why: search it for <code>retention.sweep_failed</code>.
            </p>
          }
        >
          {failure.sentence}
        </ConditionStrip>
      ) : stuck ? (
        // A whole interval past boot with no sweep is not the routine "just started" case: the boot
        // run is unawaited and finishes in milliseconds on an idle table, so this almost certainly
        // means it is stuck. `error` with a condition strip is intended: it is serious, and it was
        // already true when the reader arrived, so it must not interrupt them (ADR-0132).
        <ConditionStrip
          id={RETENTION_NOTE_IDS.stuck}
          tone="error"
          verdict={RETENTION.stuck.verdict}
        >
          {RETENTION.stuck.sentence}
        </ConditionStrip>
      ) : retention.lastRunAt !== null ? (
        <p className="text-muted-foreground text-sm">
          Working. Last ran {formatRelative(retention.lastRunAt, now)}; runs every{' '}
          {retention.intervalMinutes === 60
            ? 'hour'
            : `${String(retention.intervalMinutes)} minutes`}
          .
        </p>
      ) : schedule === null ? null : (
        <p className="text-muted-foreground text-sm">{schedule.text}</p>
      )}

      <DataTable
        caption={RETENTION.caption}
        columns={columns}
        query={{
          isPending: false,
          isError: false,
          data: retention.tables,
          refetch: () => undefined,
        }}
        getRowKey={(row) => row.table}
        loadingLabel="Loading old-record clearing…"
        describedById={notes.join(' ')}
        empty="Nothing is cleared on a schedule."
      />
      {/* The scope, stated in the product rather than only in the deployment guide: "every record is
          inside its period" is otherwise an invitation to conclude that everything is bounded, and
          the most sensitive table in the system is deliberately not. */}
      <p id={RETENTION_NOTE_IDS.footnote} className="text-muted-foreground text-sm">
        {RETENTION.footnote}
      </p>
    </>
  );
}
