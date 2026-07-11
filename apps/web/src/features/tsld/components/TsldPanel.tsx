import type { ActivitySummary, DependencySummary } from '@repo/types';
import { useId, useMemo, useState } from 'react';

import { TsldCanvas } from './TsldCanvas';

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

/**
 * The Time-Scaled Logic Diagram (TSLD) panel (M8 M1, read-only — ADR-0026). Renders the
 * plan's computed schedule on a Canvas 2D surface (drag to pan, scroll to zoom, Fit to
 * frame). Because a `<canvas>` is opaque to assistive tech, the panel pairs it with a
 * **parallel focusable listbox** of the same activities: a keyboard/AT user tabs into the
 * diagram, arrows through activities (each announced with its dates/lane/criticality), and
 * selecting one rings it on the canvas — no capability is pointer-only (WCAG 2.2). The
 * activities table remains the fuller conforming alternative. Editing lands in M2.
 */
export interface TsldPanelProps {
  activities: readonly ActivitySummary[];
  dependencies: readonly DependencySummary[];
  /** The plan's start (`plannedStart`) — the diagram's day-zero origin. Null → not schedulable. */
  dataDate: string | null;
}

export function TsldPanel({
  activities,
  dependencies,
  dataDate,
}: TsldPanelProps): React.ReactElement {
  const announce = useAnnounce();
  const listboxId = useId();
  const optionId = (id: string): string => `${listboxId}-opt-${id}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);

  const renderActivities = useMemo(() => toRenderActivities(activities), [activities]);
  const renderEdges = useMemo(() => toRenderEdges(dependencies), [dependencies]);
  const isCalculated = activities.some((a) => a.earlyStart !== null);

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

  if (activities.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No activities to diagram yet. Add activities to this plan to see the logic diagram.
      </div>
    );
  }

  const showDiagram = isCalculated && dataDate !== null;

  return (
    <section aria-label="Time-scaled logic diagram" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {isCalculated
            ? 'Drag to pan, scroll to zoom. The critical path is highlighted.'
            : 'Recalculate the schedule to plot the activities on the timeline.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFitSignal((n) => n + 1)}
          disabled={!showDiagram}
        >
          Fit to plan
        </Button>
      </div>

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
        {showDiagram ? (
          <>
            <TsldCanvas
              activities={renderActivities}
              edges={renderEdges}
              dataDate={dataDate}
              selectedId={selectedId}
              onSelect={select}
              fitSignal={fitSignal}
            />

            {/*
              The accessible parallel representation: a focusable listbox mirroring the
              canvas (ADR-0026). Visually hidden — the canvas is the sighted view and rings
              the selection — but fully keyboard-operable and announced, so the diagram is
              never pointer-only. `aria-activedescendant` publishes the active option to AT;
              `sr-only` keeps the widget in the a11y tree and tab order. It only renders when
              the diagram does, so there is never an invisible-yet-focusable element.
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
