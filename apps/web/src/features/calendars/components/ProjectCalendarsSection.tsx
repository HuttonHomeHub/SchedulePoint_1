import type { CalendarSummary } from '@repo/types';
import { useRef, useState } from 'react';

import { useProjectCalendars } from '../api/use-calendars';
import { useCalendarScopeMove } from '../hooks/use-calendar-scope-move';
import { formatWorkingWeekdays } from '../schemas/calendar-schemas';

import { CalendarFormDialog } from './CalendarFormDialog';
import { CalendarScopeBadge } from './CalendarScopeBadge';
import { CreateCalendarButton } from './CreateCalendarButton';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';

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
  const calendars = useProjectCalendars(orgSlug, projectId);
  const regionRef = useRef<HTMLDivElement>(null);
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

  const columns: Column<CalendarSummary>[] = [
    { header: 'Name', cell: (calendar) => <span className="font-medium">{calendar.name}</span> },
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

      <DataTable
        caption={`Calendars usable in ${projectName}`}
        columns={columns}
        query={calendars}
        getRowKey={(calendar) => calendar.id}
        loadingLabel="Loading calendars…"
        errorLabel="Couldn’t load this project’s calendars. Please try again."
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No calendars available.{canWrite ? ' Create one for this project.' : ''}
          </div>
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
