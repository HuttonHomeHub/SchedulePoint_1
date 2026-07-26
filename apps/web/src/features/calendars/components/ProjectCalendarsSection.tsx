import { ARCHIVED_FILTERS, type ArchivedFilter, type CalendarSummary } from '@repo/types';
import { useId, useRef, useState } from 'react';

import {
  useArchiveCalendar,
  useProjectCalendars,
  useUnarchiveCalendar,
} from '../api/use-calendars';
import { useCalendarScopeMove } from '../hooks/use-calendar-scope-move';
import { formatWorkingWeekdays } from '../schemas/calendar-schemas';

import { CalendarFormDialog } from './CalendarFormDialog';
import { CalendarScopeBadge } from './CalendarScopeBadge';
import { CreateCalendarButton } from './CreateCalendarButton';

import { useAnnounce } from '@/components/ui/announcer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  ARCHIVED_BADGE,
  ARCHIVED_FILTER_LABELS,
  ARCHIVE_EXPLAINER,
  isArchivedRow,
} from '@/lib/library-filters';

/**
 * The calendars **usable in one project** (ADR-0053 §1) — the project's own, plus every shared
 * organisation calendar — shown on the project's detail screen behind `LIBRARY_SCOPING_ENABLED`.
 *
 * It reads the API's `…/projects/:projectId/calendars` endpoint, which returns exactly the set the
 * server's write guard accepts for a plan or activity in this project. That makes the section both
 * the *management* surface for the project's own calendars and an honest answer to "what can this
 * project's plans actually be scheduled on?".
 *
 * Two tier moves live here because this is the only screen where the target project is unambiguous:
 * **Move to this project** narrows a shared calendar (refused with a 409 + per-class counts while
 * anything outside the project still uses it), and **Move to organisation** promotes a project one
 * (always safe — it only widens who may use it). Both need `calendar:manage_org`.
 *
 * It also carries the **archive** half of ADR-0053 §4 for the project's OWN calendars: an archived
 * badge, a "Show archived" filter and a per-row Archive/Unarchive. That is not decoration — without
 * it an archived project calendar would silently disappear from the one screen that shows it, and
 * "archive" would read as "delete", the feature's single biggest usability risk. Archiving an
 * ORGANISATION calendar stays on the org library screen, where its full reach is visible.
 */
export function ProjectCalendarsSection({
  orgSlug,
  projectId,
  projectName,
  canWrite,
  canManageOrg,
}: {
  orgSlug: string;
  projectId: string;
  projectName: string;
  canWrite: boolean;
  /** The viewer holds `calendar:manage_org` — may write to the shared library and move tiers. */
  canManageOrg: boolean;
}): React.ReactElement {
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>('exclude');
  const calendars = useProjectCalendars(orgSlug, projectId, { archived: archivedFilter });
  const archiveCalendar = useArchiveCalendar(orgSlug);
  const unarchiveCalendar = useUnarchiveCalendar(orgSlug);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const archivedFilterId = useId();
  const explainerId = useId();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Both directions are offered here — this is the one screen where the target project is
  // unambiguous. The confirm copy, focus restore and error mapping are shared with the org library.
  const { startMove, dialogProps } = useCalendarScopeMove(orgSlug, {
    project: { id: projectId, name: projectName },
    restoreFocusRef: regionRef,
  });

  const editing = editingId
    ? calendars.data?.find((calendar) => calendar.id === editingId)
    : undefined;
  const isOwn = (calendar: CalendarSummary): boolean =>
    calendar.scope === 'PROJECT' && calendar.projectId === projectId;

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
          {isArchivedRow(calendar) ? <Badge size="sm">{ARCHIVED_BADGE}</Badge> : null}
        </span>
      ),
    },
    {
      header: 'Working days',
      cell: (calendar) => formatWorkingWeekdays(calendar.workingWeekdays),
    },
    {
      header: 'Scope',
      cell: (calendar) => (
        <CalendarScopeBadge calendar={calendar} {...(isOwn(calendar) ? { projectName } : {})} />
      ),
    },
    {
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (calendar) => (
        <div className="flex justify-end gap-2">
          {canWrite && canManageOrg ? (
            isOwn(calendar) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startMove(calendar, 'ORG')}
                aria-label={`Move to organisation: ${calendar.name}`}
              >
                Move to organisation
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => startMove(calendar, 'PROJECT')}
                aria-label={`Move to this project: ${calendar.name}`}
              >
                Move to this project
              </Button>
            )
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(calendar.id)}
            aria-label={canWrite ? `Edit ${calendar.name}` : `View ${calendar.name}`}
          >
            {canWrite ? 'Edit' : 'View'}
          </Button>
          {/* Archive is offered on the project's OWN calendars only: an org calendar is shared
              tenant state, so retiring it belongs on the org library screen where its full reach
              is visible — not here, where it would look local. */}
          {canWrite && isOwn(calendar) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleArchived(calendar)}
              aria-label={`${isArchivedRow(calendar) ? 'Unarchive' : 'Archive'} ${calendar.name}`}
            >
              {isArchivedRow(calendar) ? 'Unarchive' : 'Archive'}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium">Calendars</h2>
        {canWrite ? (
          <CreateCalendarButton
            orgSlug={orgSlug}
            canManageOrg={canManageOrg}
            projectId={projectId}
            projectName={projectName}
            label="New calendar"
          />
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">
        The working-day calendars this project’s plans and activities can be scheduled on — this
        project’s own, plus every organisation calendar.
      </p>

      {/* Archived rows are hidden by DEFAULT here, exactly as they are in the pickers this section
          mirrors — but they must be reachable FROM THIS SCREEN. Without the toggle a planner who
          archives a project calendar watches it vanish from the only screen that shows it and has
          to go hunting on the org library with two unrelated filters, which is precisely how
          "archive" comes to read as "delete". */}
      <div className="flex flex-wrap items-end gap-3">
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

      <DataTable
        caption={`Calendars usable in ${projectName}`}
        columns={columns}
        query={calendars}
        getRowKey={(calendar) => calendar.id}
        loadingLabel="Loading calendars…"
        errorLabel="Couldn’t load this project’s calendars. Please try again."
        empty={
          archivedFilter === 'only' ? (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              No archived calendars.
            </div>
          ) : (
            <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
              No calendars available.{canWrite ? ' Create one for this project.' : ''}
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
        projectId={projectId}
        {...(editing && isOwn(editing) ? { projectName } : {})}
        {...(editing ? { calendar: editing } : {})}
      />
      {canWrite && canManageOrg ? <ConfirmDialog {...dialogProps} /> : null}
    </div>
  );
}
