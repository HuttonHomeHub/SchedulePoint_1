import type { ActivitySummary } from '@repo/types';

import { activityLabel } from '../render/a11y';

import { ACTIVITY_STATUS_LABELS } from '@/lib/activity-status-labels';
import { barDatesFor, type BarDateSource } from '@/lib/bar-dates';
import { formatCalendarDate } from '@/lib/format-date';
import { criticality, formatFloat } from '@/lib/schedule-format';

/** One labelled fact; `note` rides beside the value (the criticality rung beside the float). */
export interface SelectedActivityFact {
  label: string;
  value: string;
  note?: string;
}

export interface SelectedActivityFacts {
  /** Who this is: the listbox option's own identity, so the line and the spoken sentence agree. */
  subject: string;
  /** False when the drawn start is null (a plan never calculated): the dates and float are absent
   * and the line says "Not yet scheduled" in their place; Progress and Status are still listed. */
  scheduled: boolean;
  facts: SelectedActivityFact[];
}

type FactsSource = Pick<
  ActivitySummary,
  | 'code'
  | 'name'
  | 'type'
  | 'earlyStart'
  | 'earlyFinish'
  | 'lateStart'
  | 'lateFinish'
  | 'visualEffectiveStart'
  | 'visualEffectiveFinish'
  | 'totalFloat'
  | 'isCritical'
  | 'isNearCritical'
  | 'percentComplete'
  | 'status'
>;

/**
 * **What a share-link guest reads when they select an activity** (`docs/specs/guest-activity-details/`
 * §4.3). Pure, and read only from fields the guest payload already carries (ADR-0051 §4), so nothing
 * here can widen what a guest is sent.
 *
 * Start and Finish are the **drawn** span, resolved by `barDatesFor` under the panel's own
 * `barDateSource`: the bar, the spoken option sentence and this line must give one answer, and the
 * network's early dates are not it once a bar has been placed (ADR-0163). Float is `totalFloat`, the
 * editor's "Total float"; `remainingFloat` ("float left") is never sent to a guest (ADR-0163), so
 * this line cannot show it. Criticality sits beside the float rather than under "Status", because
 * "Status" means progress here, as in the CSV.
 */
export function selectedActivityFacts(
  activity: FactsSource,
  barDateSource: BarDateSource,
  withCodes = false,
): SelectedActivityFacts {
  const subject = activityLabel(activity, withCodes);
  const { start, finish } = barDatesFor(activity, barDateSource);
  const facts: SelectedActivityFact[] = [];
  const scheduled = start !== null;
  if (start === null) {
    // Nothing is drawn, so there are no dates and no float to give: the caller says why instead.
  } else if (finish === null || finish === start) {
    // A milestone starts and finishes on one day: one "Date", as the spoken sentence gives one date.
    facts.push({ label: 'Date', value: formatCalendarDate(start) });
  } else {
    facts.push({ label: 'Start', value: formatCalendarDate(start) });
    facts.push({ label: 'Finish', value: formatCalendarDate(finish) });
  }

  // A WBS summary's float is 0 by convention (ADR-0197), and "Total float 0 d" would present a
  // convention as a measurement; an uncalculated float has nothing to say.
  if (scheduled && activity.type !== 'WBS_SUMMARY' && activity.totalFloat !== null) {
    const rung = criticality(activity);
    facts.push({
      label: 'Total float',
      value: formatFloat(activity.totalFloat),
      ...(rung ? { note: rung.label } : {}),
    });
  }

  facts.push({ label: 'Progress', value: `${activity.percentComplete}%` });
  facts.push({ label: 'Status', value: ACTIVITY_STATUS_LABELS[activity.status] });
  return { subject, scheduled, facts };
}
