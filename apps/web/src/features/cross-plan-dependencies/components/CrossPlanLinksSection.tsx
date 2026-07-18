import type { ActivitySummary, CrossPlanDependencySummary } from '@repo/types';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import {
  useActivityCrossPlanLinks,
  useDeleteCrossPlanLink,
} from '../api/use-cross-plan-dependencies';
import { CROSS_PLAN_TYPE_LABELS, formatCrossPlanLag } from '../schemas/cross-plan-schemas';

import { AddCrossPlanLinkDialog } from './AddCrossPlanLinkDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';

/**
 * The **Cross-plan links** section of an activity's Logic panel (inter-project M2, ADR-0045) — the
 * LIVE inter-project edges incident to this activity: the upstream activities in OTHER plans that
 * gate it (it is the successor — the edge's home, CQ-2) and the downstream activities it gates (it
 * is the predecessor). Read for any member; Planners/Org Admins (`canManageLogic`) also get add /
 * remove. Same-plan / cycle / duplicate rejections come back from the API (the server owns the
 * plan-level DAG guarantee) and surface inline. Rendered only behind `VITE_PROGRAMME_SCHEDULING` by
 * its host, so nothing here changes an existing surface with the flag off.
 */
export function CrossPlanLinksSection({
  orgSlug,
  planId,
  activity,
  canManageLogic = false,
  enabled,
}: {
  orgSlug: string;
  /** The activity's own plan — the successor plan, excluded from the endpoint picker (N31). */
  planId: string;
  activity: ActivitySummary;
  canManageLogic?: boolean;
  /** Keep the query idle while the host dialog is closed (mirrors the dependency editor). */
  enabled: boolean;
}): React.ReactElement {
  const links = useActivityCrossPlanLinks(orgSlug, activity.id, enabled);
  const deleteLink = useDeleteCrossPlanLink(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);

  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const removing = removingId
    ? (links.data ?? []).find((link) => link.id === removingId)
    : undefined;

  // Relative to this activity: an incoming edge (this activity is the successor) is driven BY an
  // upstream activity; an outgoing edge (this is the predecessor) DRIVES a downstream activity.
  const otherEndpoint = (link: CrossPlanDependencySummary) =>
    link.successor.id === activity.id ? link.predecessor : link.successor;
  const isIncoming = (link: CrossPlanDependencySummary) => link.successor.id === activity.id;

  const columns: Column<CrossPlanDependencySummary>[] = [
    {
      header: 'Activity',
      cell: (link) => {
        const other = otherEndpoint(link);
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
    {
      // Direction in words (never colour alone, WCAG 1.4.1): "Driven by" = an upstream plan gates
      // this activity; "Drives" = this activity gates a downstream plan.
      header: 'Direction',
      cell: (link) => <Badge variant="neutral">{isIncoming(link) ? 'Driven by' : 'Drives'}</Badge>,
    },
    { header: 'Type', cell: (link) => CROSS_PLAN_TYPE_LABELS[link.type] },
    {
      header: 'Lag',
      cellClassName: 'whitespace-nowrap',
      cell: (link) => (
        <span className="text-muted-foreground tabular-nums">
          {formatCrossPlanLag(link.lagDays)}
        </span>
      ),
    },
  ];

  if (canManageLogic) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (link) => (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setRemoveError(null);
              setRemovingId(link.id);
            }}
            aria-label={`Remove cross-plan link to ${otherEndpoint(link).name}`}
          >
            Remove
          </Button>
        </div>
      ),
    });
  }

  const confirmRemove = (): void => {
    if (!removing) return;
    deleteLink.mutate(removing.id, {
      onSuccess: () => {
        // Close the confirm dialog synchronously before moving focus (mirrors the dependency editor):
        // while the native <dialog> is modal, focusing outside it is a no-op, and focus would fall to
        // <body> once the removed row unmounts on refetch.
        flushSync(() => {
          setRemovingId(null);
          setRemoveError(null);
        });
        announce('Cross-plan link removed.');
        regionRef.current?.focus();
      },
      onError: (err) => setRemoveError(err.message),
    });
  };

  return (
    <section ref={regionRef} tabIndex={-1} className="flex flex-col gap-2 outline-none">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-medium">Cross-plan links</h3>
        {canManageLogic ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add cross-plan link
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">
        Live links to activities in <span className="font-medium">other plans</span>. An upstream
        activity’s computed dates drive this one on a programme recalculate.
      </p>
      <DataTable
        caption="Cross-plan links"
        columns={columns}
        query={links}
        getRowKey={(link) => link.id}
        loadingLabel="Loading cross-plan links…"
        errorLabel="Couldn’t load cross-plan links. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
            No cross-plan links — this activity isn’t tied to any activity in another plan.
          </div>
        }
      />

      {canManageLogic ? (
        <>
          <AddCrossPlanLinkDialog
            orgSlug={orgSlug}
            currentPlanId={planId}
            open={adding}
            onClose={() => setAdding(false)}
            anchor={activity}
          />
          <ConfirmDialog
            open={removing !== undefined}
            onClose={() => {
              setRemovingId(null);
              setRemoveError(null);
            }}
            onConfirm={confirmRemove}
            title="Remove cross-plan link"
            description={
              removing ? `Remove the cross-plan link to ${otherEndpoint(removing).name}?` : ''
            }
            confirmLabel="Remove"
            pending={deleteLink.isPending}
            pendingLabel="Removing…"
            error={removeError}
          />
        </>
      ) : null}
    </section>
  );
}
