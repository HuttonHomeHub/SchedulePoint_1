import type { ActivitySummary, DependencySummary } from '@repo/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import { useDeleteDependency, usePredecessors, useSuccessors } from '../api/use-dependencies';
import {
  DEPENDENCY_TYPE_LABELS,
  LAG_CALENDAR_LABELS,
  formatLag,
} from '../schemas/dependency-schemas';

import { AddDependencyDialog, type LinkDirection } from './AddDependencyDialog';
import { EditDependencyDialog } from './EditDependencyDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Dialog } from '@/components/ui/dialog';

/** Pick the "other end" of a link relative to the activity the panel is about. */
type Endpoint = 'predecessor' | 'successor';

function DirectionTable({
  query,
  endpoint,
  caption,
  emptyLabel,
  onEdit,
  onRemove,
  onNudgeLag,
}: {
  query: UseQueryResult<DependencySummary[]>;
  endpoint: Endpoint;
  caption: string;
  emptyLabel: string;
  onEdit?: (dependency: DependencySummary) => void;
  onRemove?: (dependency: DependencySummary) => void;
  onNudgeLag?: (dependency: DependencySummary, delta: number) => void;
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
      cellClassName: 'whitespace-nowrap',
      cell: (dep) => (
        <span className="text-muted-foreground tabular-nums">
          {formatLag(dep.lagDays)}
          {dep.lagCalendar === 'TWENTY_FOUR_HOUR' ? (
            // Only surface the lag calendar for 24-hour (elapsed), the one source that changes the
            // computed dates today — an elapsed wait reads very differently from a working-day lag.
            // Predecessor/Successor compute identically to the project calendar until M5, so badging
            // them here would imply a difference that doesn't yet exist (ADR-0036 §6).
            <span className="ml-1.5">· {LAG_CALENDAR_LABELS[dep.lagCalendar]}</span>
          ) : null}
        </span>
      ),
    },
    {
      // The engine-owned driving flag (M3), in text so it isn't canvas-only: a driving link is
      // the binding tie that sets this activity's (or the successor's) start. The badge carries
      // the meaning in words, never colour alone (WCAG 1.3.1/1.4.1); empty when non-driving.
      header: 'Driving',
      cell: (dep) =>
        dep.isDriving ? (
          <Badge variant="neutral">Driving</Badge>
        ) : (
          <span className="text-muted-foreground" aria-hidden="true">
            —
          </span>
        ),
    },
  ];
  if (onEdit && onRemove) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (dep) => (
        // Keyboard lag nudge (ADR-0052 M3): with a row's Edit/Remove button focused,
        // Shift+←/→ nudges THIS link's lag ±1 day — the keyboard equivalent of the canvas
        // lag-anchor drag (WCAG 2.1.1). The canvas's parallel listbox lists *activities*, so this
        // Logic panel is the app's dependencies keyboard surface and the nudge lands here (it is
        // therefore not listed in the canvas-scoped TsldShortcutsHelp; the hint above the tables
        // advertises it). Wired only when the host passes `onNudgeLag` (the direct-manipulation
        // flag + write role) — absent, the row is byte-for-byte today's.
        <div
          className="flex justify-end gap-2"
          {...(onNudgeLag
            ? {
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (
                    !event.shiftKey ||
                    event.altKey ||
                    (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onNudgeLag(dep, event.key === 'ArrowRight' ? 1 : -1);
                },
              }
            : {})}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(dep)}
            aria-label={`Edit link to ${dep[endpoint].name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(dep)}
            aria-label={`Remove link to ${dep[endpoint].name}`}
          >
            Remove
          </Button>
        </div>
      ),
    });
  }

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
 * successors (what it drives). Read for any member; Planners/Org Admins
 * (`canManageLogic`) also get add/edit/remove. Cycle, duplicate and self
 * rejections come back from the API and surface inline (the server owns the
 * acyclic guarantee). `activity` is optional so the dialog stays mounted (toggled
 * by `open`), preserving native focus-restore.
 */
export function DependencyEditor({
  orgSlug,
  planId,
  activity,
  planActivities,
  canManageLogic = false,
  open,
  onClose,
  onRemoved,
  onNudgeLag,
  crossPlanSlot,
  notesSlot,
  notesHeadingRef,
  revealNotes = false,
}: {
  orgSlug: string;
  planId: string;
  activity?: ActivitySummary;
  /** The plan's activities, for the add picker (self is excluded here). */
  planActivities?: ActivitySummary[];
  canManageLogic?: boolean;
  open: boolean;
  onClose: () => void;
  /**
   * Called with the just-removed edge after a successful remove (ADR-0048 M2) — the composition root
   * passes the undo/redo recording seam here, keeping this feature free of a sideways feature import.
   * Absent (the default) leaves the panel byte-identical.
   */
  onRemoved?: (dependency: DependencySummary) => void;
  /**
   * Keyboard lag nudge (ADR-0052 M3): with a row's Edit/Remove button focused, `Shift+←/→` nudges
   * that link's lag ±1 day — the keyboard equivalent of the canvas lag-anchor drag, landed here
   * because this panel IS the app's per-dependency keyboard surface (the canvas listbox lists
   * activities). The composition root passes the coalesced tsld nudge handler, keeping this
   * feature free of a sideways feature import (the `onRemoved` precedent). Absent (the default —
   * flag off, or a read-only viewer) leaves the panel byte-identical.
   */
  onNudgeLag?: (dependency: DependencySummary, delta: number) => void;
  /**
   * An optional extra panel rendered below Successors — the composition root passes the
   * `VITE_PROGRAMME_SCHEDULING` cross-plan links section here (ADR-0045), keeping this feature free
   * of a sideways feature → feature import. Absent (the default) leaves the panel byte-identical.
   */
  crossPlanSlot?: React.ReactNode;
  /**
   * An optional extra panel rendered below the cross-plan slot — the composition root passes the
   * `VITE_NOTES` activity notes section here (ADR-0046), same slot pattern as `crossPlanSlot` so this
   * feature stays free of a sideways feature → feature import. Absent (the default) is byte-identical.
   */
  notesSlot?: React.ReactNode;
  /**
   * A ref to the {@link notesSlot}'s heading (the composition root wires the same ref into its
   * `ActivityNotesSection`), so that when the panel is opened via the toolbar **Add note** button
   * ({@link revealNotes}) it scrolls the Notes section into view + moves focus to it — parity with the
   * Comments reveal for plan notes (toolbar quick-wins U4/A4). Absent ⇒ byte-identical.
   */
  notesHeadingRef?: RefObject<HTMLHeadingElement | null>;
  /**
   * Reveal + focus the Notes section on open (see {@link notesHeadingRef}). Set by the composition root
   * only for the toolbar **Add note** entry point; a plain open (canvas "Open logic" / the table) leaves
   * it false, so the panel opens on Predecessors as before. Default false ⇒ byte-identical.
   */
  revealNotes?: boolean;
}): React.ReactElement {
  const activityId = activity?.id ?? '';
  const enabled = open && activity !== undefined;
  const predecessors = usePredecessors(orgSlug, activityId, enabled);
  const successors = useSuccessors(orgSlug, activityId, enabled);
  const deleteDependency = useDeleteDependency(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);

  // Toolbar **Add note** reveal (toolbar quick-wins U4/A4): when this panel opens via that entry point,
  // scroll its Notes section into view + move focus onto its heading, so the user lands ready to write a
  // note rather than on Predecessors. Runs after the dialog's own open-focus (effect timing), so it wins.
  // A plain open (`revealNotes` false) or an absent ref is inert — byte-identical.
  useEffect(() => {
    if (!open || !revealNotes) return;
    const heading = notesHeadingRef?.current;
    if (!heading) return;
    heading.scrollIntoView({ block: 'start' });
    heading.focus();
  }, [open, revealNotes, notesHeadingRef]);

  const [adding, setAdding] = useState<LinkDirection | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const others = activity
    ? (planActivities ?? []).filter((candidate) => candidate.id !== activity.id)
    : [];

  // Look the edit/remove targets up by id from the live query each render, so a
  // 409 retry (after a concurrent edit) carries the refreshed version, not a
  // stale snapshot (matches ActivitiesTable / ClientsTable).
  const links = [...(predecessors.data ?? []), ...(successors.data ?? [])];
  const byId = (id: string | null): DependencySummary | undefined =>
    id ? links.find((link) => link.id === id) : undefined;
  const editing = byId(editingId);
  const removing = byId(removingId);

  const editHandlers = canManageLogic
    ? {
        onEdit: (dep: DependencySummary) => setEditingId(dep.id),
        onRemove: (dep: DependencySummary) => {
          setRemoveError(null);
          setRemovingId(dep.id);
        },
        // The keyboard lag nudge rides the same writer gate as edit/remove (ADR-0052 M3).
        ...(onNudgeLag ? { onNudgeLag } : {}),
      }
    : {};

  const confirmRemove = (): void => {
    if (!removing) return;
    // Snapshot the pre-remove edge for the undo command (ADR-0048 M2) — captured before the mutation
    // so the inverse can re-create the link from its endpoints/type/lag.
    const snapshot = removing;
    deleteDependency.mutate(removing.id, {
      onSuccess: () => {
        onRemoved?.(snapshot);
        // Close the confirm dialog synchronously before moving focus: while the
        // native <dialog> is still modal, focusing an element outside it is a
        // no-op and focus would fall to <body> once the removed row unmounts on
        // refetch (see ClientsTable). The region lives inside the Logic dialog.
        flushSync(() => {
          setRemovingId(null);
          setRemoveError(null);
        });
        announce('Dependency removed.');
        regionRef.current?.focus();
      },
      onError: (err) => setRemoveError(err.message),
    });
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        size="lg"
        title={activity ? `Logic for ${activity.name}` : 'Logic'}
        description="The predecessors and successors that link this activity into the schedule."
      >
        <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-6 outline-none">
          {/* Advertise the lag-nudge chord (ADR-0052 M3) — a non-hover, in-context hint, since the
              canvas-scoped shortcuts sheet doesn't cover this panel. Rendered only when the nudge
              is wired, so the panel is byte-identical otherwise. */}
          {canManageLogic && onNudgeLag ? (
            <p className="text-muted-foreground text-xs">
              Tip: with a link’s Edit or Remove button focused, Shift + ← / → nudges that link’s lag
              by one day.
            </p>
          ) : null}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-medium">Predecessors</h3>
              {canManageLogic ? (
                <Button variant="outline" size="sm" onClick={() => setAdding('predecessor')}>
                  Add predecessor
                </Button>
              ) : null}
            </div>
            <DirectionTable
              query={predecessors}
              endpoint="predecessor"
              caption="Predecessors"
              emptyLabel="No predecessors — nothing has to finish before this activity."
              {...editHandlers}
            />
          </section>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-medium">Successors</h3>
              {canManageLogic ? (
                <Button variant="outline" size="sm" onClick={() => setAdding('successor')}>
                  Add successor
                </Button>
              ) : null}
            </div>
            <DirectionTable
              query={successors}
              endpoint="successor"
              caption="Successors"
              emptyLabel="No successors — this activity doesn’t drive anything yet."
              {...editHandlers}
            />
          </section>
          {/* Cross-plan links (ADR-0045) — passed by the composition root only when
              VITE_PROGRAMME_SCHEDULING is on; absent (byte-identical) otherwise. */}
          {crossPlanSlot}
          {/* Notes (ADR-0046) — passed by the composition root only when VITE_NOTES is on; absent
              (byte-identical) otherwise. */}
          {notesSlot}
        </div>
      </Dialog>

      {canManageLogic ? (
        <>
          <AddDependencyDialog
            orgSlug={orgSlug}
            planId={planId}
            direction={adding ?? 'predecessor'}
            options={others}
            open={adding !== null}
            onClose={() => setAdding(null)}
            {...(activity ? { anchor: activity } : {})}
          />
          <EditDependencyDialog
            orgSlug={orgSlug}
            open={editing !== undefined}
            onClose={() => setEditingId(null)}
            {...(editing ? { dependency: editing } : {})}
          />
          <ConfirmDialog
            open={removing !== undefined}
            onClose={() => {
              setRemovingId(null);
              setRemoveError(null);
            }}
            onConfirm={confirmRemove}
            title="Remove dependency"
            description={
              removing
                ? `Remove the link ${removing.predecessor.name} → ${removing.successor.name}?`
                : ''
            }
            confirmLabel="Remove"
            pending={deleteDependency.isPending}
            pendingLabel="Removing…"
            error={removeError}
          />
        </>
      ) : null}
    </>
  );
}
