import type { CalendarSummary } from '@repo/types';
import { useState } from 'react';

import { ResourceFormDialog } from './ResourceFormDialog';

import { Button } from '@/components/ui/button';

/** Header affordance that opens the create-resource dialog. Writers only. */
export function CreateResourceButton({
  orgSlug,
  calendars = [],
  calendarsLoading = false,
  calendarsError = false,
}: {
  orgSlug: string;
  calendars?: CalendarSummary[];
  calendarsLoading?: boolean;
  calendarsError?: boolean;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New resource</Button>
      <ResourceFormDialog
        orgSlug={orgSlug}
        open={open}
        onClose={() => setOpen(false)}
        calendars={calendars}
        calendarsLoading={calendarsLoading}
        calendarsError={calendarsError}
      />
    </>
  );
}
