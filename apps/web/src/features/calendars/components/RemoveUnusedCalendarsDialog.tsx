import type { CalendarInUseDetail, UnusedCalendar } from '@repo/types';
import { useId, useState } from 'react';

import { BulkDeleteInterrupted, useBulkDeleteCalendars } from '../api/use-calendars';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { CheckboxField } from '@/components/ui/form';
import { ApiFetchError } from '@/lib/api/client';
import { ARCHIVED_BADGE } from '@/lib/library-filters';

/**
 * What the dialog says about a calendar that only Recently deleted still points at. The sentence is
 * the product owner's (spec Q4): such a calendar is listed, because it is exactly what an old
 * revision left behind, but it starts unticked so the old plan's restore does not quietly become a
 * two-step job.
 */
export function deletedReferencerNote(calendar: UnusedCalendar): string | null {
  const { plans, activities } = calendar.deletedReferencers;
  if (plans === 0 && activities === 0) return null;
  const what =
    plans > 0 && activities > 0
      ? 'a deleted plan and deleted activities'
      : plans > 0
        ? 'a deleted plan'
        : 'a deleted activity';
  const restoring = plans > 0 ? 'plan' : 'activity';
  return `Used by ${what}. Restoring that ${restoring} will ask you to restore this calendar first.`;
}

const plural = (n: number, one: string, many: string): string =>
  `${String(n)} ${n === 1 ? one : many}`;

/** The sentence a refused delete shows: which calendars are in use, and by how much. */
function inUseMessage(calendars: CalendarInUseDetail[]): string {
  const named = calendars.map((c) => {
    const parts = [
      c.plans > 0 ? plural(c.plans, 'plan', 'plans') : null,
      c.activities > 0 ? plural(c.activities, 'activity', 'activities') : null,
      c.resources > 0 ? plural(c.resources, 'resource', 'resources') : null,
    ].filter((part): part is string => part !== null);
    return `“${c.name}” (${parts.join(', ')})`;
  });
  return `Nothing was deleted. In use now: ${named.join('; ')}.`;
}

/** Turns a failed delete into the sentence the dialog shows. */
function failureMessage(failure: unknown): string {
  if (failure instanceof BulkDeleteInterrupted) {
    return (
      `${plural(failure.deleted, 'calendar was', 'calendars were')} deleted before it stopped, and ` +
      `${String(failure.remaining)} remain. ${failureMessage(failure.failure)}`
    );
  }
  if (failure instanceof ApiFetchError) {
    const details = failure.error.details as { calendars?: CalendarInUseDetail[] } | undefined;
    if (failure.status === 409 && details?.calendars && details.calendars.length > 0) {
      return inUseMessage(details.calendars);
    }
    return failure.message;
  }
  return failure instanceof Error && failure.message
    ? failure.message
    : 'The calendars were not deleted.';
}

/**
 * **Remove unused calendars** (ADR-0208 D5, spec US-2): the project's own calendars that no plan,
 * activity or resource uses, each ticked to delete. Every row starts ticked except one that Recently
 * deleted still points at. Deleting is all or nothing on the server; every calendar goes to Recently
 * deleted under its own batch and restores alone.
 *
 * Mounted with a fresh `key` per opening by {@link RemoveUnusedCalendarsButton}, so the ticks never
 * carry over from one opening to the next (ADR-0169). Confirm is `aria-disabled`, never native
 * `disabled`, so it keeps focus while the request runs and at zero ticks it can still be reached to
 * read why it does nothing (ADR-0204).
 */
export function RemoveUnusedCalendarsDialog({
  orgSlug,
  projectName,
  calendars,
  open,
  onClose,
  onDeleted,
}: {
  orgSlug: string;
  projectName: string;
  calendars: UnusedCalendar[];
  open: boolean;
  onClose: () => void;
  /** Called once the calendars are gone, with how many. The host closes the dialog. */
  onDeleted: (count: number) => void;
}): React.ReactElement {
  const bulkDelete = useBulkDeleteCalendars(orgSlug);
  const announce = useAnnounce();
  const reasonId = useId();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(calendars.filter((c) => deletedReferencerNote(c) === null).map((c) => c.id)),
  );
  const [error, setError] = useState<string | null>(null);

  const count = calendars.filter((c) => ticked.has(c.id)).length;
  const pending = bulkDelete.isPending;
  const blocked = pending || count === 0;

  const toggle = (id: string): void => {
    setError(null);
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = (): void => {
    setError(null);
    const ids = calendars.filter((c) => ticked.has(c.id)).map((c) => c.id);
    bulkDelete.mutate(ids, {
      onSuccess: (result) => {
        const n = result.deleted.length;
        announce(
          `${plural(n, 'calendar', 'calendars')} deleted. You can restore ${n === 1 ? 'it' : 'them'} from Recently deleted.`,
        );
        onDeleted(n);
      },
      onError: (failure) => setError(failureMessage(failure)),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Remove unused calendars"
      description={`These calendars belong to ${projectName} and no plan or activity uses them. Deleted calendars can be restored from Recently deleted.`}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm">Calendars to delete</legend>
          <ul className="border-border max-h-80 divide-y overflow-y-auto rounded-md border px-3">
            {calendars.map((calendar) => {
              const note = deletedReferencerNote(calendar);
              return (
                <li key={calendar.id} className="py-1">
                  <CheckboxField
                    checked={ticked.has(calendar.id)}
                    onChange={() => toggle(calendar.id)}
                    density="compact"
                    label={
                      <span className="flex flex-wrap items-center gap-2">
                        <span>{calendar.name}</span>
                        {calendar.archived ? (
                          <Badge variant="neutral" size="sm">
                            {ARCHIVED_BADGE}
                          </Badge>
                        ) : null}
                      </span>
                    }
                    {...(note ? { hint: note } : {})}
                  />
                </li>
              );
            })}
          </ul>
        </fieldset>

        <p id={reasonId} role="status" className="text-muted-foreground text-sm">
          {count === 0
            ? 'Tick at least one calendar to delete.'
            : `${plural(count, 'calendar', 'calendars')} will go to Recently deleted.`}
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            aria-disabled={blocked}
            aria-busy={pending}
            aria-describedby={reasonId}
            onClick={(event) => {
              if (blocked) {
                event.preventDefault();
                return;
              }
              confirm();
            }}
            className="aria-busy:pointer-events-none"
          >
            {pending ? 'Deleting…' : `Delete ${plural(count, 'calendar', 'calendars')}`}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
