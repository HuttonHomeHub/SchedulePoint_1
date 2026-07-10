import { useState } from 'react';

import { ActivityFormDialog } from './ActivityFormDialog';

import { Button } from '@/components/ui/button';

/** Header affordance that opens the create-activity dialog for a plan. Writers only. */
export function CreateActivityButton({
  orgSlug,
  planId,
}: {
  orgSlug: string;
  planId: string;
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
      />
    </>
  );
}
