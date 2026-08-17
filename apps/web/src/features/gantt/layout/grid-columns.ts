import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';

import type { GanttSortKey } from './row-model';

// From the domain module that owns the activity, the established shape here — `row-model.ts` already
// reaches into `@/features/wbs` for `deriveWbsGroups`, whose docblock calls itself "the ONE
// definition" consumed by both the Gantt and the canvas band. A second duration read-out is exactly
// the drift `bar-dates.ts` was created to end, one field along: this formatter already carries
// ADR-0070 M4's rule that a whole-day value prints the row's OWN `durationDays` rather than
// re-deriving it, and a fresh implementation would have re-learnt that by shipping `0 d`.
import { formatDurationRead } from '@/features/activities/model/duration-field';
import { isMilestoneType } from '@/features/activities/schemas/activity-schemas';
import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';
import { formatCalendarDate } from '@/lib/format-date';

/**
 * What the Gantt's identity/date grid says, for every surface that renders one.
 *
 * Shared between the on-screen panel and the print document so there is exactly ONE answer to
 * "what does the Start cell read?". Two copies would drift, and the printed programme is the
 * artefact people take into a meeting and hold the project to.
 *
 * Widths are per-surface (paper and a scrolling viewport want different ones), so they live with
 * their surface; only the semantics live here.
 */
export interface GanttColumn {
  key: GanttSortKey;
  label: string;
  align?: 'right';
  /**
   * The cell's text for an activity — also the accessible content, never derived from the bar.
   *
   * `source` is the same {@link BarDateSource} the bars are drawn from (ADR-0033), defaulting to
   * `early` so every EARLY-mode plan and every existing caller is unchanged. It is a **parameter
   * rather than a second date lookup** because the cells are the accessible carrier: this docblock
   * has always said the bar is decorative reinforcement, and until 2026-08-17 a VISUAL plan's Start
   * cell printed January beside a bar drawn in February — the contradiction visible on one screen
   * (`docs/TECH_DEBT.md` #135).
   */
  value: (activity: ActivitySummary, source?: BarDateSource, hoursPerDay?: number) => string;
}

/**
 * Every visual encoding on the chart has a text equivalent here. A screen-reader user reads dates
 * and float from these cells; the bar is decorative reinforcement, not the only carrier (spec
 * GV-3). That is what makes a bar chart usable without sight of it — and what makes the printed
 * version legible in black and white.
 */
export const GANTT_COLUMNS: readonly GanttColumn[] = [
  { key: 'code', label: 'Code', value: (a) => a.code ?? '—' },
  { key: 'name', label: 'Activity', value: (a) => a.name },
  {
    key: 'duration',
    label: 'Duration',
    align: 'right',
    /**
     * The field this epic centres on (spec F6), and the Gantt had no column for it at all — a
     * planner comparing two bars had to open each activity to learn which was longer.
     *
     * `hoursPerDay` is the activity's own calendar factor (ADR-0068), resolved by the HOST and
     * passed down, never looked up here: a pure column module has no business fetching calendars,
     * and ADR-0089 D2b makes host-resolution the rule for a cross-scope fact. Absent, the read-out
     * degrades to whole working days — the same code path as `VITE_SUB_DAY_DURATIONS` off, so the
     * rollback contract and the not-yet-loaded state cannot rot separately (ADR-0070).
     *
     * A milestone reads an em dash, not `0 d`. It genuinely has no duration, and ADR-0070 M4
     * records `0 d` being printed for real sub-day work — so the two states looked identical on the
     * one screen listing a plan's work. Printing `0 d` here would re-create that on a second screen.
     */
    value: (a, _source, hoursPerDay) =>
      isMilestoneType(a.type) ? '—' : formatDurationRead(a, hoursPerDay),
  },
  {
    key: 'earlyStart',
    label: 'Start',
    value: (a, source) => {
      const { start } = barDatesFor(a, source);
      return start === null ? '—' : formatCalendarDate(start);
    },
  },
  {
    key: 'earlyFinish',
    label: 'Finish',
    value: (a, source) => {
      const { finish } = barDatesFor(a, source);
      return finish === null ? '—' : formatCalendarDate(finish);
    },
  },
  {
    key: 'totalFloat',
    label: 'Float',
    align: 'right',
    value: (a) => (a.totalFloat === null ? '—' : `${a.totalFloat}d`),
  },
];

/**
 * The variance readout, shown only when a baseline is active. Signed and unit-suffixed so the
 * direction is unambiguous in text — a ghost bar alone says "different", not "later" (spec GV-3:
 * every visual encoding needs a text equivalent).
 */
export function varianceText(row: BaselineVarianceRow | undefined): string {
  // No row at all is NOT the same fact as "added since the baseline". The API returns a row per
  // activity when a baseline is active, so an absent one means we were not told — and claiming
  // "New" for it would invent a comparison we do not have.
  if (row === undefined) return '—';
  if (!row.inBaseline) return 'New';
  const days = row.startVarianceDays;
  if (days === null) return '—';
  if (days === 0) return 'On plan';
  return days > 0 ? `+${days}d late` : `${days}d early`;
}
