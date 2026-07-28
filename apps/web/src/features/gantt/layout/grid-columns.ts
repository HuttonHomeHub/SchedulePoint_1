import type { ActivitySummary, BaselineVarianceRow } from '@repo/types';

import type { GanttSortKey } from './row-model';

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
  /** The cell's text for an activity — also the accessible content, never derived from the bar. */
  value: (activity: ActivitySummary) => string;
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
    value: (a) => (a.earlyStart === null ? '—' : formatCalendarDate(a.earlyStart)),
  },
  {
    key: 'earlyFinish',
    label: 'Finish',
    value: (a) => (a.earlyFinish === null ? '—' : formatCalendarDate(a.earlyFinish)),
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
