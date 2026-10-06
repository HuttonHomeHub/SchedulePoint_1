import { ConditionStrip } from '@/components/ui/condition-strip';
import { DataTable, type Column } from '@/components/ui/data-table';
import { QueryPanel, StatGrid } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import {
  useStaffHealth,
  type MailFailure,
  type StaffHealth,
} from '@/features/staff/api/staff-health';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';
import { mailKindLabel } from '@/features/staff/model/enum-copy';
import { MAIL } from '@/features/staff/model/panel-copy';
import { formatTimestamp } from '@/lib/format-date';
import { formatRelative } from '@/lib/relative-time';

const MAIL_NOTE_ID = 'staff-mail-note';

/**
 * Mail: is the email the app sends actually going out?
 *
 * **It shares a response with Clearing old records and not a box** (ADR-0178). Both read
 * `useStaffHealth`, so they are one request and one audited read however many observers there are
 * (TanStack dedupes on the key); what they used to share was a card, which drew a boundary the
 * subject does not have. Each now has its own loading and error state, and a failed read shows in
 * both with one **Try again** that refetches the one request.
 *
 * The configuration condition is the part most easily left out and the part that matters most: zero
 * failures with **no transport configured** is not health, it means every send is being logged
 * instead of delivered, which looks identical in a count. It is a condition strip, and the setting's
 * name is behind its **How to fix** and nowhere else.
 */
export function MailPanel(): React.ReactElement {
  const health = useStaffHealth();

  return (
    <QueryPanel
      title="Mail"
      id={CHECK_SECTION_ID.mail}
      description={MAIL.intro}
      query={health}
      skeleton={<Spinner label="Loading mail…" />}
      errorLabel="Couldn't load mail."
      errorStatus="Mail couldn't be loaded."
      settledStatus={MAIL.status}
    >
      {(data) => <MailBody health={data} />}
    </QueryPanel>
  );
}

function MailBody({ health }: { health: StaffHealth }): React.ReactElement {
  const now = new Date();
  const failures = MAIL.failures(health.failuresLast24h);

  const columns: Column<MailFailure>[] = [
    { header: 'When', cell: (row) => formatTimestamp(row.occurredAt), width: 'fit' },
    { header: 'Email', cell: (row) => mailKindLabel(row.kind), width: 'fit' },
    { header: 'Sent to', cell: (row) => row.recipient ?? '—', width: 'bounded', wrap: 'anywhere' },
    { header: 'Reason', cell: (row) => row.errorClass ?? '—', width: 'auto', wrap: 'anywhere' },
  ];

  return (
    <>
      {!health.transportConfigured ? (
        <ConditionStrip
          id={MAIL_NOTE_ID}
          verdict={MAIL.notSetUp.verdict}
          howToFix={
            <p>
              Ask whoever runs the server to set <code>MAIL_SMTP_URL</code> to your mail
              provider&rsquo;s address, then restart SchedulePoint.
            </p>
          }
        >
          {MAIL.notSetUp.sentence}
        </ConditionStrip>
      ) : health.failuresLast24h > 0 ? (
        <ConditionStrip tone="error" verdict={failures.verdict}>
          {failures.sentence}
        </ConditionStrip>
      ) : (
        <p className="text-muted-foreground text-sm">{MAIL.healthy}</p>
      )}

      {/* The two figures that can be a problem look like it, and colour is only the second channel
          (WCAG 1.4.1): each label says what it counts. "Last failure" is deliberately not toned: a
          timestamp is a fact about when, and a date in red says "this is bad" about the one field
          that cannot be. */}
      <StatGrid
        columns={3}
        items={[
          {
            label: 'Failed in the last hour',
            value: String(health.failuresLastHour),
            ...(health.failuresLastHour > 0 ? { tone: 'alarm' as const } : {}),
          },
          {
            label: 'Failed in the last 24 hours',
            value: String(health.failuresLast24h),
            ...(health.failuresLast24h > 0 ? { tone: 'alarm' as const } : {}),
          },
          {
            label: 'Last failure',
            value:
              health.lastFailureAt === null ? 'Never' : formatRelative(health.lastFailureAt, now),
          },
        ]}
      />

      {/* The three figures above already say "0, 0, Never" when nothing has failed, so an empty table
          saying it again was the same fact twice. */}
      {health.recentFailures.length === 0 ? null : (
        <DataTable
          caption={MAIL.caption}
          // The table is a focusable region, so a reader navigating by landmark lands INSIDE it having
          // skipped whatever sits above — and the not-set-up note is the one that explains why the
          // counts read as healthy.
          {...(health.transportConfigured ? {} : { describedById: MAIL_NOTE_ID })}
          columns={columns}
          query={{
            isPending: false,
            isError: false,
            data: health.recentFailures,
            refetch: () => undefined,
          }}
          getRowKey={(row) => row.id}
          loadingLabel="Loading failed emails…"
          empty={<></>}
        />
      )}
    </>
  );
}
