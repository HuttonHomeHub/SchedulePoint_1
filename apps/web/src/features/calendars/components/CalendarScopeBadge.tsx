import type { CalendarSummary } from '@repo/types';

import { CALENDAR_SCOPE_LABELS } from '../schemas/calendar-schemas';

import { Badge } from '@/components/ui/badge';

/**
 * Which tier a calendar belongs to (ADR-0053 §1), as a pill: **Organisation** for the shared
 * library, or **Project** for one project — named where the name is known.
 *
 * The tier is carried by the pill's *text*, never by its colour (WCAG 1.4.1 — colour is never the
 * sole signal), so both tiers use the same neutral token and differ only in what they say. The
 * project name is appended to the visible label rather than hidden in a `title`, because a
 * tooltip is unreachable by keyboard and by touch.
 */
export function CalendarScopeBadge({
  calendar,
  projectName,
}: {
  calendar: Pick<CalendarSummary, 'scope' | 'projectId'>;
  /**
   * The owning project's name for a PROJECT-scoped calendar, when the composing screen could
   * resolve it. Absent (still loading, or the project is not in reach) ⇒ the pill reads just
   * "Project" — honest, never a blank or a raw id.
   */
  projectName?: string | undefined;
}): React.ReactElement {
  const label =
    calendar.scope === 'PROJECT' && projectName
      ? `${CALENDAR_SCOPE_LABELS.PROJECT}: ${projectName}`
      : CALENDAR_SCOPE_LABELS[calendar.scope];

  return (
    <Badge variant="neutral" size="sm">
      {label}
    </Badge>
  );
}
