import type { CalendarSummary } from '@repo/types';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useCalendars, useDeleteCalendar } from '../api/use-calendars';
import { CALENDAR_IN_USE, formatWorkingWeekdays } from '../schemas/calendar-schemas';

import { CalendarFormDialog } from './CalendarFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ApiFetchError } from '@/lib/api/client';

/** Friendly message for a delete blocked because the calendar is referenced by plans. */
function deleteErrorMessage(error: unknown): string {
  if (error instanceof ApiFetchError && error.status === 409) {
    const details = error.error.details as { reason?: string; count?: number } | undefined;
    if (details?.reason === CALENDAR_IN_USE) {
      const count = details.count ?? 0;
      return `In use by ${count} plan${count === 1 ? '' : 's'}. Reassign them before deleting.`;
    }
  }
  return error instanceof Error
    ? error.message
    : 'Couldn’t delete this calendar. Please try again.';
}

/**
 * The organisation's calendars as a table (name, working-day pattern,
 * description). Writers (`canWrite`) get Edit + Delete; everyone else gets View
 * (the same dialog, read-only) so any member can browse a calendar's pattern and
 * holidays (spec US-4). A delete blocked because plans still reference the calendar
 * surfaces a friendly inline message. The open target is looked up by id from the
 * live query so a 409 retry carries the current version. States come from the
 * shared DataTable.
 */
export function CalendarsTable({
  orgSlug,
  canWrite,
}: {
  orgSlug: string;
  canWrite: boolean;
}): React.ReactElement {
  const calendars = useCalendars(orgSlug);
  const deleteCalendar = useDeleteCalendar(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CalendarSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editing = editingId
    ? calendars.data?.find((calendar) => calendar.id === editingId)
    : undefined;

  const columns: Column<CalendarSummary>[] = [
    { header: 'Name', cell: (calendar) => <span className="font-medium">{calendar.name}</span> },
    {
      header: 'Working days',
      cell: (calendar) => formatWorkingWeekdays(calendar.workingWeekdays),
    },
    {
      header: 'Description',
      cell: (calendar) => (
        <span className="text-muted-foreground">{calendar.description ?? '—'}</span>
      ),
    },
  ];
  columns.push({
    header: 'Actions',
    srHeader: true,
    headClassName: 'py-2 font-medium',
    cellClassName: 'py-2 text-right whitespace-nowrap',
    cell: (calendar) =>
      canWrite ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(calendar.id)}
            aria-label={`Edit ${calendar.name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteError(null);
              setDeleting(calendar);
            }}
            aria-label={`Delete ${calendar.name}`}
          >
            Delete
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(calendar.id)}
            aria-label={`View ${calendar.name}`}
          >
            View
          </Button>
        </div>
      ),
  });

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    deleteCalendar.mutate(deleting.id, {
      onSuccess: () => {
        // Close the confirm dialog synchronously before moving focus (see ClientsTable).
        flushSync(() => {
          setDeleting(null);
          setDeleteError(null);
        });
        announce(`Calendar “${name}” deleted.`);
        regionRef.current?.focus();
      },
      onError: (err) => setDeleteError(deleteErrorMessage(err)),
    });
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <DataTable
        caption="Calendars"
        columns={columns}
        query={calendars}
        getRowKey={(calendar) => calendar.id}
        loadingLabel="Loading calendars…"
        errorLabel="Couldn’t load calendars. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No calendars yet.{canWrite ? ' Create your first working-day calendar.' : ''}
          </div>
        }
      />

      <CalendarFormDialog
        orgSlug={orgSlug}
        open={editing !== undefined}
        onClose={() => setEditingId(null)}
        readOnly={!canWrite}
        {...(editing ? { calendar: editing } : {})}
      />
      {canWrite ? (
        <ConfirmDialog
          open={deleting !== null}
          onClose={() => {
            setDeleting(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
          title="Delete calendar"
          description={deleting ? `Delete “${deleting.name}”?` : ''}
          pending={deleteCalendar.isPending}
          pendingLabel="Deleting…"
          error={deleteError}
        />
      ) : null}
    </div>
  );
}
