import type { ActivitySummary, CalendarSummary, DependencySummary } from '@repo/types';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import { useDeleteDependency, usePredecessors, useSuccessors } from '../api/use-dependencies';

import { AddLinkSection } from './AddLinkSection';
import { DependencyTable } from './DependencyTable';
import { EditDependencyDialog } from './EditDependencyDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FieldGridContainer } from '@/components/ui/form-layout';

/**
 * The Logic surface for one activity — its predecessors (what must come before) and
 * successors (what it drives). Read for any member; Planners/Org Admins
 * (`canManageLogic`) also get add/edit/remove. Cycle, duplicate and self
 * rejections come back from the API and surface inline (the server owns the
 * acyclic guarantee).
 *
 * This is the panel **body**, extracted from `DependencyEditor` so the Logic dialog and the
 * activity editor's Logic tab render the same surface rather than two that drift. It owns its own
 * add/edit/remove dialogs, so it is self-sufficient wherever it is mounted.
 *
 * `activity` is optional so a host may keep the panel mounted while it has no subject, and
 * `enabled` lets a host that mounts it eagerly (a tab panel behind an inactive tab) hold the
 * queries back until it is actually showing.
 */
export function ActivityLogicPanel({
  orgSlug,
  planId,
  activity,
  planActivities,
  calendars = [],
  planCalendarId,
  canManageLogic = false,
  manageLogicReason,
  enabled = true,
  onAdded,
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
  /**
   * The route-composed calendar library, forwarded to the two lag fields so they can read their
   * working-hours factor (ADR-0070 §5). Absent leaves both in whole days — the degraded control,
   * which is the same one the flag-off path draws.
   */
  calendars?: CalendarSummary[];
  /** The plan's own calendar — what `PROJECT_DEFAULT` (and an inheriting endpoint) resolves to. */
  planCalendarId?: string;
  canManageLogic?: boolean;
  /**
   * Why this member cannot add or change links, when {@link canManageLogic} is false. Supplying it
   * **shows** the Add a link section shaded with the reason (the house shade-with-a-reason rule);
   * omitting it hides the section entirely, which is what a Viewer should see and what every host
   * does today. Only a host that can tell role from pen apart should pass one — a fused boolean
   * cannot, and an invented sentence is worse than none (ADR-0060 M6).
   */
  manageLogicReason?: string;
  /**
   * Whether this surface is currently showing. False keeps the panel mounted but idle — no
   * dependency queries are issued — for a host that mounts it before it is visible. Default true,
   * for a host that mounts on demand (the dialog, which renders its children only while open).
   */
  enabled?: boolean;
  /**
   * Called with the created edge after a successful add (ADR-0048 M2) — the mirror of
   * {@link onRemoved}, and the reason the undo stack is symmetric for links.
   */
  onAdded?: (dependency: DependencySummary) => void;
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
  const queriesEnabled = enabled && activity !== undefined;
  const predecessors = usePredecessors(orgSlug, activityId, queriesEnabled);
  const successors = useSuccessors(orgSlug, activityId, queriesEnabled);
  const deleteDependency = useDeleteDependency(orgSlug);
  const announce = useAnnounce();
  // A removed row unmounts, taking focus with it. This lands on the two dependency tables — NOT on
  // a wrapper around the whole panel, which is what it used to be (`docs/TECH_DEBT.md` #67): that
  // wrapper also held the add form, the cross-plan slot and the notes slot, so "you removed a link"
  // put the reader at the top of four unrelated sections.
  //
  // Deliberately **no host-override seam** of the kind `ActivityResourcesPanel` has. That prop
  // exists because `ActivityResourcesDialog` owns a Close button worth landing on; the Logic
  // dialog is a bare `Dialog` around this panel with no such control, so the seam would ship with
  // no registrant — the shape `docs/TECH_DEBT.md` #156 records. Add it with its first caller.
  const linksRef = useRef<HTMLDivElement>(null);

  // Toolbar **Add note** reveal (toolbar quick-wins U4/A4): when this panel opens via that entry point,
  // scroll its Notes section into view + move focus onto its heading, so the user lands ready to write a
  // note rather than on Predecessors. Runs after the dialog's own open-focus (effect timing), so it wins.
  // A plain open (`revealNotes` false) or an absent ref is inert — byte-identical.
  useEffect(() => {
    if (!enabled || !revealNotes) return;
    const heading = notesHeadingRef?.current;
    if (!heading) return;
    heading.scrollIntoView({ block: 'start' });
    heading.focus();
  }, [enabled, revealNotes, notesHeadingRef]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const others = activity
    ? (planActivities ?? []).filter((candidate) => candidate.id !== activity.id)
    : [];

  // What both tables need to read a lag on its own lag calendar (ADR-0070 M4) — grouped so the two
  // cannot be given different answers about the same link.
  const lagReadout = {
    calendars,
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
    planActivities: planActivities ?? [],
  };

  // Shown to anyone who may add links, and to a member the host can explain the refusal to.
  // Without a reason it stays hidden — a shaded form with no explanation is the dead end the
  // house rule forbids, and a Viewer should not see one at all.
  const showAddSection = canManageLogic || manageLogicReason !== undefined;

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
        // refetch (see ClientsTable). The region lives inside this panel.
        flushSync(() => {
          setRemovingId(null);
          setRemoveError(null);
        });
        announce('Dependency removed.');
        linksRef.current?.focus();
      },
      onError: (err) => setRemoveError(err.message),
    });
  };

  return (
    <>
      {/* Kept as a plain box after the focus target moved inward (`docs/TECH_DEBT.md` #67). It no
          longer takes focus, but removing it would make `FieldGridContainer` — and its `min-w-0` —
          the host's direct child, which is a layout change this fix has no business making. */}
      <div>
        <FieldGridContainer className="flex flex-col gap-6">
          {/* Advertise the lag-nudge chord (ADR-0052 M3) — a non-hover, in-context hint, since the
              canvas-scoped shortcuts sheet doesn't cover this panel. Rendered only when the nudge
              is wired, so the panel is byte-identical otherwise. */}
          {canManageLogic && onNudgeLag ? (
            <p className="text-muted-foreground text-xs">
              Tip: with a link’s Edit or Remove button focused, Shift + ← / → nudges that link’s lag
              by one day.
            </p>
          ) : null}
          <div ref={linksRef} tabIndex={-1} className="flex flex-col gap-6 outline-none">
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Predecessors</h3>
              <DependencyTable
                query={predecessors}
                endpoint="predecessor"
                caption="Predecessors"
                emptyLabel="No predecessors — nothing has to finish before this activity."
                {...lagReadout}
                {...editHandlers}
              />
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Successors</h3>
              <DependencyTable
                query={successors}
                endpoint="successor"
                caption="Successors"
                emptyLabel="No successors — this activity doesn’t drive anything yet."
                {...lagReadout}
                {...editHandlers}
              />
            </section>
          </div>
          {/* What exists, then the form that adds to it (ADR-0061 §2). The two "Add …" buttons
              that used to sit beside these headings opened a second dialog on top of this one. */}
          {showAddSection ? (
            <AddLinkSection
              orgSlug={orgSlug}
              planId={planId}
              options={others}
              calendars={calendars}
              {...(planCalendarId === undefined ? {} : { planCalendarId })}
              gate={{ writable: canManageLogic, reason: manageLogicReason ?? null }}
              {...(activity ? { anchor: activity } : {})}
              {...(onAdded ? { onAdded } : {})}
            />
          ) : null}
          {/* Cross-plan links (ADR-0045) — passed by the composition root only when
              VITE_PROGRAMME_SCHEDULING is on; absent (byte-identical) otherwise. */}
          {crossPlanSlot}
          {/* Notes (ADR-0046) — passed by the composition root only when VITE_NOTES is on; absent
              (byte-identical) otherwise. */}
          {notesSlot}
        </FieldGridContainer>
      </div>

      {canManageLogic ? (
        <>
          <EditDependencyDialog
            orgSlug={orgSlug}
            open={editing !== undefined}
            onClose={() => setEditingId(null)}
            calendars={calendars}
            {...(planCalendarId === undefined ? {} : { planCalendarId })}
            planActivities={planActivities ?? []}
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
