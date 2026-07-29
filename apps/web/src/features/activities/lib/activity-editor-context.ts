import type { ActivitySummary } from '@repo/types';

import { formatCalendarDate } from '@/lib/format-date';
import { criticality, formatFloat } from '@/lib/schedule-format';

/**
 * A fact the editor's context strip reports. `tone` drives an optional accent; `text` always
 * carries the meaning on its own (WCAG 1.4.1), which is why the caller renders the text and treats
 * the tone as decoration.
 */
export interface EditorContextFact {
  label: string;
  text: string;
  tone?: 'critical' | 'warning';
}

/**
 * What the activity editor shows *above* its fields: the computed schedule the edit is about
 * (ADR-0061 §2).
 *
 * The editor used to show none of this. A planner setting a constraint could not see the dates the
 * constraint was moving, so "did that do what I wanted?" was answered by closing the dialog and
 * reading the table — which is also the moment the answer stops being about the edit they just
 * made. These are the five numbers a planner checks, in the order they check them.
 *
 * **Uncalculated is a state, not a blank.** Before a plan's first recalculation every CPM column is
 * null, and a strip of five em dashes reads as breakage. So the whole strip is withheld and the
 * caller says why — `facts` is empty exactly when `earlyStart` is null.
 */
export function activityContextFacts(activity: ActivitySummary): EditorContextFact[] {
  if (activity.earlyStart === null) return [];

  const badge = criticality(activity);
  const facts: EditorContextFact[] = [
    { label: 'Early start', text: formatCalendarDate(activity.earlyStart) },
    { label: 'Early finish', text: formatCalendarDate(activity.earlyFinish) },
    {
      label: 'Total float',
      text: formatFloat(activity.totalFloat),
      ...(badge ? { tone: badge.variant } : {}),
    },
  ];

  // Free float earns its place only when it differs from total float. Showing "0 d / 0 d" twice
  // teaches a reader that the two columns are the same thing, which is the opposite of true.
  if (activity.freeFloat !== null && activity.freeFloat !== activity.totalFloat) {
    facts.push({ label: 'Free float', text: formatFloat(activity.freeFloat) });
  }

  facts.push({
    label: 'Progress',
    text: `${activity.percentComplete}%`,
  });

  if (badge) facts.push({ label: 'Status', text: badge.label, tone: badge.variant });

  return facts;
}

/**
 * The one-line identity under the editor's title — code, type and duration.
 *
 * Separate from the facts above because it is not computed and never changes while the dialog is
 * open: it says *which* activity this is, where the strip says *where it sits*.
 */
export function activitySubtitle(activity: ActivitySummary, typeLabel: string): string {
  const parts = [activity.code, typeLabel];
  // A milestone has no duration, and "0 working days" invites the reader to wonder what went wrong.
  if (activity.durationDays > 0) {
    parts.push(`${activity.durationDays} working ${activity.durationDays === 1 ? 'day' : 'days'}`);
  }
  return parts.filter(Boolean).join(' · ');
}
