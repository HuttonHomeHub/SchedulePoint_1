import type { CalendarSummary } from '@repo/types';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useCalendarProjectNames } from '../api/use-calendar-project-names';
import { useCalendars, useDeleteCalendar } from '../api/use-calendars';
import { useCalendarScopeMove } from '../hooks/use-calendar-scope-move';
import {
  CALENDAR_IN_USE,
  CALENDAR_SCOPE_FILTERS,
  CALENDAR_SCOPE_FILTER_LABELS,
  formatWorkingWeekdays,
  type CalendarScopeFilter,
} from '../schemas/calendar-schemas';

import { CalendarFormDialog } from './CalendarFormDialog';
import { CalendarScopeBadge } from './CalendarScopeBadge';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { LIBRARY_SCOPING_ENABLED } from '@/config/env';
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
 * The organisation's calendars as a table (name, working-day pattern, description). Writers
 * (`canWrite`) get Edit + Delete; everyone else gets View (the same dialog, read-only) so any member
 * can browse a calendar's pattern and holidays (spec US-4). A delete blocked because plans still
 * reference the calendar surfaces a friendly inline message. The open target is looked up by id from
 * the live query so a 409 retry carries the current version. States come from the shared DataTable.
 *
 * Behind `LIBRARY_SCOPING_ENABLED` (ADR-0053 §1) it also shows which **tier** each calendar belongs
 * to — a `Scope` badge column naming the owning project for project-scoped rows — with a filter over
 * the API's `?scope=org|project|all`, and a **Move to organisation** action promoting a project
 * calendar into the shared library (gated on `calendar:manage_org`). Flag-off, none of that renders
 * and the list still requests the plain default — byte-for-byte the prior screen.
 */
export function CalendarsTable({
  orgSlug,
  canWrite,
  canManageOrg = canWrite,
}: {
  orgSlug: string;
  canWrite: boolean;
  /**
   * The viewer holds `calendar:manage_org` — may write to the SHARED library and move calendars
   * between tiers (ADR-0053 §2). Defaults to `canWrite`, which is what it resolves to today (the
   * permission is granted to exactly the hierarchy-write roles), so existing call sites are
   * unchanged; passing it explicitly lets the two diverge without touching this component.
   */
  canManageOrg?: boolean;
}): React.ReactElement {
  const [scopeFilter, setScopeFilter] = useState<CalendarScopeFilter>('org');
  // Flag-off the filter can never leave 'org', so this is the same query, key and URL as before.
  const calendars = useCalendars(orgSlug, LIBRARY_SCOPING_ENABLED ? scopeFilter : 'org');
  const deleteCalendar = useDeleteCalendar(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const filterId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CalendarSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const projectNames = useCalendarProjectNames(orgSlug, calendars.data, LIBRARY_SCOPING_ENABLED);
  // Only the promote direction is offered here: narrowing needs a target project, which this
  // org-wide screen cannot name (that move lives on the project's own Calendars section).
  const scopeMove = useCalendarScopeMove(orgSlug, { restoreFocusRef: regionRef });

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
  if (LIBRARY_SCOPING_ENABLED) {
    columns.push({
      header: 'Scope',
      cell: (calendar) => (
        <CalendarScopeBadge
          calendar={calendar}
          {...(calendar.projectId ? { projectName: projectNames.get(calendar.projectId) } : {})}
        />
      ),
    });
  }
  columns.push({
    header: 'Actions',
    srHeader: true,
    headClassName: 'py-2 font-medium',
    cellClassName: 'py-2 text-right whitespace-nowrap',
    cell: (calendar) =>
      canWrite ? (
        <div className="flex justify-end gap-2">
          {LIBRARY_SCOPING_ENABLED && calendar.scope === 'PROJECT' && canManageOrg ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => scopeMove.startMove(calendar, 'ORG')}
              aria-label={`Move to organisation: ${calendar.name}`}
            >
              Move to organisation
            </Button>
          ) : null}
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
      {LIBRARY_SCOPING_ENABLED ? (
        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor={filterId}>Scope</Label>
          <Select
            id={filterId}
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value as CalendarScopeFilter)}
          >
            {CALENDAR_SCOPE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {CALENDAR_SCOPE_FILTER_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

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
        canManageOrg={canManageOrg}
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
      {LIBRARY_SCOPING_ENABLED && canWrite && canManageOrg ? (
        <ConfirmDialog {...scopeMove.dialogProps} />
      ) : null}
    </div>
  );
}
