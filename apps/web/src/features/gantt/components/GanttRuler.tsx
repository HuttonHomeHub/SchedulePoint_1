import { useMemo } from 'react';

import { addCalendarDays, daysBetween } from '@/features/tsld/render/render-model';

/** Height of the ruler band, in pixels. */
export const RULER_HEIGHT = 34;

/** Below this many pixels per day a per-day tick is unreadable, so only months are labelled. */
const DAY_TICK_MIN_PX = 14;

export interface GanttRulerProps {
  /** The chart's x = 0 date. */
  anchorIso: string;
  widthPx: number;
  pxPerDay: number;
}

interface Tick {
  x: number;
  label: string;
  major: boolean;
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
 * with no month boundaries cannot be read at all.
 */
export function GanttRuler({ anchorIso, widthPx, pxPerDay }: GanttRulerProps): React.ReactElement {
  const ticks = useMemo(
    () => buildTicks(anchorIso, widthPx, pxPerDay),
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

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Month boundaries always; day boundaries once they are far enough apart to read.
 *
 * Iteration is bounded by the rendered width, not by the plan's duration, so a ten-year programme
 * costs the same as a ten-week one — the horizontal extent is what is on screen.
 */
function buildTicks(anchorIso: string, widthPx: number, pxPerDay: number): Tick[] {
  if (widthPx <= 0 || pxPerDay <= 0) return [];

  const totalDays = Math.ceil(widthPx / pxPerDay);
  const showDays = pxPerDay >= DAY_TICK_MIN_PX;
  const ticks: Tick[] = [];

  for (let day = 0; day <= totalDays; day += 1) {
    const iso = addCalendarDays(anchorIso, day);
    const isMonthStart = iso.endsWith('-01');
    if (isMonthStart) {
      ticks.push({
        x: daysBetween(anchorIso, iso) * pxPerDay,
        label: MONTH_FORMAT.format(new Date(`${iso}T00:00:00Z`)),
        major: true,
      });
    } else if (showDays) {
      ticks.push({ x: day * pxPerDay, label: '', major: false });
    }
  }

  return ticks;
}
