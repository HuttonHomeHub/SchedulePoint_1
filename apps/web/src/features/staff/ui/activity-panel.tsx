import { DataTable, type Column } from '@/components/ui/data-table';
import { QueryPanel } from '@/components/ui/page';
import { useStaffActivity, type StaffActivityRow } from '@/features/staff/api/staff-panels';
import {
  describeActivity,
  groupActivity,
  type ActivityGroup,
} from '@/features/staff/model/activity-rows';

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
      query={activity}
      // The table's own loading shape, which is what the panel showed before it had a primitive: a
      // `DataTable` handed a pending query draws its skeleton and announces `loadingLabel`.
      skeleton={<ActivityTable rows={undefined} />}
      errorLabel="Could not read staff activity."
      errorStatus="Staff activity could not be read."
      settledStatus={(rows) => `Staff activity: ${String(rows.length)} entries.`}
    >
      {(rows) => <ActivityTable rows={rows} />}
    </QueryPanel>
  );
}

/** `rows` is `undefined` for the loading shape, which is how `DataTable` is told it is pending. */
function ActivityTable({ rows }: { rows: StaffActivityRow[] | undefined }): React.ReactElement {
  // **Consecutive panel reads by one actor collapse into one row** (spec §8.15). Opening this
  // console writes one `staff.panel_read` per panel, so a page of fifty entries was seven page
  // loads and almost nothing else — the rows that matter sat between them. Nothing is hidden: the
  // count is printed and every panel is named. Client-side, because the API and the audit table are
  // right as they are; this is a presentation of the rows they returned.
  const groups = groupActivity(rows ?? []);

  const columns: Column<ActivityGroup>[] = [
    {
      header: 'When',
      cell: (row) => new Date(row.occurredAt).toLocaleString(),
      cellClassName: 'py-2 pr-4 md:w-52',
    },
    {
      header: 'Who',
      cell: (row) => row.actorLabel ?? '—',
      cellClassName: 'py-2 pr-4 break-all md:w-72',
    },
    { header: 'What', cell: (row) => describeActivity(row) },
  ];

  return (
    <DataTable
      caption="Staff actions, most recent first"
      columns={columns}
      query={{
        isPending: rows === undefined,
        isError: false,
        data: rows === undefined ? undefined : groups,
        refetch: () => undefined,
      }}
      getRowKey={(row) => row.id}
      loadingLabel="Loading staff activity…"
      empty="Nothing recorded yet."
    />
  );
}
