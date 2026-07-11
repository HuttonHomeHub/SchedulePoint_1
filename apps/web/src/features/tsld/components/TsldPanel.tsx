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
 * The Time-Scaled Logic Diagram (TSLD) panel (M8 M1, read-only — ADR-0026). Renders the
 * plan's computed schedule on a Canvas 2D surface (drag to pan, scroll to zoom, Fit to
 * frame). Because a `<canvas>` is opaque to assistive tech, the panel pairs it with a
 * **parallel focusable listbox** of the same activities: a keyboard/AT user tabs into the
 * diagram, arrows through activities (each announced with its dates/lane/criticality), and
 * selecting one rings it on the canvas — no capability is pointer-only (WCAG 2.2). The
 * activities table remains the fuller conforming alternative. Editing lands in M2.
 */
export function TsldPanel({
  activities,
  dependencies,
  dataDate,
}: {
  activities: readonly ActivitySummary[];
  dependencies: readonly DependencySummary[];
  /** The plan's start (`plannedStart`) — the diagram's day-zero origin. Null → not schedulable. */
  dataDate: string | null;
}): React.ReactElement {
  const announce = useAnnounce();
  const listboxId = useId();
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

  return (
    <section aria-label="Time-scaled logic diagram" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {isCalculated
            ? 'Drag to pan, scroll to zoom. The critical path is highlighted.'
            : 'Recalculate the schedule to plot the activities on the timeline.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => setFitSignal((n) => n + 1)}>
          Fit to plan
        </Button>
      </div>

      <div className="border-border relative h-[480px] overflow-hidden rounded-lg border">
        {isCalculated && dataDate ? (
          <TsldCanvas
            activities={renderActivities}
            edges={renderEdges}
            dataDate={dataDate}
            selectedId={selectedId}
            onSelect={select}
            fitSignal={fitSignal}
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
            The diagram appears once the schedule has been calculated.
          </div>
        )}

        {/*
          The accessible parallel representation: a focusable listbox mirroring the canvas
          (ADR-0026). Visually hidden — the canvas is the sighted view and rings the
          selection — but fully keyboard-operable and announced, so the diagram is never
          pointer-only. `sr-only` keeps it in the a11y tree and tab order.
        */}
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Activities in the diagram"
          tabIndex={0}
          className="sr-only"
          onKeyDown={onListKeyDown}
          onFocus={() => {
            if (!selectedId && activities[0]) select(activities[0].id);
          }}
        >
          {activities.map((a) => (
            <li key={a.id} role="option" aria-selected={a.id === selectedId}>
              {describeActivity(a)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
