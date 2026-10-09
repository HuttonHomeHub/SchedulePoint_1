import type { ActivitySummary, BaselineVarianceRow, CalendarSummary } from '@repo/types';
import { MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

import {
  useActivities,
  useDeleteActivity,
  useDissolveSummary,
  type DissolveSummaryResponse,
} from '../api/use-activities';
import {
  createActivitiesTableStore,
  type ActivitiesTableStore,
} from '../lib/activities-table-store';
import type { ActivityEditorGating } from '../lib/activity-editor-gating';
import type { ActivityEditorPurpose } from '../lib/activity-editor-intent';
import { deleteActivityDescription, dissolveSummaryDescription } from '../lib/delete-activity-copy';
import { formatDurationCell } from '../model/duration-field';
import {
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  isMilestoneType,
} from '../schemas/activity-schemas';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Menu, MenuItem } from '@/components/ui/menu';
import {
  ACTIVITY_CALENDAR_ENABLED,
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED,
  ACTIVITY_COPY_PASTE_ENABLED,
  ADVANCED_ACTIVITY_TYPES_ENABLED,
  ADVANCED_CONSTRAINTS_ENABLED,
  INTER_PROJECT_DATES_ENABLED,
  NOTES_ENABLED,
  RESOURCES_ENABLED,
  WBS_IMPROVEMENTS_ENABLED,
} from '@/config/env';
import { NoteCountBadge } from '@/features/notes';
import {
  MAKE_MILESTONE_LABEL,
  deriveMakeMilestoneGate,
} from '@/features/plan-actions/make-milestone-gate';
import { ActivityResourcesDialog, type OnAssignmentEdited } from '@/features/resources';
import { WbsBulkAssignBar, type OnReparented } from '@/features/wbs';
import { formatConstraint } from '@/lib/constraint-format';
import { activitySchedulingHoursPerDay, effectiveHoursPerDay } from '@/lib/effective-hours-per-day';
import { formatCalendarDate } from '@/lib/format-date';
import {
  criticality,
  formatDayVariance,
  formatRemainingFloat,
  type FinishVariance,
  type VarianceField,
} from '@/lib/schedule-format';

/** Tone → text colour for a finish-variance cell. Text carries the meaning; colour reinforces. */
const VARIANCE_TONE_CLASS: Record<FinishVariance['tone'], string> = {
  behind: 'text-destructive-text',
  ahead: 'text-foreground',
  onTrack: 'text-muted-foreground',
  neutral: 'text-muted-foreground',
};

/**
 * "5 d" for a task; an em dash for a milestone (which has no duration) and for a WBS summary (whose
 * stored duration is not its rolled-up span — `docs/TECH_DEBT.md` #375). The rule lives in
 * `formatDurationCell`, shared with the Gantt's Duration column.
 *
 * With the activity's working-hours factor in hand a sub-day duration reads exactly ("4h", "2d 4h")
 * instead of rounding to "0 d" — which looked identical to a milestone (ADR-0070 M4).
 */
function formatDuration(activity: ActivitySummary, hoursPerDay: number | undefined): string {
  return formatDurationCell(activity, hoursPerDay);
}

/** Status label, plus the percentage while an activity is partway through. */
function formatProgress(activity: ActivitySummary): string {
  const label = ACTIVITY_STATUS_LABELS[activity.status];
  return activity.status === 'IN_PROGRESS' ? `${label} · ${activity.percentComplete}%` : label;
}

/**
 * A read-only computed-date column. Renders the calendar day (em dash when the
 * plan hasn't been calculated) and hides below the given breakpoint to keep the
 * table legible on narrow screens.
 */
function scheduleColumn(
  header: string,
  get: (activity: ActivitySummary) => string | null,
  hideBelow: 'md' | 'lg',
): Column<ActivitySummary> {
  const show = hideBelow === 'md' ? 'md:table-cell' : 'lg:table-cell';
  return {
    header,
    headClassName: `hidden py-2 pr-4 font-medium ${show}`,
    cellClassName: `hidden py-2 pr-4 whitespace-nowrap tabular-nums text-muted-foreground ${show}`,
    cell: (activity) => formatCalendarDate(get(activity)),
  };
}

/**
 * The bulk-assign column's select-all box. Its own component only because `indeterminate` is a DOM
 * property with no HTML attribute, so it has to be written to the node after render — "some but not
 * all" is a genuinely different state from "none", and rendering it as unchecked would tell a
 * screen-reader user their selection had been dropped.
 */
function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (checked: boolean) => void;
}): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    // **The `<label>` is the hit target, not decoration** (`docs/TECH_DEBT.md` #72). A bare
    // `size-4` input is a **16 px** pointer target, below WCAG 2.2 §2.5.8's 24 px AA floor, and it
    // sat outside every instrument that could say so: the target-size sweep is scoped to the
    // command surfaces, and axe's `target-size` rule is `wcag22aa` (not requested) *and* ships
    // `enabled: false`. The box stays 16 px — this widens what a pointer may hit, not what a reader
    // sees. `ActivityMembersPanel` has always done it this way; these two never did.
    <label
      data-coarse-exempt="row-select"
      className="flex size-6 cursor-pointer items-center justify-center"
    >
      <input
        ref={ref}
        type="checkbox"
        className="accent-primary size-4 align-middle"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label="Select all activities"
      />
    </label>
  );
}

/**
 * A stable default for `calendars`. A `= []` in the parameter list is a **new array on every
 * render**, which would make every memo below that lists `calendars` recompute every render — the
 * exact churn M2 removes (`docs/TECH_DEBT.md` #334).
 */
const NO_CALENDARS: CalendarSummary[] = [];

/** One entry in a row's overflow menu. */
type RowAction = {
  key: string;
  label: string;
  destructive?: boolean;
  onSelect: () => void;
  /**
   * Present but shut, with why (ADR-0082 §3). Absent ⇒ actionable.
   *
   * Only for a reason the reader can DO something about — the pen, a role. An action that does
   * not apply to this row (Dissolve off a non-summary), or whose flag is off, is still **omitted**:
   * shading those would imply a capability that does not exist, and the flag-off parity suites
   * depend on absence.
   */
  disabledReason?: string;
};

