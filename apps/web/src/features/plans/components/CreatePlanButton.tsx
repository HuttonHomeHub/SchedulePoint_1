import { useState } from 'react';

import { PlanFormDialog } from './PlanFormDialog';

import { Button } from '@/components/ui/button';

/** Header affordance that opens the create-plan dialog for a project. Writers only. */
export function CreatePlanButton({
  orgSlug,
  projectId,
}: {
  orgSlug: string;
  projectId: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>New plan</Button>
      <PlanFormDialog
        orgSlug={orgSlug}
        projectId={projectId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
