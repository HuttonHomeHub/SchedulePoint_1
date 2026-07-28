import { addCalendarDays, daysBetween } from '@/features/tsld/render/render-model';

/** Below this many pixels per day a per-day tick is unreadable, so only months are labelled. */
export const DAY_TICK_MIN_PX = 14;

export interface RulerTick {
  /** Offset from the chart's left edge, in pixels. */
  x: number;
  /** Month label; empty for a day tick. */
  label: string;
  /** A month boundary — full-height, labelled. Otherwise a short day tick. */
  major: boolean;
}

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Where the ticks go on a Gantt time axis: month boundaries always, day boundaries once they are
 * far enough apart to read.
 *
 * Pure, and shared by the on-screen ruler and the print document — the two surfaces style ticks
 * differently (paper is forced light, the screen is theme-aware) but they must agree on *where a
 * month starts*. Two implementations of that is how two views end up disagreeing about a date.
 *
 * Iteration is bounded by the rendered width, not by the plan's duration, so a ten-year programme
 * costs the same as a ten-week one — the horizontal extent is what is drawn.
 */
export function buildRulerTicks(anchorIso: string, widthPx: number, pxPerDay: number): RulerTick[] {
  if (widthPx <= 0 || pxPerDay <= 0) return [];

  const totalDays = Math.ceil(widthPx / pxPerDay);
  const showDays = pxPerDay >= DAY_TICK_MIN_PX;
  const ticks: RulerTick[] = [];

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
