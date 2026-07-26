import { useState } from 'react';

import { CalendarFormDialog } from './CalendarFormDialog';

import { Button } from '@/components/ui/button';

/**
 * Header affordance that opens the create-calendar dialog. Writers only.
 *
 * Given a `projectId` (the project's Calendars section, ADR-0053 §1) the dialog offers that project
 * as the calendar's tier and defaults to it — so creating a project calendar never asks a planner to
 * re-pick the project they are already inside.
 */
export function CreateCalendarButton({
  orgSlug,
  canManageOrg = true,
  projectId,
  projectName,
  label = 'New calendar',
}: {
  orgSlug: string;
  /** The viewer holds `calendar:manage_org` — may create in the shared organisation library. */
  canManageOrg?: boolean;
  /** Opened from this project — the dialog offers and defaults to the project tier. */
  projectId?: string;
  /** That project's name, for the scope option's label. */
  projectName?: string;
  /** Button text; defaults to the org library's wording. */
  label?: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <CalendarFormDialog
        orgSlug={orgSlug}
        open={open}
        onClose={() => setOpen(false)}
        canManageOrg={canManageOrg}
        {...(projectId ? { projectId } : {})}
        {...(projectName ? { projectName } : {})}
      />
    </>
  );
}
