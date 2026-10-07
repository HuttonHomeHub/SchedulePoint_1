import { addCalendarDays, daysBetween } from '@/features/tsld/render/render-model';

/** Below this many pixels per day a per-day tick is unreadable, so only months are labelled. */
export const DAY_TICK_MIN_PX = 14;

export interface RulerTick {
  /** Offset from the chart's left edge, in pixels. */
  x: number;
  /** Month label; empty for a day tick and for a month line the zoom leaves unlabelled. */
  label: string;
  /** A month boundary — a full-height line, labelled only when there is room. Otherwise a short day tick. */
  major: boolean;
}

/**
 * The least pixel distance between two month labels' left edges. The widest label is "Sept 2027"
 * (en-GB spells September with four letters): nine glyphs at the `text-micro` size (10 px) average
 * about 5.5 px, so roughly 50 px, plus the 4 px `left-1` inset the label sits at, plus a gap of
 * about 10 px so neighbours read as two words rather than one string. Reasoned from the type size,
 * not measured in a browser. The chosen step is judged on an average month, and a 59-day pair is
 * 3% shorter than that, which the gap absorbs.
 */
export const MONTH_LABEL_MIN_PITCH_PX = 64;

/** Average days in a Gregorian month and year — the labelling step is a zoom decision, not a date. */
const AVG_MONTH_DAYS = 30.44;
const AVG_YEAR_DAYS = 365.25;

/** Candidate label steps, smallest first: every N months, then every k-th January. */
const MONTH_STEPS = [1, 2, 3, 6, 12] as const;
const YEAR_STEPS = [1, 2, 5, 10] as const;

const MONTH_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Which month starts earn a label at this zoom: every `months`-th calendar month, or, past a year,
 * every `years`-th January. Aligned to the calendar (Jan/Apr/Jul/Oct for a quarter) rather than
 * counted from the first visible month, so labels stay put while the chart scrolls.
 */
function labelStep(pxPerDay: number): { months: number; years: number } {
  for (const months of MONTH_STEPS) {
    if (months * AVG_MONTH_DAYS * pxPerDay >= MONTH_LABEL_MIN_PITCH_PX) {
      return { months, years: 1 };
    }
  }
  // Even a yearly label collides: thin the Januaries, and accept the last step if nothing fits.
  const years =
    YEAR_STEPS.find((k) => k * AVG_YEAR_DAYS * pxPerDay >= MONTH_LABEL_MIN_PITCH_PX) ??
    YEAR_STEPS[YEAR_STEPS.length - 1]!;
  return { months: 12, years };
}

/**
 * Where the ticks go on a Gantt time axis: a line at every month boundary, a label on as many of
 * them as fit (see {@link MONTH_LABEL_MIN_PITCH_PX}), and day boundaries once they are far enough
 * apart to read. Labelling every month at any zoom overprinted the names into one string once a
 * plan of a year or more was fitted to the window.
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
  const step = labelStep(pxPerDay);
  const ticks: RulerTick[] = [];

  for (let day = 0; day <= totalDays; day += 1) {
    const iso = addCalendarDays(anchorIso, day);
    const isMonthStart = iso.endsWith('-01');
    if (isMonthStart) {
      const year = Number(iso.slice(0, 4));
      const monthIndex = Number(iso.slice(5, 7)) - 1;
      const labelled = monthIndex % step.months === 0 && year % step.years === 0;
      ticks.push({
        x: daysBetween(anchorIso, iso) * pxPerDay,
        label: labelled ? MONTH_FORMAT.format(new Date(`${iso}T00:00:00Z`)) : '',
        major: true,
      });
    } else if (showDays) {
      ticks.push({ x: day * pxPerDay, label: '', major: false });
    }
  }

  return ticks;
}
