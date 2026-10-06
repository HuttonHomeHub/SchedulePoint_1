import { Alert } from '@/components/ui/alert';
import { DataTable, type Column } from '@/components/ui/data-table';
import { StatusSection } from '@/components/ui/page';
import { useStaffCspReports } from '@/features/staff/api/staff-csp-reports';
import { CHECK_SECTION_ID } from '@/features/staff/model/console-status';
import { formatTimestamp } from '@/lib/format-date';

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
const CSP_CAVEAT_ID = 'staff-csp-caveat';

export function SecurityPanel(): React.ReactElement {
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
    { header: 'Last', cell: (row) => formatTimestamp(row.lastSeenAt) },
  ];

  return (
    <StatusSection
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
      {/* **The caveat is about the TABLE, not about its being empty — so it renders either way.**
          It used to live in `empty=`, which had it exactly backwards in both directions. A reader
          looking at three violations was never told the list may be incomplete, which is the state
          where an under-count actually misleads; and a reader looking at none met the message
          inside TWO frames, because `DataTable` wraps a non-blank `empty` node in `EMPTY_FRAME` and
          an `Alert` brings its own border, tint and icon — with the frame's `text-center` fighting
          the alert's left-aligned icon row. Visible in a photograph and invisible to jsdom, which
          has no layout to be wrong about.

          `describedById` rather than mere placement: this region is focusable and carries
          `role="region"`, so a screen-reader user navigating by landmark lands INSIDE the table
          having skipped whatever sits above it (the ADR-0073 C2.5 finding). A safety caveat
          reachable only by reading serially is the wrong contract, and this is one. */}
      <Alert purpose="condition" tone="info" id={CSP_CAVEAT_ID}>
        <strong className="font-medium">An empty table is not proof the policy is clean.</strong>{' '}
        Delivery from a browser to this sink has never been verified end&nbsp;to&nbsp;end, so what
        is listed here is a floor rather than a census. To check it yourself, open the app and load
        a blocked resource, then look here.
      </Alert>
      <DataTable
        caption="Distinct policy violations, most recent activity first"
        columns={columns}
        query={reports}
        getRowKey={(row) => row.id}
        describedById={CSP_CAVEAT_ID}
        loadingLabel="Loading policy reports…"
        errorLabel="Could not read policy reports."
        empty="No violations recorded."
      />
    </StatusSection>
  );
}
