import type { ActivitySummary, CalendarSummary } from '@repo/types';
import { useState } from 'react';

import { ActivityFormDialog } from './ActivityFormDialog';

import { Button } from '@/components/ui/button';

/**
 * Header affordance that opens the create-activity dialog for a plan. Writers only. The org
 * calendars (for the calendar picker, ADR-0037) and the plan's activities (the pool the WBS parent
 * picker draws summaries from, ADR-0038) are route-composed and passed straight through to the dialog
 * — this feature never fetches another feature's query itself, and reuses the route's warm activities
 * query (including its loading/error state, so the parent picker distinguishes the two honestly).
 */
export function CreateActivityButton({
  orgSlug,
  planId,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
  planCalendarId,
  planActivities = [],
  planActivitiesLoading = false,
  planActivitiesError = false,
}: {
  orgSlug: string;
  planId: string;
  calendars?: CalendarSummary[];
  calendarsLoading?: boolean;
  calendarsError?: boolean;
  /**
   * The plan's own calendar — what a new activity's empty `calendarId` ("inherit") resolves to, and
   * so the working-hours factor its duration field reads (ADR-0070 §3). Absent leaves that field in
   * whole working days, which is why it was missing here for a milestone: the field rendered, looked
   * right, and quietly refused `4h` on the one surface where every activity is first created.
   */
  planCalendarId?: string;
  /** The plan's activities (the dialog derives WBS summaries from these), for the parent picker. */
  planActivities?: ActivitySummary[];
  planActivitiesLoading?: boolean;
  planActivitiesError?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New activity</Button>
      <ActivityFormDialog
        orgSlug={orgSlug}
        planId={planId}
        open={open}
        onClose={() => setOpen(false)}
        calendars={calendars}
        {...(planCalendarId === undefined ? {} : { planCalendarId })}
        calendarsLoading={calendarsLoading}
        calendarsError={calendarsError}
        planActivities={planActivities}
        planActivitiesLoading={planActivitiesLoading}
        planActivitiesError={planActivitiesError}
      />
    </>
  );
}
