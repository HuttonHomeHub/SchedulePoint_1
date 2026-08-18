import type { ActivitySummary, CalendarSummary, DependencySummary } from '@repo/types';
import type { UseQueryResult } from '@tanstack/react-query';

import { lagHoursPerDay } from '../model/lag-factor';
import {
  DEPENDENCY_TYPE_LABELS,
  LAG_CALENDAR_LABELS,
  formatLag,
} from '../schemas/dependency-schemas';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data-table';

/** Pick the "other end" of a link relative to the activity the panel is about. */
export type Endpoint = 'predecessor' | 'successor';

/**
 * One direction's links — the predecessors table or the successors table.
 *
 * Extracted from `DependencyEditor` unchanged (it was `DirectionTable`) so both the Logic **dialog**
 * and the Logic **tab** render the same table rather than two that drift.
 */
export function DependencyTable({
  query,
  endpoint,
  caption,
  emptyLabel,
  onEdit,
  onRemove,
  onNudgeLag,
  calendars = [],
  planCalendarId,
  planActivities = [],
}: {
  query: UseQueryResult<DependencySummary[]>;
  endpoint: Endpoint;
  caption: string;
  emptyLabel: string;
  onEdit?: (dependency: DependencySummary) => void;
  onRemove?: (dependency: DependencySummary) => void;
  onNudgeLag?: (dependency: DependencySummary, delta: number) => void;
  /**
   * The calendar library, the plan's calendar and the plan's activities — between them enough to
   * read each row's lag on the calendar its `lagCalendar` names (ADR-0070 M4). Absent leaves the
   * column in whole days, which is what it has always shown.
   */
  calendars?: CalendarSummary[];
  planCalendarId?: string;
  planActivities?: ActivitySummary[];
}): React.ReactElement {
  const calendarOf = (activityId: string): string | null | undefined =>
    planActivities.find((candidate) => candidate.id === activityId)?.calendarId;
  // Per ROW, not per table: `lagCalendar` is a column, so one page of a plan's logic can
  // legitimately need several different factors (the API's own note on `resolveLagDayFactorMinutes`).
  const factorFor = (dep: DependencySummary): number | undefined =>
    lagHoursPerDay(dep.lagCalendar, {
      calendars,
      ...(planCalendarId === undefined ? {} : { planCalendarId }),
      predecessorCalendarId: calendarOf(dep.predecessor.id),
      successorCalendarId: calendarOf(dep.successor.id),
    });
  const columns: Column<DependencySummary>[] = [
    {
      header: 'Activity',
      cell: (dep) => {
        const other = dep[endpoint];
        return (
          <span>
            {other.code ? (
              <span className="text-muted-foreground font-mono text-xs">{other.code} </span>
            ) : null}
            <span className="font-medium">{other.name}</span>
          </span>
        );
      },
    },
    { header: 'Type', cell: (dep) => DEPENDENCY_TYPE_LABELS[dep.type] },
    {
      header: 'Lag',
      cellClassName: 'whitespace-nowrap',
      cell: (dep) => (
        <span className="text-muted-foreground tabular-nums">
          {formatLag(dep, factorFor(dep))}
          {dep.lagCalendar === 'TWENTY_FOUR_HOUR' ? (
            // Only surface the lag calendar for 24-hour (elapsed), the one source that changes the
            // computed dates today — an elapsed wait reads very differently from a working-day lag.
            // Predecessor/Successor compute identically to the project calendar until M5, so badging
            // them here would imply a difference that doesn't yet exist (ADR-0036 §6).
            <span className="ml-1.5">· {LAG_CALENDAR_LABELS[dep.lagCalendar]}</span>
          ) : null}
        </span>
      ),
    },
    {
      // The engine-owned driving flag (M3), in text so it isn't canvas-only: a driving link is
      // the binding tie that sets this activity's (or the successor's) start. The badge carries
      // the meaning in words, never colour alone (WCAG 1.3.1/1.4.1); empty when non-driving.
      header: 'Driving',
      cell: (dep) =>
        dep.isDriving ? (
          <Badge variant="neutral">Driving</Badge>
        ) : (
          <span className="text-muted-foreground" aria-hidden="true">
            —
          </span>
        ),
    },
  ];
  if (onEdit && onRemove) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (dep) => (
        // Keyboard lag nudge (ADR-0052 M3): with a row's Edit/Remove button focused,
        // Shift+←/→ nudges THIS link's lag ±1 day — the keyboard equivalent of the canvas
        // lag-anchor drag (WCAG 2.1.1). The canvas's parallel listbox lists *activities*, so this
        // Logic panel is the app's dependencies keyboard surface and the nudge lands here (it is
        // therefore not listed in the canvas-scoped PlanShortcutsHelp; the hint above the tables
        // advertises it). Wired only when the host passes `onNudgeLag` (the direct-manipulation
        // flag + write role) — absent, the row is byte-for-byte today's.
        <div
          className="flex justify-end gap-2"
          {...(onNudgeLag
            ? {
                onKeyDown: (event: React.KeyboardEvent) => {
                  if (
                    !event.shiftKey ||
                    event.altKey ||
                    (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
                  ) {
                    return;
                  }
                  event.preventDefault();
                  onNudgeLag(dep, event.key === 'ArrowRight' ? 1 : -1);
                },
              }
            : {})}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(dep)}
            aria-label={`Edit link to ${dep[endpoint].name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove(dep)}
            aria-label={`Remove link to ${dep[endpoint].name}`}
          >
            Remove
          </Button>
        </div>
      ),
    });
  }

  return (
    <DataTable
      caption={caption}
      columns={columns}
      query={query}
      getRowKey={(dep) => dep.id}
      loadingLabel={`Loading ${caption.toLowerCase()}…`}
      errorLabel={`Couldn’t load ${caption.toLowerCase()}. Please try again.`}
      empty={
        <div className="border-border text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          {emptyLabel}
        </div>
      }
    />
  );
}
