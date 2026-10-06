import { DataTable, type Column } from '@/components/ui/data-table';
import { QueryPanel } from '@/components/ui/page';
import { Spinner } from '@/components/ui/spinner';
import { useStaffCspReports, type CspReportRow } from '@/features/staff/api/staff-csp-reports';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';
import { cspActionLabel } from '@/features/staff/model/enum-copy';
import { SECURITY } from '@/features/staff/model/panel-copy';
import { formatTimestamp } from '@/lib/format-date';

/**
 * What the browser reports it blocked on this site.
 *
 * **An empty table is not proof nothing was blocked, and the box says so.** Delivery from a real
 * browser to this sink is unverified end to end (`docs/TECH_DEBT.md` #117) — the Reporting API
 * uploads out-of-band, so nothing in the repository can observe it — which means silence here reads
 * "nothing arrived", not "nothing happened". A box that let a reader take an empty table as evidence
 * would point the wrong way on the one decision it exists to inform.
 *
 * **The caveat renders in the data state only.** It used to sit outside the table's own state
 * machine, so a failed read showed a sentence about "an empty table" above a "could not read"
 * message with no table in sight. `QueryPanel` renders panel-level prose only with an answer.
 */
const CAVEAT_ID = 'staff-csp-caveat';

const COLUMNS: Column<CspReportRow>[] = [
  {
    header: 'Rule',
    width: 'bounded',
    wrap: 'anywhere',
    cell: (row) => (
      <>
        {row.effectiveDirective}
        {row.sourceFile !== null && (
          // The source location names what to CHANGE, which the blocked address often cannot: a
          // violation can be caused by a dependency's own code.
          <span className="text-muted-foreground block text-xs wrap-anywhere">
            {row.sourceFile}
            {row.lineNumber !== null && `:${String(row.lineNumber)}`}
          </span>
        )}
      </>
    ),
  },
  { header: 'Blocked address', cell: (row) => row.blockedUri, width: 'auto', wrap: 'anywhere' },
  { header: 'Action', cell: (row) => cspActionLabel(row.disposition), width: 'fit' },
  {
    header: 'Times',
    cell: (row) => String(row.count),
    width: 'fit',
    cellClassName: 'py-2 pr-4 tabular-nums',
  },
  { header: 'Last seen', cell: (row) => formatTimestamp(row.lastSeenAt), width: 'fit' },
];

export function SecurityPanel(): React.ReactElement {
  const reports = useStaffCspReports();

  return (
    <QueryPanel
      title="Browser security reports"
      id={CHECK_SECTION_ID.security}
      description={SECURITY.intro}
      query={reports}
      skeleton={<Spinner label="Loading security reports…" />}
      errorLabel="Couldn't load security reports."
      errorStatus="Security reports couldn't be loaded."
      settledStatus={(rows) =>
        rows.length === 0
          ? 'Browser security reports: none received.'
          : `Browser security reports: ${String(rows.length)} ${rows.length === 1 ? 'kind' : 'kinds'} received.`
      }
    >
      {(rows) => (
        <>
          {/* Wired as the table's description, not merely placed above it: the table is a focusable
              region, so a screen-reader user navigating by landmark lands INSIDE it having skipped
              whatever sits above, and this caveat changes what an empty one means. */}
          <p id={CAVEAT_ID} className="text-muted-foreground text-sm">
            {SECURITY.caveat}
          </p>
          <DataTable
            caption={SECURITY.caption}
            columns={COLUMNS}
            query={{ isPending: false, isError: false, data: rows, refetch: () => undefined }}
            getRowKey={(row) => row.id}
            describedById={CAVEAT_ID}
            loadingLabel="Loading security reports…"
            empty={SECURITY.empty}
          />
        </>
      )}
    </QueryPanel>
  );
}
