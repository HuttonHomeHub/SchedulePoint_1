import type { ActivitySummary, DependencySummary, DependencyType } from '@repo/types';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { TSLD_EDITING_ENABLED } from '../../../config/env';
import type { EditIntent, EditMode } from '../interaction/gesture-machine';
import {
  announceChainStep,
  chainNeighbour,
  describeActivity,
  summarizeLogic,
} from '../render/a11y';
import { packLanes } from '../render/auto-pack';
import { daysBetween, type Point } from '../render/render-model';

import { CreateActivityPopover } from './CreateActivityPopover';
import { EditConflictBanner } from './EditConflictBanner';
import { TsldCanvas, type PendingGhost } from './TsldCanvas';
import { TsldShortcutsHelp } from './TsldShortcutsHelp';
import { TsldToolbar } from './TsldToolbar';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { RenderActivity, RenderEdge } from '@/features/tsld/render/render-model';

/** Map the API shapes to the render model's minimal shapes. */
function toRenderActivities(activities: readonly ActivitySummary[]): RenderActivity[] {
  return activities.map((a) => ({
    id: a.id,
    type: a.type,
    laneIndex: a.laneIndex,
    earlyStart: a.earlyStart,
    earlyFinish: a.earlyFinish,
    isCritical: a.isCritical,
    isNearCritical: a.isNearCritical,
  }));
}

function toRenderEdges(dependencies: readonly DependencySummary[]): RenderEdge[] {
  return dependencies.map((d) => ({
    predecessorId: d.predecessor.id,
    successorId: d.successor.id,
    isDriving: d.isDriving,
  }));
}

/**
 * The visible key for the diagram, mirroring the canvas exactly: each activity class is a
 * fill colour **paired with an outline style** (solid / dashed / none) so criticality is
 * never conveyed by colour alone (WCAG 1.4.1). Swatches read their colours from the same
 * design tokens the painter uses, so the key stays truthful across themes.
 */
type LegendItem =
  { label: string; swatch: React.CSSProperties } | { label: string; line: 'solid' | 'dashed' };

const LEGEND: ReadonlyArray<LegendItem> = [
  {
    label: 'Critical',
    swatch: {
      backgroundColor: 'var(--color-destructive)',
      border: '1.5px solid var(--color-foreground)',
    },
  },
  {
    label: 'Near-critical',
    swatch: {
      backgroundColor: 'var(--color-warning)',
      border: '1.5px dashed var(--color-foreground)',
    },
  },
  { label: 'On schedule', swatch: { backgroundColor: 'var(--color-primary)' } },
  // Logic ties, matching the canvas: a driving link (heavier solid) sets its
  // successor's start; a non-driving link (thin dashed) carries slack (M3).
  { label: 'Driving link', line: 'solid' },
  { label: 'Non-driving link', line: 'dashed' },
];

/** A committed create from the canvas; the route maps it to `POST /activities` + recalc. */
export interface TsldCreateInput {
  name: string;
  startDay: number;
  endDay: number;
  laneIndex: number;
}

/**
 * The outcome of a create. It **resolves iff the activity was persisted** — so the panel
 * closes the popover and never re-POSTs. `recalcConflict` carries a non-fatal message when the
 * row was created but the follow-up recalc was refused (e.g. the plan lock was held): the row
 * stays, and the message is surfaced via the conflict banner, not the create popover. A create
 * failure (validation/duplicate) rejects, keeping the popover open with the inline error.
 */
export interface TsldCreateOutcome {
  recalcConflict: string | null;
}

/**
 * A committed reposition — a free-2D move (M4). `startDay` (present iff the day changed) maps to
 * an SNET constraint + recalc; `laneIndex` (present iff the lane changed) is layout only (no
 * recalc). The route issues the minimal PATCH for whichever axes are present. **At least one axis
 * is always present** — the gesture machine emits a `reposition` only when a whole cell changed,
 * and the route treats the all-absent case as a no-op — though the type can't enforce that.
 */
export interface TsldRepositionInput {
  activityId: string;
  startDay?: number;
  laneIndex?: number;
}

