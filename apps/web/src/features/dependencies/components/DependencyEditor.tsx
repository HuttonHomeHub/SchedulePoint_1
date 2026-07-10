import type { ActivitySummary, DependencySummary } from '@repo/types';
import type { UseQueryResult } from '@tanstack/react-query';

import { usePredecessors, useSuccessors } from '../api/use-dependencies';
import { DEPENDENCY_TYPE_LABELS, formatLag } from '../schemas/dependency-schemas';

import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';

/** Pick the "other end" of a link relative to the activity the panel is about. */
type Endpoint = 'predecessor' | 'successor';

function DirectionTable({
  query,
  endpoint,
  caption,
  emptyLabel,
}: {
  query: UseQueryResult<DependencySummary[]>;
  endpoint: Endpoint;
  caption: string;
  emptyLabel: string;
}): React.ReactElement {
  const columns: Column<DependencySummary>[] = [
    {
      header: 'Activity',
      cell: (dep) => {
        const other = dep[endpoint];
        return (
          <span>
            {other.code ? (
              <span className="text-muted-foreground font-mono text-xs">{other.code} </span>
            ) : null}
            <span className="font-medium">{other.name}</span>
          </span>
        );
      },
    },
    { header: 'Type', cell: (dep) => DEPENDENCY_TYPE_LABELS[dep.type] },
    {
      header: 'Lag',
      cellClassName: 'whitespace-nowrap tabular-nums',
      cell: (dep) => <span className="text-muted-foreground">{formatLag(dep.lagDays)}</span>,
    },
  ];

  return (
    <DataTable
      caption={caption}
      columns={columns}
      query={query}
      getRowKey={(dep) => dep.id}
      loadingLabel={`Loading ${caption.toLowerCase()}…`}
      errorLabel={`Couldn’t load ${caption.toLowerCase()}. Please try again.`}
      empty={
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {emptyLabel}
        </div>
      }
    />
  );
}

/**
 * The Logic panel for one activity — its predecessors (what must come before) and
 * successors (what it drives), each a table of the other end · type · lag. Opened
 * from the activities table. Read-only in this slice; the add/edit/remove
 * affordances land next (gated on `dependency:*` write). `activity` is optional so
 * the dialog stays mounted (toggled by `open`), preserving native focus-restore.
 */
export function DependencyEditor({
  orgSlug,
  activity,
  open,
  onClose,
}: {
  orgSlug: string;
  activity?: ActivitySummary;
  open: boolean;
  onClose: () => void;
}): React.ReactElement {
  const activityId = activity?.id ?? '';
  const enabled = open && activity !== undefined;
  const predecessors = usePredecessors(orgSlug, activityId, enabled);
  const successors = useSuccessors(orgSlug, activityId, enabled);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={activity ? `Logic — ${activity.name}` : 'Logic'}
      description="The predecessors and successors that link this activity into the schedule."
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Predecessors</h3>
          <DirectionTable
            query={predecessors}
            endpoint="predecessor"
            caption="Predecessors"
            emptyLabel="No predecessors — nothing has to finish before this activity."
          />
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Successors</h3>
          <DirectionTable
            query={successors}
            endpoint="successor"
            caption="Successors"
            emptyLabel="No successors — this activity doesn’t drive anything yet."
          />
        </section>
      </div>
    </Dialog>
  );
}
