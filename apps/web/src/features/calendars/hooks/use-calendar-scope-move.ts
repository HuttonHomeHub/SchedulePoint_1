import type { CalendarScope, CalendarSummary } from '@repo/types';
import { useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

import { useMoveCalendarScope } from '../api/use-calendars';

import { useAnnounce } from '@/components/ui/announcer';
import { calendarErrorMessage } from '@/lib/api/calendar-scope-errors';

/** The project a narrowing move targets — the only screen offering it is inside one. */
interface MoveTargetProject {
  id: string;
  name: string;
}

/** Everything the shared {@link ConfirmDialog} needs for a pending tier move. */
interface ScopeMoveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant: 'default';
  pending: boolean;
  pendingLabel: string;
  error: string | null;
}

/**
 * The confirm-then-move interaction for a calendar's tier (ADR-0053 §2), shared by the two screens
 * that offer it — the organisation library (promote only) and a project's Calendars section (both
 * directions).
 *
 * It exists so the *wording*, the focus-restore behaviour and the error mapping can't drift between
 * those screens: a planner who promotes from the library and one who promotes from a project must
 * read the same sentence and land in the same place afterwards. Both screens keep their own tables —
 * they are genuinely different lists — but share this one slice.
 *
 * A tier move is significant but **not destructive** (nothing is deleted, and widening is fully
 * reversible), so the confirm uses the default variant rather than the destructive red of delete.
 */
export function useCalendarScopeMove(
  orgSlug: string,
  {
    project,
    restoreFocusRef,
  }: {
    /** The project a "move to this project" targets; omit on a screen that can only promote. */
    project?: MoveTargetProject;
    /** Focused after a successful move, so the keyboard user isn't dropped to `<body>`. */
    restoreFocusRef: RefObject<HTMLElement | null>;
  },
): {
  startMove: (calendar: CalendarSummary, to: CalendarScope) => void;
  dialogProps: ScopeMoveDialogProps;
} {
  const moveScope = useMoveCalendarScope(orgSlug);
  const announce = useAnnounce();
  const [moving, setMoving] = useState<{ calendar: CalendarSummary; to: CalendarScope } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const close = (): void => {
    setMoving(null);
    setError(null);
  };

  const startMove = (calendar: CalendarSummary, to: CalendarScope): void => {
    setError(null);
    setMoving({ calendar, to });
  };

  const confirm = (): void => {
    if (!moving) return;
    const { calendar, to } = moving;
    moveScope.mutate(
      {
        calendarId: calendar.id,
        version: calendar.version,
        scope: to,
        ...(to === 'PROJECT' && project ? { projectId: project.id } : {}),
      },
      {
        onSuccess: () => {
          // Close synchronously before moving focus — closing after would leave focus on a node
          // React has already unmounted (the ClientsTable convention).
          flushSync(close);
          announce(
            to === 'ORG'
              ? `Calendar “${calendar.name}” moved to the organisation library.`
              : `Calendar “${calendar.name}” moved to ${project?.name ?? 'this project'}.`,
          );
          restoreFocusRef.current?.focus();
        },
        onError: (err) =>
          setError(calendarErrorMessage(err, 'Couldn’t move this calendar. Please try again.')),
      },
    );
  };

  const toOrg = moving?.to === 'ORG';
  return {
    startMove,
    dialogProps: {
      open: moving !== null,
      onClose: close,
      onConfirm: confirm,
      title: toOrg ? 'Move to organisation' : 'Move to this project',
      description: !moving
        ? ''
        : toOrg
          ? `Move “${moving.calendar.name}” into the shared organisation library? Every project will be able to use it.`
          : `Move “${moving.calendar.name}” into ${project?.name ?? 'this project'}? Only this project will be able to use it, so anything outside it must already have moved off this calendar.`,
      confirmLabel: 'Move',
      confirmVariant: 'default',
      pending: moveScope.isPending,
      pendingLabel: 'Moving…',
      error,
    },
  };
}