/**
 * A row's select box, subscribed to **its own row's slice** of the selection.
 *
 * The snapshot is a boolean, so `useSyncExternalStore` re-renders this leaf only when THIS row's
 * answer flips — the other 1,999 boxes and their rows stay put (`docs/TECH_DEBT.md` #334, M2).
 * 24 px of hit area around a 16 px box — see `SelectAllCheckbox` for why.
 */
function RowSelectCheckbox({
  store,
  id,
  name,
}: {
  store: ActivitiesTableStore;
  id: string;
  name: string;
}): React.ReactElement {
  const checked = useSyncExternalStore(store.subscribe, () => store.getState().selectedIds.has(id));
  return (
    <label
      data-coarse-exempt="row-select"
      className="flex size-6 cursor-pointer items-center justify-center"
    >
      <input
        type="checkbox"
        className="accent-primary size-4 align-middle"
        checked={checked}
        onChange={() => store.toggleRow(id)}
        aria-label={`Select ${name}`}
      />
    </label>
  );
}

/**
 * The header's select-all, subscribed to the **count** of live selected rows rather than to the set,
 * so it re-renders when the tri-state can change and the header — which is outside the memoised
 * rows — costs nothing otherwise. `selectableIds` arrives as a prop and changes only with the list.
 */
function SelectAllControl({
  store,
  selectableIds,
}: {
  store: ActivitiesTableStore;
  selectableIds: ReadonlySet<string>;
}): React.ReactElement {
  const liveCount = useSyncExternalStore(store.subscribe, () => {
    let count = 0;
    for (const id of store.getState().selectedIds) if (selectableIds.has(id)) count += 1;
    return count;
  });
  const allSelected = selectableIds.size > 0 && liveCount === selectableIds.size;
  return (
    <SelectAllCheckbox
      checked={allSelected}
      indeterminate={liveCount > 0 && !allSelected}
      onChange={(checked) => {
        store.setSelectedIds(checked ? new Set(selectableIds) : new Set());
      }}
    />
  );
}

/** A row's "⋯" trigger; re-renders only when THIS row's menu opens or closes. */
function RowActionsButton({
  store,
  activity,
  menuTriggerRef,
}: {
  store: ActivitiesTableStore;
  activity: ActivitySummary;
  menuTriggerRef: React.RefObject<HTMLElement | null>;
}): React.ReactElement {
  const openHere = useSyncExternalStore(
    store.subscribe,
    () => store.getState().menu?.activity.id === activity.id,
  );
  return (
    <Button
      variant="ghost"
      size="icon-row"
      aria-label={`Actions for ${activity.name}`}
      aria-haspopup="menu"
      aria-expanded={openHere}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        menuTriggerRef.current = event.currentTarget;
        store.setMenu({ activity, anchor: { x: rect.left, y: rect.bottom } });
      }}
    >
      <MoreHorizontal aria-hidden="true" className="size-4" />
    </Button>
  );
}

/**
 * A plan's activities as a table (code, name, type, duration, progress).
 * Edit/Delete render only for writers; delete is a soft delete confirmed first.
 * The edit target is looked up by id from the live query so a 409 retry carries
 * the current version. States come from the shared DataTable.
 */
