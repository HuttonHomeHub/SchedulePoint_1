import { ARCHIVED_FILTERS, type ArchivedFilter, type CalendarSummary } from '@repo/types';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useCalendarProjectNames } from '../api/use-calendar-project-names';
import {
  useArchiveCalendar,
  useCalendars,
  useDeleteCalendar,
  useUnarchiveCalendar,
} from '../api/use-calendars';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { LIBRARY_SCOPING_ENABLED } from '@/config/env';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ApiFetchError } from '@/lib/api/client';
import {
  ARCHIVED_BADGE,
  ARCHIVED_FILTER_LABELS,
  ARCHIVE_EXPLAINER,
  isArchivedRow,
} from '@/lib/library-filters';

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
 * calendar into the shared library (gated on `calendar:manage_org`).
 *
 * The same flag adds the M4 management layer (ADR-0053 §4 / US-7 + US-8): a debounced **server-side**
 * search (`?q=`), an archived filter (`?archived=`), an `Archived` badge, and per-row **Archive /
 * Unarchive**. Archive is emphatically **not** delete — an archived calendar stays bound to its
 * plans, activities and resources and keeps scheduling identically; it is only hidden from the
 * pickers. That distinction is the single biggest usability risk of the feature, so it is stated in
 * the UI ({@link ARCHIVE_EXPLAINER}) and repeated in every announcement, not left to the verb.
 *
 * Flag-off, none of that renders and the list still requests the plain default — byte-for-byte the
 * prior screen.
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
  const [search, setSearch] = useState('');
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('exclude');
  // The request is driven by the SETTLED term, so a typing burst costs one round trip; the input
  // itself renders `search` and stays instant.
  const debouncedSearch = useDebouncedValue(search);
  // Flag-off neither filter can leave its default, so this is the same query, key and URL as before.
  const calendars = useCalendars(
    orgSlug,
    LIBRARY_SCOPING_ENABLED ? scopeFilter : 'org',
    LIBRARY_SCOPING_ENABLED ? { q: debouncedSearch, archived: archivedFilter } : {},
  );
  const deleteCalendar = useDeleteCalendar(orgSlug);
  const archiveCalendar = useArchiveCalendar(orgSlug);
  const unarchiveCalendar = useUnarchiveCalendar(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const filterId = useId();
  const searchId = useId();
  const archivedFilterId = useId();
  const explainerId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CalendarSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const projectNames = useCalendarProjectNames(orgSlug, calendars.data, LIBRARY_SCOPING_ENABLED);
  // Only the promote direction is offered here: narrowing needs a target project, which this
  // org-wide screen cannot name (that move lives on the project's own Calendars section).
  const scopeMove = useCalendarScopeMove(orgSlug, { restoreFocusRef: regionRef });

  const editing = editingId
    ? calendars.data?.find((calendar) => calendar.id === editingId)
    : undefined;

  const filtersActive =
    LIBRARY_SCOPING_ENABLED &&
    (search.trim() !== '' || archivedFilter !== 'exclude' || scopeFilter !== 'org');

  const clearFilters = (): void => {
    setSearch('');
    setArchivedFilter('exclude');
    setScopeFilter('org');
  };

  const toggleArchived = (calendar: CalendarSummary): void => {
    setArchiveError(null);
    const archived = isArchivedRow(calendar);
    const mutation = archived ? unarchiveCalendar : archiveCalendar;
    mutation.mutate(
      { calendarId: calendar.id, version: calendar.version },
      {
        onSuccess: () =>
          announce(
            archived
              ? `Calendar “${calendar.name}” unarchived. It is available in the pickers again.`
              : `Calendar “${calendar.name}” archived. It is hidden from the pickers; everything already using it keeps scheduling unchanged.`,
          ),
        onError: (error) =>
          setArchiveError(
            error instanceof Error
              ? error.message
              : 'Couldn’t change this calendar’s archive state. Please try again.',
          ),
      },
    );
  };

  const columns: Column<CalendarSummary>[] = [
    {
      header: 'Name',
      cell: (calendar) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{calendar.name}</span>
          {/* The state is carried by a word, never by dimming alone (WCAG 1.4.1). */}
          {LIBRARY_SCOPING_ENABLED && isArchivedRow(calendar) ? (
            <Badge size="sm">{ARCHIVED_BADGE}</Badge>
          ) : null}
        </span>
      ),
    },
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
          {/* Always-visible row actions (never hover-only, docs/UX_STANDARDS.md "Row / node
              actions"), matching the Edit/Delete idiom this table already uses. */}
          {LIBRARY_SCOPING_ENABLED ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleArchived(calendar)}
              aria-label={`${isArchivedRow(calendar) ? 'Unarchive' : 'Archive'} ${calendar.name}`}
            >
              {isArchivedRow(calendar) ? 'Unarchive' : 'Archive'}
            </Button>
          ) : null}
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
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-56 flex-1 flex-col gap-1.5">
              <Label htmlFor={searchId}>Search calendars</Label>
              <Input
                id={searchId}
                type="search"
                autoComplete="off"
                placeholder="Search by name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
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
            <div className="flex max-w-xs flex-col gap-1.5">
              <Label htmlFor={archivedFilterId}>Show archived</Label>
              <Select
                id={archivedFilterId}
                value={archivedFilter}
                aria-describedby={explainerId}
                onChange={(event) => setArchivedFilter(event.target.value as ArchivedFilter)}
              >
                {ARCHIVED_FILTERS.map((value) => (
                  <option key={value} value={value}>
                    {ARCHIVED_FILTER_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p id={explainerId} className="text-muted-foreground text-sm">
            {ARCHIVE_EXPLAINER}
          </p>
          {archiveError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {archiveError}
            </p>
          ) : null}
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
          filtersActive ? (
            // A filtered-to-nothing list is a different situation from an empty library, and must
            // never read as one — it says so, and offers the way back (docs/UX_STANDARDS.md).
            <div className="border-border rounded-lg border border-dashed p-8 text-center">
              <p className="text-muted-foreground text-sm">No calendars match these filters.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              No calendars yet.{canWrite ? ' Create your first working-day calendar.' : ''}
            </div>
          )
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