/**
 * The shared outcome of an optimistic edit (reposition or link). It **resolves** for both
 * success and a domain conflict (stale `version`, a cycle, a duplicate — ADR-0021/0022); a
 * genuine failure rejects. `applied` says whether the write actually landed — false when it was
 * refused (nothing changed), true when it landed (even if the follow-up recalc then failed) — so
 * the success status is announced only when it's true. `conflict` is the banner message.
 */
export interface TsldEditOutcome {
  applied: boolean;
  conflict: string | null;
}

export type TsldRepositionOutcome = TsldEditOutcome;

/** A committed dependency-draw — predecessor → successor with the modifier-chosen type. */
export interface TsldLinkInput {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
}

export type TsldLinkOutcome = TsldEditOutcome;

export interface TsldPanelProps {
  activities: readonly ActivitySummary[];
  dependencies: readonly DependencySummary[];
  /** The plan's start (`plannedStart`) — the diagram's day-zero origin. Null → not schedulable. */
  dataDate: string | null;
  /** Whether the viewer may edit (Planner/Org Admin). Combined with the M2 flag to gate editing. */
  canEdit?: boolean;
  /** Route-composed create handler (owns the mutation + recalc, ADR-0026 D8). Its presence + the
   * flag + `canEdit` enable on-canvas editing. Resolves once the activity persists (see
   * {@link TsldCreateOutcome}); rejects only when the create itself failed. */
  onCreate?: (input: TsldCreateInput) => Promise<TsldCreateOutcome>;
  /** Route-composed reposition handler (SNET PATCH + recalc). Resolves with a conflict message
   * when the move was refused (stale version) or dates couldn't recalc; rejects on real error. */
  onReposition?: (input: TsldRepositionInput) => Promise<TsldRepositionOutcome>;
  /** Route-composed dependency-draw handler (`POST /dependencies` + recalc). Resolves with a
   * conflict message on a cycle/duplicate (ADR-0021) or a recalc refusal; rejects on real error. */
  onLink?: (input: TsldLinkInput) => Promise<TsldLinkOutcome>;
  /** Route-composed auto-arrange handler (M4 4.3): persists the packed lanes via the batch
   * positions endpoint (all-or-nothing, no recalc). Resolves with a conflict message when a stale
   * version refused the whole batch; rejects on real error. Its presence shows the toolbar action. */
  onAutoArrange?: (
    changes: readonly { id: string; laneIndex: number }[],
  ) => Promise<TsldEditOutcome>;
  /** Open the logic (dependency) editor for an activity — the keyboard equivalent of link-draw,
   * invoked from the parallel listbox (no pointer-only capability, WCAG 2.1.1). */
  onOpenLogic?: (activity: ActivitySummary) => void;
  /** Refetch the plan's server truth (activities/links/variance). Wired to the conflict banner's
   * Refresh so the "this changed elsewhere" cases have a real recovery action, not just copy. */
  onRefresh?: () => void;
}

interface PendingCreate {
  startDay: number;
  endDay: number;
  laneIndex: number;
  anchor: Point;
  saving: boolean;
  error: string | null;
}

/**
 * The Time-Scaled Logic Diagram (TSLD) panel (ADR-0026). Renders the plan's computed schedule
 * on a Canvas 2D surface paired with a **parallel focusable listbox** (the canvas is
 * `aria-hidden`; keyboard/AT users navigate the listbox, and selecting rings the bar). The
 * activities table remains the fuller conforming alternative.
 *
 * **M2 (flagged):** when editing is enabled (`canEdit` + `onCreate` + `VITE_TSLD_EDITING`),
 * a toolbar adds an **Add activity** tool — drag on the timeline to draw a task, then name it
 * in an inline popover — and in **Select** mode a writer drags a bar's body sideways to move it
 * in time (an SNET reposition) or drags from a bar's **edge handle** to another bar to draw a
 * dependency (modifier picks the type). Edits show an instant optimistic preview; the route owns
 * the write + authoritative recalc, and a stale-version / cycle / duplicate conflict surfaces as
 * a non-destructive banner. With editing off the surface is byte-for-byte the M1 read-only diagram.
 */
