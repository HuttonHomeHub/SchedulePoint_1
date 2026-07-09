import { useState } from 'react';

import { ProjectFormDialog } from './ProjectFormDialog';

import { Button } from '@/components/ui/button';

/** Header affordance that opens the create-project dialog for a client. Writers only. */
export function CreateProjectButton({
  orgSlug,
  clientId,
}: {
  orgSlug: string;
  clientId: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New project</Button>
      <ProjectFormDialog
        orgSlug={orgSlug}
        clientId={clientId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
