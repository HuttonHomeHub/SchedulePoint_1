import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';

import type { GanttSortKey } from './row-model';

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
  value: (activity: ActivitySummary, source?: BarDateSource) => string;
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
