import { DataTable, DataTableSkeleton, type Column } from '@/components/ui/data-table';
import { QueryPanel } from '@/components/ui/page';
import { useStaffActivity, type StaffActivityRow } from '@/features/staff/api/staff-panels';
import {
  describeActivity,
  groupActivity,
  type ActivityGroup,
} from '@/features/staff/model/activity-rows';
import { ACTIVITY } from '@/features/staff/model/panel-copy';
import { formatTimestamp, SAMPLE_INSTANT } from '@/lib/format-date';

// Module-level so the loading skeleton and the settled table share ONE definition.
const COLUMNS: Column<ActivityGroup>[] = [
  {
    header: 'When',
    cell: (row) => formatTimestamp(row.occurredAt),
    width: 'fit',
    sample: formatTimestamp(SAMPLE_INSTANT),
  },
  { header: 'Who', cell: (row) => row.actorLabel ?? '—', width: 'bounded', wrap: 'anywhere' },
  { header: 'What', cell: (row) => describeActivity(row), width: 'auto' },
];

/**
 * What staff have done.
 *
 * The console's own accountability, and the reason the epic is a security improvement rather than a
 * new hole: before it, every one of these operations happened over `psql` and left no record at all.
 */
export function ActivityPanel(): React.ReactElement {
  const activity = useStaffActivity();

  return (
    <QueryPanel
      title="Staff activity"
      description={ACTIVITY.intro}
      query={activity}
      // The table's own loading shape; `QueryPanel` wraps it, so it speaks `loadingLabel` once.
      skeleton={<DataTableSkeleton columns={COLUMNS} />}
      loadingLabel="Loading staff activity…"
      errorLabel="Couldn't load staff activity."
      errorStatus="Staff activity couldn't be loaded."
      settledStatus={(rows) => `Staff activity: ${String(rows.length)} entries.`}
    >
      {(rows) => <ActivityTable rows={rows} />}
    </QueryPanel>
  );
}

function ActivityTable({ rows }: { rows: StaffActivityRow[] }): React.ReactElement {
  // **Consecutive panel reads by one actor collapse into one row** (spec §8.15). Opening this
  // console writes one `staff.panel_read` per panel, so a page of fifty entries was seven page
  // loads and almost nothing else — the rows that matter sat between them. Nothing is hidden: the
  // count is printed and every panel is named. Client-side, because the API and the audit table are
  // right as they are; this is a presentation of the rows they returned.
  const groups = groupActivity(rows);

  return (
    <DataTable
      caption={ACTIVITY.caption}
      columns={COLUMNS}
      query={{
        isPending: false,
        isError: false,
        data: groups,
        refetch: () => undefined,
      }}
      getRowKey={(row) => row.id}
      loadingLabel="Loading staff activity…"
      empty={ACTIVITY.empty}
    />
  );
}
