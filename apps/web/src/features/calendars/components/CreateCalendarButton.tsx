import { useState } from 'react';

import { CalendarFormDialog } from './CalendarFormDialog';

import { Button } from '@/components/ui/button';

/** Header affordance that opens the create-calendar dialog. Writers only. */
export function CreateCalendarButton({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New calendar</Button>
      <CalendarFormDialog orgSlug={orgSlug} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
