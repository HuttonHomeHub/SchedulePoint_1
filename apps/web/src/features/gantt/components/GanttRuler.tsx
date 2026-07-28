import { useMemo } from 'react';

import { buildRulerTicks } from '../layout/ruler-ticks';

/** Height of the ruler band, in pixels. */
export const RULER_HEIGHT = 34;

export interface GanttRulerProps {
  /** The chart's x = 0 date. */
  anchorIso: string;
  widthPx: number;
  pxPerDay: number;
}

/**
 * The time header above the bars.
 *
 * It sits inside the Gantt's single scroll container, so it scrolls **horizontally with the bars**
 * and sticks vertically — no synchronisation, the same structural trick the pinned grid column
 * uses.
 *
 * Level of detail is deliberate: at a wide zoom a tick per day is illegible noise, so day ticks
 * appear only once each has room to be read. Month labels are always present, because a bar chart
 * with no month boundaries cannot be read at all. That decision is the shared
 * {@link buildRulerTicks}, so the printed document places months identically.
 */
export function GanttRuler({ anchorIso, widthPx, pxPerDay }: GanttRulerProps): React.ReactElement {
  const ticks = useMemo(
    () => buildRulerTicks(anchorIso, widthPx, pxPerDay),
    [anchorIso, widthPx, pxPerDay],
  );

  return (
    <div className="relative h-full" aria-hidden="true">
      {ticks.map((tick) => (
        <div
          key={`${tick.major ? 'm' : 'd'}-${tick.x}`}
          className={
            tick.major
              ? 'border-border absolute inset-y-0 border-l'
              : 'border-border/50 absolute bottom-0 h-2 border-l'
          }
          style={{ left: tick.x }}
        >
          {tick.major ? (
            <span className="text-muted-foreground pointer-events-none absolute top-1 left-1 text-[10px] whitespace-nowrap">
              {tick.label}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
