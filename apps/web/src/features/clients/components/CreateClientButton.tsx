import { useState } from 'react';

import { ClientFormDialog } from './ClientFormDialog';

import { Button } from '@/components/ui/button';

/** Header affordance that opens the create-client dialog. Writers only. */
export function CreateClientButton({ orgSlug }: { orgSlug: string }): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New client</Button>
      <ClientFormDialog orgSlug={orgSlug} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
