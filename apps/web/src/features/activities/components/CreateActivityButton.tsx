import type { CalendarSummary } from '@repo/types';
import { useState } from 'react';

import { ActivityFormDialog } from './ActivityFormDialog';

import { Button } from '@/components/ui/button';

/**
 * Header affordance that opens the create-activity dialog for a plan. Writers only. The org
 * calendars (for the calendar picker, ADR-0037) are route-composed and passed straight through to
 * the dialog — this feature never fetches the calendars feature's query itself.
 */
export function CreateActivityButton({
  orgSlug,
  planId,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
}: {
  orgSlug: string;
  planId: string;
  calendars?: CalendarSummary[];
  calendarsLoading?: boolean;
  calendarsError?: boolean;
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
        calendarsLoading={calendarsLoading}
        calendarsError={calendarsError}
      />
    </>
  );
}