export function TsldPanel({
  activities,
  dependencies,
  dataDate,
  canEdit = false,
  onCreate,
  onReposition,
  onLink,
  onAutoArrange,
  onOpenLogic,
  onRefresh,
}: TsldPanelProps): React.ReactElement {
  const announce = useAnnounce();
  const listboxId = useId();
  const optionId = (id: string): string => `${listboxId}-opt-${id}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [mode, setMode] = useState<EditMode>('select');
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  // The moved bar's ghost while a reposition mutation is in flight (no popover, just the ghost).
  const [pendingReposition, setPendingReposition] = useState<PendingGhost | null>(null);
  // Auto-arrange confirm dialog + in-flight state (a bulk, no-undo reorder — §5 of the M4 design).
  // The pending lane changes are computed when the dialog opens, so confirm applies exactly them.
  const [confirmArrange, setConfirmArrange] = useState(false);
  const [arrangeChanges, setArrangeChanges] = useState<{ id: string; laneIndex: number }[]>([]);
  const [arranging, setArranging] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  // Focus returns here when the create popover closes, so keyboard users aren't dropped to
  // <body> (they're placed back on the tool to draw again).
  const addActivityRef = useRef<HTMLButtonElement>(null);

  const renderActivities = useMemo(() => toRenderActivities(activities), [activities]);
  const renderEdges = useMemo(() => toRenderEdges(dependencies), [dependencies]);
  const isCalculated = activities.some((a) => a.earlyStart !== null);
  const showDiagram = isCalculated && dataDate !== null;
  const editingEnabled = showDiagram && canEdit && TSLD_EDITING_ENABLED && onCreate !== undefined;

  const select = (id: string | null): void => {
    setSelectedId(id);
    if (id) {
      const activity = activities.find((a) => a.id === id);
      if (activity) announce(describeActivity(activity));
    }
  };

  // Keep the focused activity's list position, so if it's deleted elsewhere (arriving via a
  // refetch) we can move the ring to the nearest survivor rather than stranding keyboard focus.
  const selectedIndexRef = useRef(0);
  useEffect(() => {
    if (selectedId === null) return;
    const idx = activities.findIndex((a) => a.id === selectedId);
    if (idx >= 0) {
      selectedIndexRef.current = idx;
      return;
    }
    // The selected bar vanished — reconcile selection to the nearest remaining activity.
    const next = activities[Math.min(selectedIndexRef.current, activities.length - 1)];
    setSelectedId(next ? next.id : null);
    announce('Activity removed.');
  }, [activities, selectedId, announce]);

  const onListKeyDown = (event: React.KeyboardEvent): void => {
    if (activities.length === 0) return;
    // Enter on the focused activity opens its logic (dependency) editor — the keyboard path for
    // creating links, so link-draw introduces no pointer-only capability (WCAG 2.1.1).
    if (event.key === 'Enter' && onOpenLogic) {
      const current = activities.find((a) => a.id === selectedId);
      if (current) {
        event.preventDefault();
        onOpenLogic(current);
      }
      return;
    }
    // ? opens the keyboard-shortcuts help (discoverability, read — no flag).
    if (event.key === '?') {
      event.preventDefault();
      setShowHelp(true);
      return;
    }
    // [ / ] — driving-first chain navigation to the predecessor / successor (read — no flag).
    // Selection follows (the canvas reveals + rings it); the announcement names the tie + driving,
    // so driving/logic context is delivered exactly when a planner traces the path (M5 §2/§3).
    if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      if (!current) return;
      const dir = event.key === '[' ? 'pred' : 'succ';
      const neighbour = chainNeighbour(current.id, dependencies, dir);
      if (neighbour) setSelectedId(neighbour.id);
      announce(announceChainStep(dir, neighbour));
      return;
    }
    // Space — Tier-2 "tell me more": logic ties + driving for the focused activity (read — no flag).
    if (event.key === ' ') {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      if (current) announce(summarizeLogic(current.id, dependencies));
      return;
    }
    // Alt+↑/↓ nudges the focused activity one lane — the keyboard equivalent of a vertical drag,
    // so free-2D introduces no pointer-only capability (WCAG 2.1.1). Lane-only ⇒ no recalc.
    if (
      editingEnabled &&
      onReposition &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
      event.altKey
    ) {
      event.preventDefault();
      const current = activities.find((a) => a.id === selectedId);
      if (!current) return;
      const laneIndex = Math.max(0, current.laneIndex + (event.key === 'ArrowDown' ? 1 : -1));
      if (laneIndex === current.laneIndex) return; // already at lane 0 moving up — no-op
      setConflict(null);
      void onReposition({ activityId: current.id, laneIndex })
        .then((outcome) => {
          if (outcome.conflict) setConflict(outcome.conflict);
          if (outcome.applied) announce(`Moved “${current.name}” to lane ${laneIndex + 1}.`);
        })
        .catch((err: unknown) => {
          setConflict(err instanceof Error ? err.message : 'Couldn’t move the activity.');
        });
      return;
    }
    const index = activities.findIndex((a) => a.id === selectedId);
    let next = index;
    if (event.key === 'ArrowDown') next = Math.min(activities.length - 1, index + 1);
    else if (event.key === 'ArrowUp') next = Math.max(0, index < 0 ? 0 : index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = activities.length - 1;
    else return;
    event.preventDefault();
    const target = activities[next];
    if (target) select(target.id);
  };

  const closeCreate = (): void => {
    setPendingCreate(null);
    addActivityRef.current?.focus();
  };

  // Auto-arrange (M4 4.3): pack the drawn (dated) activities into the fewest non-overlapping lanes.
  // Pure `packLanes` computes the minimal set of moves; undated activities have no x-span → keep
  // their lane. (Returns [] when the plan isn't schedulable — a dead case, since the toolbar only
  // renders when editing is enabled, which already requires a data date.)
  const computeArrangeChanges = (): { id: string; laneIndex: number }[] => {
    if (dataDate === null) return [];
    const packItems = activities.flatMap((a) =>
      a.earlyStart === null
        ? []
        : [
            {
              id: a.id,
              startDay: daysBetween(dataDate, a.earlyStart),
              endDay: daysBetween(dataDate, a.earlyFinish ?? a.earlyStart),
              laneIndex: a.laneIndex,
            },
          ],
    );
    return packLanes(packItems);
  };

  // Toolbar click: compute the pack up front so an already-tidy diagram reports "nothing to move"
  // immediately (no pointless confirm round-trip, and no dialog that could dead-end) — only open
  // the confirm when there is actually something to reorder.
  const openAutoArrange = (): void => {
    if (!onAutoArrange) return;
    const changes = computeArrangeChanges();
    if (changes.length === 0) {
      announce('Lanes are already arranged; nothing to move.');
      return;
    }
    setArrangeChanges(changes);
    setConfirmArrange(true);
  };

  // Confirm: persist exactly the changes shown to the user (the route owns the batch write).
  const runAutoArrange = (): void => {
    if (!onAutoArrange || arrangeChanges.length === 0) return;
    setConflict(null);
    setArranging(true);
    void onAutoArrange(arrangeChanges)
      .then((outcome) => {
        setArranging(false);
        setConfirmArrange(false);
        if (outcome.conflict) setConflict(outcome.conflict);
        if (outcome.applied) {
          const n = arrangeChanges.length;
          announce(`Lanes auto-arranged; ${n} ${n === 1 ? 'activity' : 'activities'} moved.`);
        }
      })
      .catch((err: unknown) => {
        setArranging(false);
        setConfirmArrange(false);
        setConflict(err instanceof Error ? err.message : 'Couldn’t auto-arrange the lanes.');
      });
  };

  const onIntent = (intent: EditIntent, anchor: Point): void => {
    // Ignore a new gesture while a create popover or a reposition is already in flight.
    if (pendingCreate || pendingReposition) return;
    if (intent.kind === 'create') {
      setConflict(null);
      setPendingCreate({ ...intent, anchor, saving: false, error: null });
      return;
    }
    if (intent.kind === 'reposition') {
      const activity = activities.find((a) => a.id === intent.activityId);
      if (!activity || !onReposition) return;
      setConflict(null);
      // Free-2D: the intent carries only the axes that changed. Fill the unchanged axis from the
      // activity's current geometry so the optimistic ghost sits at the resulting day+lane.
      const span =
        activity.earlyStart && activity.earlyFinish
          ? daysBetween(activity.earlyStart, activity.earlyFinish)
          : 0;
      const currentStartDay =
        activity.earlyStart && dataDate ? daysBetween(dataDate, activity.earlyStart) : 0;
      const startDay = intent.startDay ?? currentStartDay;
      const laneIndex = intent.laneIndex ?? activity.laneIndex;
      setPendingReposition({ startDay, endDay: startDay + span, laneIndex });
      void onReposition({
        activityId: intent.activityId,
        ...(intent.startDay !== undefined ? { startDay: intent.startDay } : {}),
        ...(intent.laneIndex !== undefined ? { laneIndex: intent.laneIndex } : {}),
      })
        .then((outcome) => {
          setPendingReposition(null);
          if (outcome.conflict) setConflict(outcome.conflict);
          // Announce "Moved" only when the move actually landed, so it never contradicts a
          // "wasn't applied" conflict banner (WCAG 4.1.3); name the new lane when it changed.
          if (outcome.applied) {
            // A both-axes drop also moved in time (SNET + recalc) — tell AT users the dates will
            // change, since the ghost's new column is the only sighted cue for that half.
            const timeChanged = intent.startDay !== undefined;
            announce(
              intent.laneIndex !== undefined
                ? `Moved “${activity.name}” to lane ${laneIndex + 1}${timeChanged ? '; dates will update' : ''}.`
                : `Moved “${activity.name}”.`,
            );
          }
        })
        .catch((err: unknown) => {
          setPendingReposition(null);
          setConflict(err instanceof Error ? err.message : 'Couldn’t move the activity.');
        });
      return;
    }
    if (intent.kind === 'link') {
      if (!onLink) return;
      setConflict(null);
      const pred = activities.find((a) => a.id === intent.predecessorId);
      const succ = activities.find((a) => a.id === intent.successorId);
      void onLink({
        predecessorId: intent.predecessorId,
        successorId: intent.successorId,
        type: intent.type,
      })
        .then((outcome) => {
          if (outcome.conflict) setConflict(outcome.conflict);
          // Announce only when the link was actually created (never on a cycle/duplicate reject).
          if (outcome.applied) {
            announce(`Linked “${pred?.name ?? 'activity'}” to “${succ?.name ?? 'activity'}”.`);
          }
        })
        .catch((err: unknown) => {
          setConflict(err instanceof Error ? err.message : 'Couldn’t create the link.');
        });
    }
  };

  const commitCreate = (name: string): void => {
    if (!pendingCreate || !onCreate) return;
    const { startDay, endDay, laneIndex } = pendingCreate;
    setPendingCreate((p) => (p ? { ...p, saving: true, error: null } : p));
    // onCreate resolves iff the row persisted → close and never re-POST. A recalc conflict is
    // non-fatal (row kept) and shown in the banner; only a create failure keeps the popover.
    void onCreate({ name, startDay, endDay, laneIndex })
      .then((outcome) => {
        closeCreate();
        announce(`Activity “${name}” added.`);
        if (outcome.recalcConflict) setConflict(outcome.recalcConflict);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Couldn’t add the activity.';
        setPendingCreate((p) => (p ? { ...p, saving: false, error: message } : p));
      });
  };

  if (activities.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No activities to diagram yet. Add activities to this plan to see the logic diagram.
      </div>
    );
  }

  return (
    <section aria-label="Time-scaled logic diagram" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {!isCalculated
            ? 'Recalculate the schedule to plot the activities on the timeline.'
            : editingEnabled && mode === 'add-activity'
              ? 'Drag on the timeline to add an activity. Esc cancels.'
              : editingEnabled
                ? 'Drag a bar to move it in time or to another lane, or drag from a bar’s edge to link it (Shift = SS, Alt = FF); drag empty space to pan.'
                : 'Drag to pan, scroll to zoom. The critical path is highlighted.'}
        </p>
        {editingEnabled ? (
          <TsldToolbar
            mode={mode}
            onModeChange={setMode}
            onFit={() => setFitSignal((n) => n + 1)}
            fitDisabled={!showDiagram}
            {...(onAutoArrange ? { onAutoArrange: openAutoArrange } : {})}
            addActivityRef={addActivityRef}
          />
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFitSignal((n) => n + 1)}
            disabled={!showDiagram}
          >
            Fit to plan
          </Button>
        )}
        {showDiagram ? (
          <Button variant="ghost" size="sm" onClick={() => setShowHelp(true)}>
            Keyboard shortcuts
          </Button>
        ) : null}
      </div>

      {conflict ? (
        <EditConflictBanner
          message={conflict}
          onDismiss={() => setConflict(null)}
          {...(onRefresh
            ? {
                onRefresh: () => {
                  onRefresh();
                  setConflict(null);
                },
              }
            : {})}
        />
      ) : null}

      {showDiagram ? (
        <ul
          aria-label="Legend"
          className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        >
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              {'line' in item ? (
                <span aria-hidden="true" className="inline-flex h-3 w-5 items-center">
                  <span
                    className="w-full"
                    style={{
                      borderTopWidth: item.line === 'solid' ? 2 : 1.5,
                      borderTopStyle: item.line,
                      borderTopColor: 'var(--color-muted-foreground)',
                    }}
                  />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-block h-3 w-5 rounded-sm"
                  style={item.swatch}
                />
              )}
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-border relative h-[480px] overflow-hidden rounded-lg border">
        {showDiagram && dataDate ? (
          <>
            <TsldCanvas
              activities={renderActivities}
              edges={renderEdges}
              dataDate={dataDate}
              selectedId={selectedId}
              onSelect={select}
              fitSignal={fitSignal}
              editing={editingEnabled}
              mode={mode}
              canReposition={onReposition !== undefined}
              canLink={onLink !== undefined}
              onIntent={onIntent}
              onExitAddMode={() => setMode('select')}
              pending={
                pendingCreate
                  ? {
                      startDay: pendingCreate.startDay,
                      endDay: pendingCreate.endDay,
                      laneIndex: pendingCreate.laneIndex,
                    }
                  : pendingReposition
              }
            />

            {pendingCreate ? (
              <CreateActivityPopover
                x={pendingCreate.anchor.x}
                y={pendingCreate.anchor.y}
                saving={pendingCreate.saving}
                error={pendingCreate.error}
                onCommit={commitCreate}
                onCancel={closeCreate}
              />
            ) : null}

            {/*
              The accessible parallel representation: a focusable listbox mirroring the
              canvas (ADR-0026). Visually hidden — the canvas is the sighted view and rings
              the selection — but fully keyboard-operable and announced, so the diagram is
              never pointer-only. `aria-activedescendant` publishes the active option to AT;
              `sr-only` keeps the widget in the a11y tree and tab order.
            */}
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Activities in the diagram"
              tabIndex={0}
              className="sr-only"
              aria-activedescendant={selectedId ? optionId(selectedId) : undefined}
              onKeyDown={onListKeyDown}
              onFocus={() => {
                if (!selectedId && activities[0]) select(activities[0].id);
              }}
            >
              {activities.map((a) => (
                <li
                  key={a.id}
                  id={optionId(a.id)}
                  role="option"
                  aria-selected={a.id === selectedId}
                >
                  {describeActivity(a)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
            The diagram appears once the schedule has been calculated.
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmArrange}
        onClose={() => setConfirmArrange(false)}
        onConfirm={runAutoArrange}
        title="Auto-arrange lanes?"
        description="This repacks activities into the fewest lanes with no time-overlap. It changes only vertical layout, not dates — but it can’t be undone yet."
        confirmLabel="Auto-arrange"
        pendingLabel="Arranging…"
        confirmVariant="default"
        pending={arranging}
      />

      <TsldShortcutsHelp
        open={showHelp}
        onClose={() => setShowHelp(false)}
        editingEnabled={editingEnabled}
      />
    </section>
  );
}