export function ActivitiesTable({
  orgSlug,
  planId,
  canEditSchedule,
  canReportProgress = false,
  canWriteNotes = false,
  editorGating,
  onOpenEditor,
  onOpenLogic,
  onDuplicate,
  onMakeMilestone,
  onDeleted,
  onDissolved,
  onReparented,
  onAssignmentEdited,
  onOpenResources,
  varianceByActivityId,
  noteCountByActivityId,
  calendars = NO_CALENDARS,
  planCalendarId,
  calendarsLoading = false,
}: {
  orgSlug: string;
  planId: string;
  /** May create/edit/delete the definition (Planner/Org Admin). */
  canEditSchedule: boolean;
  /** May report progress (Contributor upward). Planners also have it. */
  canReportProgress?: boolean;
  /** Whether the viewer may write notes (Contributor upward) — gates the `Notes` row action. Role
   * only, never pen-gated (ADR-0046). Default false. */
  canWriteNotes?: boolean;
  /**
   * The tabbed editor's per-scope gate (ADR-0060 §6), derived once by the plan workspace and passed
   * down. Required in practice, since the editor is the only edit surface; optional in the type so the
   * flag-off path — and every existing test that mounts this table — is untouched. It cannot be
   * rebuilt from `canEditSchedule`, which has already fused the role and the pen into one boolean and so
   * cannot say WHICH of the two is missing.
   */
  editorGating?: ActivityEditorGating;
  /**
   * Open the tabbed editor on the tab a row action belongs to (ADR-0060 §7).
   *
   * **Required, and that is the point.** This table used to hold its own editor state and mount its
   * own `ActivityEditorDialog` beside the workspace's — two mounts, two sets of scope forms and two
   * dirty states for one activity. After Graphite M6-T2 it was also two different chromes: a drawer
   * from the canvas and a modal from here. Making the seam required means a host cannot mount this
   * table and silently leave three row actions doing nothing; the compiler asks.
   */
  onOpenEditor: (activity: ActivitySummary, purpose: ActivityEditorPurpose) => void;
  /** Open the logic (predecessors/successors) panel for a row. Available to any
   * member (read); the host owns the panel so this feature stays dependency-free. */
  onOpenLogic?: (activity: ActivitySummary) => void;
  /**
   * Duplicate a row (`docs/specs/activity-copy-paste/` M1). Host-owned like {@link onOpenLogic}, so
   * a host that has not wired it simply does not offer the action — the item cannot appear lit and
   * do nothing, which is the ADR-0064 §7 dead-end shape.
   */
  onDuplicate?: (activity: ActivitySummary) => void;
  /**
   * Open the Make milestone dialog for a zero-duration task (ADR-0162 decision 4). Host-owned like
   * {@link onDuplicate}: the dialog is the workspace's, mounted once, so the table and the canvas
   * convert through one path. Absent ⇒ the action is not offered.
   */
  onMakeMilestone?: (activity: ActivitySummary) => void;
  /**
   * Tell the host a row was deleted, so it can put the delete on the undo stack
   * (`docs/TECH_DEBT.md` #230). Host-owned like {@link onOpenLogic}: the history is workspace
   * state and this feature must not learn about it.
   *
   * **Until this existed, the same act was undoable from the canvas and silently not from here.**
   * `ActivityCrudDialogs` has called the seam since ADR-0048 M2; this table mutated, announced and
   * told the history nothing — so a planner who deleted a phase from the panel got no undo, and no
   * word to say why not. Optional, so the table's own suites (which mount it with no host) keep
   * today's behaviour.
   *
   * The batch id is the delete's own, which is what the restore is keyed on.
   */
  onDeleted?: (activity: ActivitySummary, deleteBatchId: string) => void;
  /**
   * Tell the host a summary was dissolved, with the summary as it was and what the server answered
   * (the promoted children and the batch it went in). Same reason as {@link onDeleted}: both surfaces
   * report to the ONE history the workspace owns, which records the dissolve as one undo step
   * (undo-redo M6) rather than truncating it as it did before.
   */
  onDissolved?: (summary: ActivitySummary, result: DissolveSummaryResponse) => void;
  /**
   * Tell the host a bulk assign filed rows under a summary (undo-redo M3), for the same reason as
   * {@link onDeleted}: the bar's write is one batch and the host's history records it as one step.
   */
  onReparented?: OnReparented;
  /**
   * Tell the host about an assignment write made in this table's own resources dialog (undo-redo M3).
   * Only reached when the host does not own the resources surface — see {@link onOpenResources}.
   */
  onAssignmentEdited?: OnAssignmentEdited;
  /**
   * Open the resource-assignment surface for a row. Like {@link onOpenLogic} the host owns it, so
   * both row actions resolve to the **same** editor the canvas opens rather than to a second one
   * mounted here. Absent (or with the convergence flag off) the table falls back to its own
   * `ActivityResourcesDialog`, which is today's behaviour.
   */
  onOpenResources?: (activity: ActivitySummary) => void;
  /**
   * Per-activity variance vs the plan's active baseline, keyed by activity id. When
   * present (the plan has an active baseline), a "Baseline finish" column is shown. The
   * route composes this from the baselines feature, so activities stays dependency-free
   * (a shared `@repo/types` shape, no cross-feature import).
   */
  varianceByActivityId?: ReadonlyMap<string, BaselineVarianceRow>;
  /**
   * Per-activity note counts (ADR-0046), route-composed like `varianceByActivityId` from ONE batch
   * query (never per-row). When present (the plan's counts loaded behind `VITE_NOTES`), a row with
   * ≥1 note shows a small count badge beside its name. A shared `@repo/types` shape, so activities
   * stays dependency-free of the notes feature's data layer.
   */
  noteCountByActivityId?: ReadonlyMap<string, number>;
  /**
   * The org's calendars (ADR-0037), route-composed like `varianceByActivityId` — used to name an
   * activity's own calendar in the "Calendar" column (shown only when `ACTIVITY_CALENDAR_ENABLED`)
   * and threaded into the edit dialog's picker. A shared `@repo/types` shape, so activities stays
   * dependency-free of the calendars feature.
   */
  calendars?: CalendarSummary[];
  /** The calendars list is still loading (an assigned calendar reads "Loading…", not "inherit"). */
  calendarsLoading?: boolean;
  /** The calendars list failed to load — forwarded to the edit dialog's picker to surface it. */
  /**
   * The plan's own calendar id — what an activity's empty `calendarId` ("inherit") resolves to.
   * Route-composed like {@link calendars}; forwarded to the editors so the duration field can read
   * its working-hours factor (ADR-0070). Absent leaves that field in whole working days.
   */
  planCalendarId?: string;
}): React.ReactElement {
  const activities = useActivities(orgSlug, planId);
  const deleteActivity = useDeleteActivity(orgSlug, planId);
  const dissolveSummary = useDissolveSummary(orgSlug, planId);
  const calendarNameById = useMemo(
    () => new Map(calendars.map((c) => [c.id, c.name])),
    [calendars],
  );
  // Parent WBS-summary lookup for the read-only WBS column (entry-route gap #7, only when
  // `ADVANCED_ACTIVITY_TYPES_ENABLED`): resolve each activity's `parentId` to the summary's display
  // string (its code, else its name) from the already-loaded activities — no extra fetch, mirroring the
  // Calendar column's name resolution.
  const wbsParentLabelById = useMemo(() => {
    const byId = new Map((activities.data ?? []).map((a) => [a.id, a] as const));
    const labels = new Map<string, string>();
    for (const activity of activities.data ?? []) {
      if (!activity.parentId) continue;
      const parent = byId.get(activity.parentId);
      if (parent) labels.set(activity.id, parent.code ?? parent.name);
    }
    return labels;
  }, [activities.data]);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const [resourcesId, setResourcesId] = useState<string | null>(null);
  // The row menu's Edit / Report progress / Steps all resolve to ONE intent and ONE editor
  // (ADR-0060 §7) — they carried three separate ids and three separate dialogs until the tabbed
  // editor's flag retired.
  const [deleting, setDeleting] = useState<ActivitySummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Dissolve is deliberately its OWN confirm state, not a mode on `deleting`. Sharing one would put
  // "remove the grouping, keep the work" and "delete this and everything in it" behind the same
  // variable, one boolean away from each other.
  const [dissolving, setDissolving] = useState<ActivitySummary | null>(null);
  const [dissolveError, setDissolveError] = useState<string | null>(null);
  // The bulk-assign selection (M4b) and the open row menu live in a per-table store rather than in
  // `useState` (`docs/TECH_DEBT.md` #334, M2): read by closure inside the cells they made `columns`
  // change on every tick, and every row re-render for it. Selection holds ids, not rows: the list
  // refetches under it, and holding rows would mean re-sending a version the server has already
  // superseded. The menu is the per-row actions overflow (one open at a time, ADR-0029 `Menu`
  // primitive / TECH_DEBT #38); `menuTriggerRef` restores focus to its trigger on close.
  const [store] = useState(createActivitiesTableStore);
  const { selectedIds, menu } = useSyncExternalStore(store.subscribe, store.getState);
  const menuTriggerRef = useRef<HTMLElement | null>(null);

  const managingResources = resourcesId
    ? activities.data?.find((a) => a.id === resourcesId)
    : undefined;
  // The join lag's day↔minute factor for the Resources dialog's subject (ADR-0071 M4), read from that
  // activity's SAVED calendar. `undefined` is a real answer (the list can be loading or absent) and
  // the field degrades to hours and minutes rather than guessing a day.
  const resourcesHoursPerDay = effectiveHoursPerDay(calendars, {
    // Assignment join lag: the activity's own calendar (ADR-0071 §1), never its driver's.
    frame: { kind: 'own' },
    activityCalendarId: managingResources?.calendarId ?? '',
    ...(planCalendarId === undefined ? {} : { planCalendarId }),
  });
  /**
   * Whether **Resources** belongs to the host (the convergence epic) rather than to this table's
   * own dialog. Narrowed as a const so the row action can call `onOpenResources` without a second
   * existence check that TypeScript could not connect to this one.
   */
  const hostOwnsResources = ACTIVITY_EDITOR_CONVERGENCE_ENABLED && onOpenResources !== undefined;

  /*
   * ---- Bulk assign (M4b) ------------------------------------------------------------------
   *
   * The table gains a selection column only when the plan actually has somewhere to file things:
   * with no summary, "Assign to" could offer nothing but "top level", so the column would be a
   * row of checkboxes leading to a control that cannot change anything. Same rule as the derived
   * Gantt bucket, and it keeps a WBS-less plan's table exactly as it is today.
   */
  // Memoised, not `activities.data ?? []` inline: a fresh `[]` on every render would make each
  // dependent memo below recompute every render, which is precisely what they exist to avoid.
  const loadedActivities = useMemo(() => activities.data ?? [], [activities.data]);
  /**
   * The rows a checkbox appears on. A `WBS_SUMMARY` is excluded because nesting one summary inside
   * another is the Breakdown picker's job (spec C-1b) — a checklist has nowhere to put the cycle
   * feedback that restructuring the tree needs.
   */
  const selectableIds = useMemo(
    () =>
      WBS_IMPROVEMENTS_ENABLED
        ? new Set(loadedActivities.filter((a) => a.type !== 'WBS_SUMMARY').map((a) => a.id))
        : new Set<string>(),
    [loadedActivities],
  );
  const bulkAssignActive =
    WBS_IMPROVEMENTS_ENABLED && loadedActivities.some((a) => a.type === 'WBS_SUMMARY');
  /**
   * The selection as it stands **against the current list**. Derived rather than pruned by an
   * effect, so a row deleted underneath the selection cannot leave the bar counting an activity
   * that is no longer there — a count that would then disagree with the batch actually sent.
   */
  const effectiveSelection = useMemo(() => {
    const live = new Set<string>();
    for (const id of selectedIds) if (selectableIds.has(id)) live.add(id);
    return live;
  }, [selectedIds, selectableIds]);
  const membersGate = editorGating?.members ?? { writable: canEditSchedule, reason: null };
  const clearSelection = store.clearSelection;

  /** Open the tabbed editor on the tab this purpose belongs to (ADR-0060 §7). */
  const openFor = useCallback(
    (activity: ActivitySummary, purpose: ActivityEditorPurpose): void => {
      onOpenEditor(activity, purpose);
    },
    [onOpenEditor],
  );

  // The per-row action list, role-/flag-gated (ADR-0039/0044). Feeds both the decision to show a
  // row's "⋯" trigger and the items in its overflow `Menu` (TECH_DEBT #38: dense row actions belong
  // behind the APG `Menu`, never a spread of hover-only ghost buttons — docs/UX_STANDARDS.md).
  const actionsFor = useCallback(
    (activity: ActivitySummary): RowAction[] => {
      const actions: RowAction[] = [];
      if (onOpenLogic) {
        actions.push({ key: 'logic', label: 'Logic', onSelect: () => onOpenLogic(activity) });
      }
      /*
       * **Notes — added with the object bar's item, in one commit**
       * (`docs/specs/object-bar-defects/` M2).
       *
       * The milestone's subject was the object bar, and stopping there would have left this roster
       * one item short of it — which is the split-vocabulary defect the same milestone's M1 refused
       * to create in the other direction, when it removed `Steps` from both surfaces rather than one.
       * `selection-actions.tsx` states the rule: the two vocabularies must match so the same
       * operation reads the same in both places.
       *
       * It also removes a two-step: the only route to an activity's notes from this menu was `Logic`
       * followed by a tab click, which `e2e-notes` describes in its own comment as "the row menu's
       * only route into the editor".
       *
       * Role-gated, never pen-gated (ADR-0046) — the same rule `Progress` below follows.
       */
      if (canWriteNotes) {
        actions.push({
          key: 'notes',
          label: 'Notes',
          onSelect: () => openFor(activity, 'notes'),
        });
      }
      if (canReportProgress) {
        actions.push({
          key: 'progress',
          // Renamed with the canvas selection bar in one commit, never on its own: `:423-425` of
          // `selection-actions.tsx` requires the two vocabularies to match so the same operation
          // reads the same in both places, and that is exactly what a one-sided rename breaks.
          label: 'Progress',
          onSelect: () => openFor(activity, 'progress'),
        });
      }
      // Members — only on a summary, because it is the only row that can hold anything. Any member
      // may look (the panel shades its controls with a reason rather than hiding them), so this is
      // not gated on `canEditSchedule`: seeing what is in a grouping is a read.
      if (WBS_IMPROVEMENTS_ENABLED && activity.type === 'WBS_SUMMARY') {
        actions.push({
          key: 'members',
          label: 'Members',
          onSelect: () => openFor(activity, 'members'),
        });
      }
      // Dark surface (ADR-0039): any member may open the assignments editor (reads are member-level;
      // writes inside are gated on `canEditSchedule`).
      if (RESOURCES_ENABLED) {
        actions.push({
          key: 'resources',
          label: 'Resources',
          onSelect: () =>
            hostOwnsResources ? onOpenResources(activity) : setResourcesId(activity.id),
        });
      }
      {
        // **Shaded, not hidden** (ADR-0082, `docs/TECH_DEBT.md` #111). These used to be pushed only
        // `if (canEditSchedule)`, so a Planner who lost the pen mid-session saw Duplicate shaded on
        // the canvas and simply absent here — one operation teaching two mental models.
        //
        // The gate is `editorGating.general` **by identity**, not a second `{ writable, reason }`
        // assembled beside it: two derivations of "may this person write" drift, and the drift is
        // invisible because each surface looks right alone (ADR-0062's argument, pinned by a test).
        //
        // With **no** gating object there is nothing to shade *with*: `canEditSchedule` is a bare
        // boolean that cannot say whether the refusal is a role or a missing pen. The first draft
        // invented a fourth sentence here ("You cannot change this plan right now."), which is the
        // failure `docs/UX_STANDARDS.md` "Row / node actions" warns about and ADR-0060 records
        // shipping once. So that case **omits**, exactly as `docs/TECH_DEBT.md` #114 decides for
        // `plan-actions-menu.tsx` — one rule, not a special case: shading needs a reason to show.
        const gate = editorGating?.general ?? null;
        const shut =
          gate === null || gate.writable ? {} : { disabledReason: gate.reason ?? 'Not available.' };
        // No gating object and no write right ⇒ nothing to say, so say nothing (above).
        if (gate === null && !canEditSchedule) return actions;

        /*
         * **`Steps` was here and is gone** (`docs/specs/object-bar-defects/` M1), for the reason
         * recorded beside its twin in `selection-actions.tsx`: it opened the same dialog on the same
         * tab as `Progress`, differing only in where focus landed.
         *
         * It goes from BOTH surfaces in one commit. ADR-0093's whole subject is these two rosters
         * naming one action the same way; removing it here alone would have split the vocabulary
         * again, which is the objection that forced `Report progress` → `Progress` to move together.
         *
         * Two things this deliberately does NOT undo. The shade-don't-omit fix its old comment
         * recorded — two reviewers found `Edit` shaded beside `Steps` absent, off one gate — is a
         * finding about `editorGating`, and it still governs every action left in this menu. And the
         * steps panel itself is untouched: it lives on the Progress tab, which both remaining entry
         * points open.
         */
        actions.push({
          key: 'edit',
          label: 'Edit',
          ...shut,
          onSelect: () => openFor(activity, 'edit'),
        });
        // Duplicate sits after Edit — both act on the row as it stands, and a copy is the edit a
        // planner reaches for when the row is nearly right. Deliberately NOT offered on a summary:
        // duplicating one leaf of a band would produce an empty grouping, and copying the band with
        // its subtree is M2. The check is `type`, the same fact `dissolve` gates on, so the action
        // cannot reach a state the product would render as breakage.
        if (ACTIVITY_COPY_PASTE_ENABLED && onDuplicate && activity.type !== 'WBS_SUMMARY') {
          actions.push({
            key: 'duplicate',
            label: 'Duplicate',
            ...shut,
            onSelect: () => onDuplicate(activity),
          });
        }
        // Make milestone… — the SAME derivation the selection bar and the Gantt row menu run, from
        // the SAME `general` gate object, by identity (ADR-0162 decision 4, spec D6). This roster is
        // the one hand-kept list of the three surfaces, which is why the label is imported rather
        // than spelled here and why `make-milestone-gate-identity.test.tsx` pins the gate.
        //
        // Needs the gate object to derive from, so the no-gating path omits it — the same rule the
        // block above states for the write actions.
        if (onMakeMilestone && gate !== null) {
          const milestone = deriveMakeMilestoneGate(activity, gate);
          if (milestone.applies) {
            actions.push({
              key: 'make-milestone',
              label: MAKE_MILESTONE_LABEL,
              ...(milestone.enabled ? {} : { disabledReason: milestone.reason }),
              onSelect: () => onMakeMilestone(activity),
            });
          }
        }
        // Dissolve sits immediately BEFORE Delete, and only on a summary. Adjacency is the point:
        // the two are neighbours in intent ("get rid of this grouping") and opposites in effect, so
        // the non-destructive one has to be visible at the moment the destructive one is chosen.
        if (WBS_IMPROVEMENTS_ENABLED && activity.type === 'WBS_SUMMARY') {
          actions.push({
            key: 'dissolve',
            label: 'Dissolve',
            ...shut,
            onSelect: () => {
              setDissolveError(null);
              setDissolving(activity);
            },
          });
        }
        actions.push({
          key: 'delete',
          label: 'Delete',
          destructive: true,
          ...shut,
          onSelect: () => {
            setDeleteError(null);
            setDeleting(activity);
          },
        });
      }
      return actions;
    },
    [
      onOpenLogic,
      canWriteNotes,
      canReportProgress,
      hostOwnsResources,
      onOpenResources,
      editorGating,
      canEditSchedule,
      onDuplicate,
      onMakeMilestone,
      openFor,
    ],
  );

  /*
   * **`columns` is memoised over what it actually reads** (`docs/TECH_DEBT.md` #334, M2-F2). It was
   * rebuilt on every render, so `DataTable`'s row memo could never hit and one checkbox tick ran
   * every cell of every row. What made that unavoidable was per-row volatile state — the selection
   * and the open menu — being read by closure inside the cells; both now live in `store` and are
   * rendered by the self-subscribing leaves above, so nothing volatile is left in here.
   */
  const columns = useMemo(() => {
    const cols: Column<ActivitySummary>[] = [
      // The bulk-assign selection column, first so a tick is the leftmost thing on a row. Conditional
      // spread (not a post-hoc unshift) so its position cannot drift.
      ...(bulkAssignActive
        ? [
            {
              header: 'Select',
              // No `srHeader`: `headerCell` wins the render, so it was never reachable
              // (`docs/TECH_DEBT.md` #73). `SelectAllCheckbox` carries its own accessible name.
              headClassName: 'py-2 pr-3 font-medium',
              cellClassName: 'py-2 pr-3',
              headerCell: () => <SelectAllControl store={store} selectableIds={selectableIds} />,
              cell: (activity: ActivitySummary) =>
                // A summary has no checkbox at all rather than a disabled one: "you may not file this
                // here" is not the message — it is filed from the Breakdown picker, which a shaded box
                // on this row would not tell anyone.
                //
                // Selecting is deliberately NOT gated on the write right. Ticking a row is a read —
                // nothing is sent until Assign — and it is the ONLY way to reach the bar that says
                // why the write is shut. Disabling the boxes would leave a reader with a column of
                // dead controls and the explanation behind them, unreachable. (Contrast the Members
                // checklist, where ticking IS the pending edit, so there the boxes do shade.)
                selectableIds.has(activity.id) ? (
                  <RowSelectCheckbox store={store} id={activity.id} name={activity.name} />
                ) : null,
            } satisfies Column<ActivitySummary>,
          ]
        : []),
      {
        header: 'Code',
        cell: (activity) =>
          activity.code ? (
            <span className="font-mono text-xs">{activity.code}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        header: 'Name',
        cell: (activity) => {
          // A mandatory pin that broke logic (engine-owned, ADR-0035 §7): surface it as a "Conflict"
          // pill beside the name — always visible (the Constraint column hides below `lg`), so a
          // produced-and-flagged violation can't slip off narrow screens. Text carries the meaning
          // (never colour alone, WCAG 1.4.1); an sr-only clause spells out the cause for non-hover
          // users, matching the summary strip's wording. Only shown when the M4 surface is on.
          const violated = ADVANCED_CONSTRAINTS_ENABLED && activity.constraintViolated;
          // An imported external bound drove this activity's schedule (engine-owned, ADR-0043 M1):
          // the per-activity companion to the summary strip's "Externally driven" count, so a planner
          // can see WHICH activities an external commitment gated. Informational (soft bound), so a
          // neutral pill, not the critical Conflict tone. Text + sr-only clause carry the meaning
          // (never colour alone, WCAG 1.4.1). Only shown when the inter-project surface is on.
          const externalDriven = INTER_PROJECT_DATES_ENABLED && activity.externalDriven;
          // A resource-dependent activity with no driving assignment (engine-owned, ADR-0035 §23):
          // the engine produces-and-flags rather than refusing, scheduling it on the ordinary calendar
          // and setting this. Until now the flag was computed, persisted and rendered NOWHERE, so the
          // failure was silent — the activity simply scheduled on the wrong working time and looked
          // fine. Critical tone because it means the dates on screen are not the ones the planner
          // asked for. Gated on the same flag as the type that produces it.
          const driverMissing = ADVANCED_ACTIVITY_TYPES_ENABLED && activity.resourceDriverMissing;
          // Per-activity note count (ADR-0046), route-composed like variance — a small badge only when
          // the map is supplied (behind `VITE_NOTES`) and the row has ≥1 note (the badge hides at zero).
          const noteCount = NOTES_ENABLED ? (noteCountByActivityId?.get(activity.id) ?? 0) : 0;
          return (
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{activity.name}</span>
              <NoteCountBadge count={noteCount} />
              {violated ? (
                <Badge
                  variant="critical"
                  size="sm"
                  title="A mandatory constraint forces a date earlier than the logic allows; shown as pinned, not corrected — review the dates."
                >
                  Conflict
                  <span className="sr-only">
                    {' '}
                    — a mandatory constraint forces a date earlier than the logic allows; shown as
                    pinned, not corrected. Review the dates.
                  </span>
                </Badge>
              ) : null}
              {externalDriven ? (
                <Badge
                  variant="neutral"
                  size="sm"
                  title="An imported date from another project drove this activity's schedule this recalculation."
                >
                  External
                  <span className="sr-only">
                    {' '}
                    — an imported date from another project drove this activity’s schedule this
                    recalculation.
                  </span>
                </Badge>
              ) : null}
              {driverMissing ? (
                <Badge
                  variant="critical"
                  size="sm"
                  title="This resource-dependent activity has no driving resource assignment, so it was scheduled on the plan's calendar instead of the resource's."
                >
                  Needs a driver
                  <span className="sr-only">
                    {' '}
                    — this resource-dependent activity has no driving resource assignment, so it was
                    scheduled on the plan’s calendar instead of the resource’s. Assign a resource
                    and mark it driving, then recalculate.
                  </span>
                </Badge>
              ) : null}
            </span>
          );
        },
      },
      { header: 'Type', cell: (activity) => ACTIVITY_TYPE_LABELS[activity.type] },
      {
        header: 'Duration',
        cellClassName: 'whitespace-nowrap tabular-nums',
        cell: (activity) => (
          <span className="text-muted-foreground">
            {formatDuration(
              activity,
              // The Duration column measures the work (#86), so it reads on the calendar the
              // activity schedules on — which is what the API's own `durationDays` is measured on.
              // Shared with the Gantt's own read-out (#317).
              activitySchedulingHoursPerDay(calendars, activity, planCalendarId),
            )}
          </span>
        ),
      },
      {
        header: 'Progress',
        cellClassName: 'tabular-nums',
        cell: (activity) => (
          <span className="text-muted-foreground">{formatProgress(activity)}</span>
        ),
      },
      // A set date constraint (the definition a planner enters), so it's visible without opening
      // each row. The shorthand ("SNET · 01 May 2026") carries the meaning in text (never colour,
      // WCAG 1.4.1); the full label is the accessible name. Hidden below `lg` like the late-date
      // columns to keep narrow screens legible — the edit dialog still shows it there.
      {
        header: 'Constraint',
        headClassName: 'hidden py-2 pr-4 font-medium lg:table-cell',
        cellClassName: 'hidden py-2 pr-4 whitespace-nowrap lg:table-cell',
        cell: (activity) => {
          const constraint = formatConstraint(activity);
          // `aria-label` on a plain span (role generic) isn't reliably honoured; instead show the
          // shorthand visually (aria-hidden) with the spelled-out label in an sr-only node — the
          // same visible-glyph + hidden-text pattern the diagram legend uses. `title` = hover. A
          // produced-and-flagged violation shows as a "Conflict" pill in the always-visible Name cell.
          return constraint ? (
            <span className="text-muted-foreground" title={constraint.full}>
              <span aria-hidden="true">{constraint.short}</span>
              <span className="sr-only">{constraint.full}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      // An activity's own working-time calendar (ADR-0037), only when the picker feature is on. An em
      // dash means "inherits the plan's calendar" — so a row that HAS a calendar must never fall back
      // to one: while the library is still loading it reads "Loading…", and if that fetch fails/omits
      // it "Unnamed" (with the id as a title), keeping the assigned case visibly distinct from a
      // genuine inherit. Conditional spread (not a post-hoc splice) so its position can't silently
      // drift. Hidden below `lg` like the other definition detail columns.
      ...(ACTIVITY_CALENDAR_ENABLED
        ? [
            {
              header: 'Calendar',
              headClassName: 'hidden py-2 pr-4 font-medium lg:table-cell',
              cellClassName: 'hidden py-2 pr-4 whitespace-nowrap lg:table-cell',
              cell: (activity: ActivitySummary) => {
                if (!activity.calendarId) return <span className="text-muted-foreground">—</span>;
                const name = calendarNameById.get(activity.calendarId);
                if (name) return <span className="text-muted-foreground">{name}</span>;
                return (
                  <span className="text-muted-foreground italic" title={activity.calendarId}>
                    {calendarsLoading ? 'Loading…' : 'Unnamed'}
                  </span>
                );
              },
            } satisfies Column<ActivitySummary>,
          ]
        : []),
      // The activity's parent WBS summary (ADR-0038), read-only, only when the WBS surface is on
      // (`ADVANCED_ACTIVITY_TYPES_ENABLED`). An em dash means "no parent" (a top-level activity). The
      // parent's code (else its name) is resolved from the loaded activities by `parentId` — no extra
      // fetch, mirroring the Calendar column. Conditional spread (not a splice) so its position is stable;
      // hidden below `lg` like the other definition-detail columns.
      ...(ADVANCED_ACTIVITY_TYPES_ENABLED
        ? [
            {
              header: 'WBS',
              headClassName: 'hidden py-2 pr-4 font-medium lg:table-cell',
              cellClassName: 'hidden py-2 pr-4 whitespace-nowrap lg:table-cell',
              cell: (activity: ActivitySummary) => {
                const parentLabel = wbsParentLabelById.get(activity.id);
                return parentLabel ? (
                  <span className="text-muted-foreground" title={parentLabel}>
                    {parentLabel}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                );
              },
            } satisfies Column<ActivitySummary>,
          ]
        : []),
      // Engine-owned computed columns (M6, read-only). Null renders as an em dash
      // until the plan is recalculated. Late dates hide first on narrow screens.
      scheduleColumn('Early start', (a) => a.earlyStart, 'md'),
      scheduleColumn('Early finish', (a) => a.earlyFinish, 'md'),
      scheduleColumn('Late start', (a) => a.lateStart, 'lg'),
      scheduleColumn('Late finish', (a) => a.lateFinish, 'lg'),
      {
        // **`Float left`, reading `remainingFloat`** (M-E-T7) — the slack left from where the bar is
        // drawn, which is the float a planner spends. Labelled in the same commit as the field for
        // the reason the Gantt's twin records: the number is plausible under either meaning, so a
        // bare `Float` heading changing origin is invisible to the reader it misleads.
        header: 'Float left',
        cellClassName: 'py-2 pr-4 whitespace-nowrap tabular-nums text-muted-foreground',
        cell: (activity) => formatRemainingFloat(activity.remainingFloat),
      },
      {
        header: 'Critical path',
        cellClassName: 'py-2 pr-4 whitespace-nowrap',
        cell: (activity) => {
          const flag = criticality(activity);
          return flag ? (
            <Badge variant={flag.variant}>{flag.label}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
    ];
    // Variance vs the active baseline — only when the route supplies the map (M7). The
    // text carries the meaning ("3 d behind"/"ahead"); the tone colour merely reinforces.
    // Finish variance is the headline (always shown); start/float variance hide first on
    // narrow screens, mirroring the early/late date columns.
    if (varianceByActivityId) {
      const varianceColumn = (
        header: string,
        field: VarianceField,
        hideBelow?: 'lg',
      ): Column<ActivitySummary> => {
        const show = hideBelow ? ` hidden ${hideBelow}:table-cell` : '';
        return {
          header,
          headClassName: `py-2 pr-4 font-medium${show}`,
          cellClassName: `py-2 pr-4 whitespace-nowrap tabular-nums${show}`,
          cell: (activity) => {
            const row = varianceByActivityId.get(activity.id);
            if (!row) return <span className="text-muted-foreground">—</span>;
            const variance = formatDayVariance(row, field);
            return <span className={VARIANCE_TONE_CLASS[variance.tone]}>{variance.text}</span>;
          },
        };
      };
      cols.push(
        varianceColumn('Start variance', 'start', 'lg'),
        varianceColumn('Finish variance', 'finish'),
        // "Total float variance", not "Float variance" (placement-baseline-variance, F2): the
        // column beside it is "Float left" (remaining float, above) — without the word, a
        // reader takes this column to be variance OF that one, when it is always total float
        // (`variance.ts` is pinned off `remainingFloat` by `float-basis.structural.spec.ts`).
        varianceColumn('Total float variance', 'float', 'lg'),
      );
    }
    if (canEditSchedule || canReportProgress || onOpenLogic || RESOURCES_ENABLED) {
      cols.push({
        header: 'Actions',
        srHeader: true,
        headClassName: 'py-2 font-medium',
        cellClassName: 'py-2 text-right whitespace-nowrap',
        cell: (activity) => {
          const actions = actionsFor(activity);
          // No actions at all, or **every** action shaded: render no trigger (ADR-0082 §3). Without
          // the second clause a Viewer would open a menu of nothing but refusals — and it is what
          // keeps the all-disabled focus trap out of reach rather than merely fixed.
          // ADR-0082 §3's "every item shaded ⇒ no trigger" clause. **Defensive, and today unreachable from
          // this component** — established by trying to test it rather than by assuming either way, after
          // the consolidation pass blocked on it being untested. The column above renders only when
          // `canEditSchedule || canReportProgress || onOpenLogic || RESOURCES_ENABLED`, and each of those
          // four contributes an action that is never shaded (Logic, Resources and Report progress are
          // reads or non-pen-gated; `canEditSchedule` and `editorGating.general.writable` are the same
          // predicate — `penManaged ? canWrite && holdsPen : canWrite` — so they cannot disagree).
          //
          // A unit test can only reach it by turning all four off, at which point the column is absent and
          // the test passes for the wrong reason. The first version of that test did exactly that and still
          // passed with this clause deleted. Kept as a guard against a future action set where it IS
          // reachable; the behaviour it protects (a menu with no enabled item) is proven where it can be —
          // `menu.test.tsx`, "focuses its first item on open even when every item is disabled".
          if (actions.length === 0 || actions.every((a) => a.disabledReason !== undefined)) {
            return null;
          }
          return (
            <RowActionsButton store={store} activity={activity} menuTriggerRef={menuTriggerRef} />
          );
        },
      });
    }
    return cols;
  }, [
    bulkAssignActive,
    selectableIds,
    store,
    calendars,
    calendarNameById,
    calendarsLoading,
    planCalendarId,
    wbsParentLabelById,
    noteCountByActivityId,
    varianceByActivityId,
    canEditSchedule,
    canReportProgress,
    onOpenLogic,
    actionsFor,
  ]);

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    const snapshot = deleting;
    deleteActivity.mutate(snapshot.id, {
      onSuccess: (result) => {
        // Close the dialog synchronously before moving focus (see ClientsTable).
        flushSync(() => {
          setDeleting(null);
          setDeleteError(null);
        });
        // Record BEFORE announcing, so a spoken "deleted" can never precede the step that makes it
        // undoable. Absent host ⇒ today's behaviour, unrecorded (`docs/TECH_DEBT.md` #230).
        onDeleted?.(snapshot, result.deleteBatchId);
        announce(`Activity “${name}” deleted.`);
        regionRef.current?.focus();
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  const confirmDissolve = (): void => {
    if (!dissolving) return;
    const name = dissolving.name;
    dissolveSummary.mutate(dissolving.id, {
      onSuccess: (result) => {
        flushSync(() => {
          setDissolving(null);
          setDissolveError(null);
        });
        onDissolved?.(dissolving, result);
        // Names what actually happened, not just that something did: the summary is gone AND the
        // work is not, which is the whole distinction from Delete.
        announce(`Summary “${name}” dissolved. Its activities were kept.`);
        regionRef.current?.focus();
      },
      onError: (err) => setDissolveError(err.message),
    });
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="flex h-full min-h-0 flex-col gap-3 outline-none">
      {/*
        Above the table, not floating over it: the bar appears and disappears with the selection, and
        a floating layer that reflows the rows underneath it moves the very checkboxes the user is
        working through. Unmounting it on success would strand focus, so `onDone` clears the
        selection and returns focus to this region — the same hand-off delete and dissolve use.

        `shrink-0` (activities-panel-scale M1): this wrapper is now a flex column whose OTHER child,
        `DataTable`'s `scroll="contained"` region, grows to fill whatever height is left and scrolls
        internally. Without it the bar has no declared floor and the table's `flex-1` could squeeze
        it, which is the opposite of "stays above the scrolling rows" (spec §2 edge cases).
      */}
      {bulkAssignActive ? (
        <div className="shrink-0">
          <WbsBulkAssignBar
            orgSlug={orgSlug}
            planId={planId}
            selected={effectiveSelection}
            planActivities={loadedActivities}
            gate={membersGate}
            {...(onReparented ? { onReparented } : {})}
            onClear={clearSelection}
            onDone={() => {
              flushSync(clearSelection);
              regionRef.current?.focus();
            }}
          />
        </div>
      ) : null}

      {/* `scroll="contained"`: this table is the ONE scroller inside a height-capped pane
          (`ActivityBottomPanel`), so its header pins while the rows scroll underneath it
          (TECH_DEBT #334, `docs/specs/activities-panel-scale/`). Every other `DataTable` consumer
          stays on the default `'page'` scroll, which this table used before M1.

          `windowed`: only the rows in view are in the DOM (ADR-0165, #334 M3), so opening a long plan
          costs the window and not the plan. Find-in-page cannot find a row that is not in view; the
          diagram's listbox lists every activity. */}
      <DataTable
        caption="Activities"
        columns={columns}
        query={activities}
        getRowKey={(activity) => activity.id}
        loadingLabel="Loading activities…"
        errorLabel="Couldn’t load activities. Please try again."
        empty={
          <>No activities yet.{canEditSchedule ? ' Add the first activity to this plan.' : ''}</>
        }
        scroll="contained"
        windowed
      />

      {RESOURCES_ENABLED && !hostOwnsResources ? (
        <ActivityResourcesDialog
          orgSlug={orgSlug}
          planId={planId}
          open={managingResources !== undefined}
          onClose={() => setResourcesId(null)}
          canWrite={canEditSchedule}
          {...(onAssignmentEdited ? { onAssignmentEdited } : {})}
          {...(managingResources
            ? {
                activityId: managingResources.id,
                activityName: managingResources.name,
                activityDurationType: managingResources.durationType,
                // The join lag's day↔minute factor (ADR-0071 M4), from the row's SAVED calendar —
                // there is no pending selection here, and none is wanted: an assignment write does
                // not carry the activity's calendar with it.
                ...(resourcesHoursPerDay === undefined
                  ? {}
                  : { activityHoursPerDay: resourcesHoursPerDay }),
                // A milestone is zero-span, so a loading curve has nothing to distribute over — the
                // dialog hides the curve picker (TECH_DEBT #44b). Classified here (the activities
                // feature owns the type helpers) so the resources feature stays free of a back-import.
                isMilestone: isMilestoneType(managingResources.type),
              }
            : {})}
        />
      ) : null}

      {/* **The table mounts no editor** (Graphite M6-T4). It had its own, beside the workspace's,
          and this file's previous comment called it "the table's ONE editor" — true of the table
          and false of the plan, which had two. Two mounts means two sets of scope forms and two
          dirty states for one activity, and after M6-T2 it also meant the same Edit opened a drawer
          from the canvas and a modal from here. The row actions now call `onOpenEditor`, and the
          workspace decides the chrome. */}

      {canEditSchedule ? (
        <>
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            onConfirm={confirmDelete}
            title="Delete activity"
            description={deleting ? deleteActivityDescription(deleting, activities.data ?? []) : ''}
            pending={deleteActivity.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
          {/*
            Deliberately NOT the destructive variant. Dissolve removes a grouping and keeps every
            activity in it; dressing it in the delete red would tell the user, in the one channel
            they read fastest, that it is the thing the copy spends three sentences saying it is not.
          */}
          <ConfirmDialog
            open={dissolving !== null}
            onClose={() => {
              setDissolving(null);
              setDissolveError(null);
            }}
            onConfirm={confirmDissolve}
            title="Dissolve summary"
            description={
              dissolving ? dissolveSummaryDescription(dissolving, activities.data ?? []) : ''
            }
            confirmLabel="Dissolve"
            confirmVariant="default"
            pending={dissolveSummary.isPending}
            pendingLabel="Dissolving…"
            error={dissolveError}
          />
        </>
      ) : null}

      {menu ? (
        <Menu
          open
          onClose={() => store.setMenu(null)}
          anchor={menu.anchor}
          label={`Actions for ${menu.activity.name}`}
          restoreFocusRef={menuTriggerRef}
        >
          {actionsFor(menu.activity).map((action) => (
            <MenuItem
              key={action.key}
              destructive={action.destructive ?? false}
              disabled={action.disabledReason !== undefined}
              {...(action.disabledReason === undefined
                ? {}
                : { disabledReason: action.disabledReason })}
              onSelect={action.onSelect}
            >
              {action.label}
            </MenuItem>
          ))}
        </Menu>
      ) : null}
    </div>
  );
}
