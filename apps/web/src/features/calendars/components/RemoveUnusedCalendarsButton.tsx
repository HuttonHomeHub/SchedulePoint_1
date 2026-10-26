import type { UnusedCalendar } from '@repo/types';
import { useState } from 'react';

import { useUnusedProjectCalendars } from '../api/use-calendars';

import { RemoveUnusedCalendarsDialog } from './RemoveUnusedCalendarsDialog';

import { Button } from '@/components/ui/button';
import { useContainerUnmountHandoff } from '@/components/ui/use-container-unmount-handoff';

/**
 * **Remove unused calendars…** on the project's calendar section (ADR-0208 D5). Rendered only when
 * the project has an own calendar nothing uses; the list it reads is the same one the dialog shows.
 */
export function RemoveUnusedCalendarsButton({
  orgSlug,
  projectId,
  projectName,
  focusTarget,
}: {
  orgSlug: string;
  projectId: string;
  projectName: string;
  /** Takes focus if this button goes away because the last unused calendar was deleted. */
  focusTarget: () => HTMLElement | null;
}): React.ReactElement | null {
  const unused = useUnusedProjectCalendars(orgSlug, projectId);
  const calendars = unused.data ?? [];
  if (calendars.length === 0) return null;
  return (
    <RemoveUnusedCalendarsControl
      orgSlug={orgSlug}
      projectName={projectName}
      calendars={calendars}
      focusTarget={focusTarget}
    />
  );
}

/**
 * The button and its dialog, mounted only while there is something to remove.
 *
 * Deleting the last unused calendar unmounts this, and a native `<dialog>` restores focus to a
 * control that is gone. So this component, not its parent, owns the hand-off: its wrapper hands
 * focus to `focusTarget` when it goes, and the dialog has already announced the result (ADR-0135).
 */
function RemoveUnusedCalendarsControl({
  orgSlug,
  projectName,
  calendars,
  focusTarget,
}: {
  orgSlug: string;
  projectName: string;
  calendars: UnusedCalendar[];
  focusTarget: () => HTMLElement | null;
}): React.ReactElement {
  const [opening, setOpening] = useState(0);
  const [open, setOpen] = useState(false);
  const { wrapperProps } = useContainerUnmountHandoff({ target: focusTarget });

  return (
    <div {...wrapperProps}>
      <Button
        variant="outline"
        onClick={() => {
          setOpening((previous) => previous + 1);
          setOpen(true);
        }}
      >
        Remove unused calendars…
      </Button>
      <RemoveUnusedCalendarsDialog
        // A fresh opening starts from the default ticks (ADR-0169).
        key={opening}
        orgSlug={orgSlug}
        projectName={projectName}
        calendars={calendars}
        open={open}
        onClose={() => setOpen(false)}
        onDeleted={() => setOpen(false)}
      />
    </div>
  );
}
