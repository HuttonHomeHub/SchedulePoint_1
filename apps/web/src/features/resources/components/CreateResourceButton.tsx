import type { CalendarSummary } from '@repo/types';
import { useState } from 'react';

import { useResources } from '../api/use-resources';

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
  // **The groups the dialog's parent picker offers.** Without them the picker renders, looks
  // correct, and can only ever say "No group (top level)" — so a resource could not be filed into
  // a group at the moment it is created, only by editing it afterwards. `ResourcesTable` passed
  // its list to the EDIT dialog and this host passed nothing to the same component: one correct
  // pattern applied to one neighbour and not the other, which is the shape this register keeps
  // recording (ADR-0064 §7, ADR-0080's bulk bar). Found by the ADR-0097 F1 coarse-pointer harness,
  // which refused to report an option count of 1 as a measurement.
  //
  // A `kind: 'GROUP'` read rather than the table's: the table's list is narrowed by the screen's
  // URL filters, so filtering the library to Equipment would have emptied the picker. Groups are a
  // small minority of the library, and the query is only mounted where the button is.
  const groups = useResources(orgSlug, { kind: 'GROUP' }, open);
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
        resources={groups.data ?? []}
      />
    </>
  );
}
