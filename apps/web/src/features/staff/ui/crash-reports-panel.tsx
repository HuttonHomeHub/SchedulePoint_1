import { ConditionStrip } from '@/components/ui/condition-strip';
import { DataTable, DataTableSkeleton, type Column } from '@/components/ui/data-table';
import { Disclosure } from '@/components/ui/disclosure';
import { QueryPanel, Skeleton } from '@/components/ui/page';
import {
  useStaffCrashReports,
  type CrashReportRow,
} from '@/features/staff/api/staff-crash-reports';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';
import { CRASHES } from '@/features/staff/model/panel-copy';
import { formatTimestamp, SAMPLE_INSTANT } from '@/lib/format-date';

const CAVEAT_ID = 'staff-crashes-caveat';
const CAP_ID = 'staff-crashes-cap';

const BROWSER_NAMES: Record<string, string> = {
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  other: 'Other browser',
};

/** "Chrome 131", or just the family when the server could not read a version. */
function browserLabel(row: Pick<CrashReportRow, 'browser' | 'browserMajor'>): string {
  const name = BROWSER_NAMES[row.browser] ?? row.browser;
  return row.browserMajor === null ? name : `${name} ${String(row.browserMajor)}`;
}

/**
 * The stacks, as text. Both are already cleaned on the server and are rendered as React text in a
 * `<pre>`, never as HTML. They wrap rather than scroll, so the region needs no focus stop of its
 * own at the 1024 px floor.
 */
function StackText({ heading, text }: { heading: string; text: string }): React.ReactElement {
  return (
    <div>
      <p className="text-foreground">{heading}</p>
      <pre className="font-mono text-xs wrap-anywhere whitespace-pre-wrap">{text}</pre>
    </div>
  );
}

const COLUMNS: Column<CrashReportRow>[] = [
  {
    header: 'What broke',
    width: 'bounded',
    wrap: 'anywhere',
    cell: (row) => (
      <>
        {row.errorName}
        {row.message !== '' && <span className="block">{row.message}</span>}
        <Disclosure label={CRASHES.stack(row.reference)} collapsed="hidden">
          {row.stack === null && row.componentStack === null ? (
            <p>{CRASHES.noStack}</p>
          ) : (
            <>
              {row.stack !== null && <StackText heading={CRASHES.stackHeading} text={row.stack} />}
              {row.componentStack !== null && (
                <StackText heading={CRASHES.componentStackHeading} text={row.componentStack} />
              )}
            </>
          )}
        </Disclosure>
      </>
    ),
  },
  {
    header: 'Screen',
    width: 'auto',
    wrap: 'anywhere',
    cell: (row) => (
      <>
        {row.routePattern ?? CRASHES.noScreen}
        <span className="text-muted-foreground block text-xs">
          {`Release ${row.webVersion}, ${browserLabel(row)}`}
        </span>
      </>
    ),
  },
  {
    header: 'Reference',
    width: 'fit',
    cell: (row) => row.reference,
    cellClassName: 'font-mono',
  },
  {
    header: 'Times',
    cell: (row) => String(row.count),
    width: 'fit',
    cellClassName: 'tabular-nums',
  },
  {
    header: 'Last seen',
    width: 'fit',
    sample: formatTimestamp(SAMPLE_INSTANT),
    cell: (row) => (
      <>
        {formatTimestamp(row.lastSeenAt)}
        <span className="text-muted-foreground block text-xs">
          {`First ${formatTimestamp(row.firstSeenAt)}`}
        </span>
      </>
    ),
  },
];

/**
 * Screens that crashed for someone who was signed in (browser crash reports, ADR-0211).
 *
 * **Two sentences keep a quiet list from being misread, and neither is optional.** The caveat is
 * always drawn with an answer: signed-out and share-link screens are not reported, so an empty list
 * says "nothing arrived", not "nothing happened". And when the table is full the panel says new kinds
 * of crash are no longer being recorded, because a full table is otherwise indistinguishable from a
 * steady one while the problems it can no longer see pile up.
 *
 * **It reads the same query the console's summary reads** (`useStaffCrashReports`, one key), so the
 * page makes one audited read for both.
 */
export function CrashReportsPanel(): React.ReactElement {
  const crashes = useStaffCrashReports();

  return (
    <QueryPanel
      title="Screen crashes"
      id={CHECK_SECTION_ID.crashes}
      description={CRASHES.intro}
      query={crashes}
      skeleton={
        <div className="space-y-4">
          <Skeleton className="h-5 w-3/4" />
          <DataTableSkeleton columns={COLUMNS} />
        </div>
      }
      loadingLabel="Loading screen crashes…"
      errorLabel="Couldn't load screen crashes."
      errorStatus="Screen crashes couldn't be loaded."
      settledStatus={(data) => CRASHES.status(data.rows.length, data.capReached)}
    >
      {(data) => (
        <>
          {data.capReached && (
            <ConditionStrip id={CAP_ID} tone="error" verdict={CRASHES.capReached.verdict}>
              {CRASHES.capReached.sentence(data.cap)}
            </ConditionStrip>
          )}
          {/* Wired as the table's description: the table is a focusable region, so a reader who
              lands inside it by landmark has skipped whatever sits above, and these sentences change
              what an empty or a full list means. */}
          <p id={CAVEAT_ID} className="text-muted-foreground text-sm">
            {CRASHES.caveat}
          </p>
          <DataTable
            caption={CRASHES.caption}
            columns={COLUMNS}
            query={{
              isPending: false,
              isError: false,
              data: data.rows,
              refetch: () => undefined,
            }}
            getRowKey={(row) => row.id}
            describedById={data.capReached ? `${CAP_ID} ${CAVEAT_ID}` : CAVEAT_ID}
            loadingLabel="Loading screen crashes…"
            empty={CRASHES.empty}
          />
          {data.total > data.rows.length && (
            <p className="text-muted-foreground text-sm">
              {CRASHES.showing(data.rows.length, data.total)}
            </p>
          )}
        </>
      )}
    </QueryPanel>
  );
}
