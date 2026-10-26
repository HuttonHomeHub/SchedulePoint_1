import type { UnusedCalendar } from '@repo/types';
import { useLayoutEffect, useRef, useState } from 'react';

import { useUnusedProjectCalendars } from '../api/use-calendars';

import { RemoveUnusedCalendarsDialog } from './RemoveUnusedCalendarsDialog';

import { Button } from '@/components/ui/button';
import { useContainerUnmountHandoff } from '@/components/ui/use-container-unmount-handoff';

/**
 * **Remove unused calendars…** on the project's calendar section (ADR-0208 D5). Rendered only when
 * the project has an own calendar nothing uses; the list it reads is the same one the dialog shows.
 * That list is not refreshed when a plan starts using a calendar, so a row can be stale; the server
 * refuses the delete with a 409 naming what is in use, which the dialog shows.
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
 *
 * **The dialog is still open when that happens.** The delete's own `onSettled` waits for the list to
 * refetch, so the list empties before the `mutate()` callback that would close the dialog runs. While
 * a `showModal()` dialog is open the rest of the page is inert, and `focus()` on the section does
 * nothing, so focus fell to `<body>` in every real browser (jsdom has no inertness, so the unit
 * suite passed). The cleanup below therefore closes the dialog first and puts focus back on the
 * opener; the hand-off's own cleanup, which runs after it, then moves it to `focusTarget`.
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
  const opener = useRef<HTMLButtonElement>(null);
  const wrapper = useRef<HTMLDivElement | null>(null);
  // Declared before the hand-off so its cleanup runs first: effects are torn down in order.
  useLayoutEffect(
    () => () => {
      const modal = wrapper.current?.querySelector('dialog[open]');
      if (!(modal instanceof HTMLDialogElement) || !modal.contains(document.activeElement)) return;
      modal.close();
      if (document.activeElement === null || document.activeElement === document.body) {
        opener.current?.focus();
      }
    },
    [],
  );
  const { wrapperProps } = useContainerUnmountHandoff({ target: focusTarget });

  return (
    <div
      {...wrapperProps}
      ref={(node) => {
        wrapperProps.ref(node);
        if (node !== null) wrapper.current = node;
      }}
    >
      <Button
        ref={opener}
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
