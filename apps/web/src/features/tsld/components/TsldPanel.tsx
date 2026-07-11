import type { ActivitySummary, DependencySummary } from '@repo/types';
import { useId, useMemo, useRef, useState } from 'react';

import { TSLD_EDITING_ENABLED } from '../../../config/env';
import type { EditIntent, EditMode } from '../interaction/gesture-machine';
import { daysBetween, type Point } from '../render/render-model';

import { CreateActivityPopover } from './CreateActivityPopover';
import { EditConflictBanner } from './EditConflictBanner';
import { TsldCanvas, type PendingGhost } from './TsldCanvas';
import { TsldToolbar } from './TsldToolbar';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import type { RenderActivity, RenderEdge } from '@/features/tsld/render/render-model';
import { formatCalendarDate } from '@/lib/format-date';

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
  }));
}

/** A screen-reader description of an activity's place in the schedule. */
function describeActivity(a: ActivitySummary): string {
  const name = a.code ? `${a.code} ${a.name}` : a.name;
  if (a.earlyStart === null) return `${name}, not yet scheduled`;
  const dates =
    a.earlyFinish && a.earlyFinish !== a.earlyStart
      ? `${formatCalendarDate(a.earlyStart)} to ${formatCalendarDate(a.earlyFinish)}`
      : formatCalendarDate(a.earlyStart);
  const flag = a.isCritical ? ', critical' : a.isNearCritical ? ', near-critical' : '';
  return `${name}, ${dates}, lane ${a.laneIndex + 1}${flag}`;
}

/**
 * The visible key for the diagram, mirroring the canvas exactly: each activity class is a
 * fill colour **paired with an outline style** (solid / dashed / none) so criticality is
 * never conveyed by colour alone (WCAG 1.4.1). Swatches read their colours from the same
 * design tokens the painter uses, so the key stays truthful across themes.
 */
const LEGEND: ReadonlyArray<{ label: string; swatch: React.CSSProperties }> = [
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

/** A committed reposition — a horizontal move mapped to an SNET constraint at the new start. */
export interface TsldRepositionInput {
  activityId: string;
  startDay: number;
}

/**
 * The outcome of a reposition. It **resolves** for both success and a conflict; a genuine
 * failure rejects. `applied` says whether the move actually landed — false for a stale-version
 * 409 (nothing changed), true when it landed (even if the follow-up recalc then failed) — so
 * the "Moved …" status is announced only when it's true. `conflict` is the banner message.
 */
export interface TsldRepositionOutcome {
  applied: boolean;
  conflict: string | null;
}

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
 * in time (an SNET reposition). Both show an instant optimistic ghost; the route owns the write
 * + authoritative recalc, and a stale-version 409 surfaces as a non-destructive conflict banner.
 * With editing off the surface is byte-for-byte the M1 read-only diagram.
 */
export function TsldPanel({
  activities,
  dependencies,
  dataDate,
  canEdit = false,
  onCreate,
  onReposition,
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
  const [conflict, setConflict] = useState<string | null>(null);
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

  const onListKeyDown = (event: React.KeyboardEvent): void => {
    if (activities.length === 0) return;
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
      // Optimistic ghost of the moved bar (kept until the authoritative recalc lands).
      const span =
        activity.earlyStart && activity.earlyFinish
          ? daysBetween(activity.earlyStart, activity.earlyFinish)
          : 0;
      setPendingReposition({
        startDay: intent.startDay,
        endDay: intent.startDay + span,
        laneIndex: activity.laneIndex,
      });
      void onReposition({ activityId: intent.activityId, startDay: intent.startDay })
        .then((outcome) => {
          setPendingReposition(null);
          if (outcome.conflict) setConflict(outcome.conflict);
          // Announce "Moved" only when the move actually landed, so it never contradicts a
          // "wasn't applied" conflict banner (WCAG 4.1.3).
          if (outcome.applied) announce(`Moved “${activity.name}”.`);
        })
        .catch((err: unknown) => {
          setPendingReposition(null);
          setConflict(err instanceof Error ? err.message : 'Couldn’t move the activity.');
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
                ? 'Drag a bar to move it; drag empty space to pan, scroll to zoom.'
                : 'Drag to pan, scroll to zoom. The critical path is highlighted.'}
        </p>
        {editingEnabled ? (
          <TsldToolbar
            mode={mode}
            onModeChange={setMode}
            onFit={() => setFitSignal((n) => n + 1)}
            fitDisabled={!showDiagram}
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
      </div>

      {conflict ? (
        <EditConflictBanner message={conflict} onDismiss={() => setConflict(null)} />
      ) : null}

      {showDiagram ? (
        <ul
          aria-label="Legend"
          className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        >
          {LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-5 rounded-sm"
                style={item.swatch}
              />
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
    </section>
  );
}
