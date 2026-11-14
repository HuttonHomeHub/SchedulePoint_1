import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { PlanFormDialog } from './PlanFormDialog';

import { Button } from '@/components/ui/button';

/**
 * Header affordance that opens the create-plan dialog for a project. Writers only. A created plan
 * is opened, as the Explorer's create does (`navigator-crud.tsx`): the planner asked for a plan to
 * work in, and the project page they were left on still read "0 plans".
 */
export function CreatePlanButton({
  orgSlug,
  projectId,
}: {
  orgSlug: string;
  projectId: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <Button onClick={() => setOpen(true)}>New plan</Button>
      <PlanFormDialog
        orgSlug={orgSlug}
        projectId={projectId}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(plan) => {
          void navigate({
            to: '/orgs/$orgSlug/plans/$planId',
            params: { orgSlug, planId: plan.id },
          });
        }}
      />
    </>
  );
}
