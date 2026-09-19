import type { ProjectSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { useDeleteProject, useProjects } from '../api/use-projects';

import { ProjectFormDialog } from './ProjectFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';
import { MenuItem } from '@/components/ui/menu';
import { RowActionsMenu } from '@/components/ui/row-actions-menu';
import { deleteCascadeWarning } from '@/lib/delete-copy';

/**
 * A client's projects as a table. Each name links to the project's plans.
 * Edit/Delete render only for writers; delete is a soft cascade confirmed first.
 * The edit target is looked up by id from the live query, so a 409 conflict's
 * refetched version is used on retry. States come from the shared DataTable.
 */
export function ProjectsTable({
  orgSlug,
  clientId,
  canWrite,
}: {
  orgSlug: string;
  clientId: string;
  canWrite: boolean;
}): React.ReactElement {
  const projects = useProjects(orgSlug, clientId);
  const deleteProject = useDeleteProject(orgSlug, clientId);
  const announce = useAnnounce();
  const regionRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const editing = editingId
    ? projects.data?.find((project) => project.id === editingId)
    : undefined;

  const columns: Column<ProjectSummary>[] = [
    {
      header: 'Name',
      /**
       * **`Description` is a secondary line under the name, not a column** (ADR-0146 D4).
       *
       * **This table was named by the epic's own problem statement and left out of the milestone
       * that fixed it.** `feature-spec.md` §1.2.8 lists the em-dash column on "Clients, Calendars,
       * **Client detail** and Project detail"; M2-T3's scope line says "`Description` leaves
       * Clients and Calendars" and stops there, and nothing recorded the difference — so this
       * screen kept a column whose every cell read "—" while the two beside it were fixed, for the
       * reason a reader of either file would have said it was fixed. Found by the M8 UX review;
       * ADR-0081's shape, which this epic's register quotes and did not apply to itself.
       *
       * **Rendered only when present**, because a secondary line reading "—" is the same defect one
       * row lower — the trap in this whole rule.
       */
      cell: (project) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <Link
            to="/orgs/$orgSlug/projects/$projectId"
            params={{ orgSlug, projectId: project.id }}
            className="font-medium underline-offset-4 hover:underline"
          >
            {project.name}
          </Link>
          {project.description ? (
            <span className="text-muted-foreground text-xs">{project.description}</span>
          ) : null}
        </span>
      ),
    },
  ];
  if (canWrite) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      /* **One row-action shape** (page-consistency M4): the primary action stays visible and the
         rest move behind a `⋯`, which is the shape ADR-0097 Landing F1 decided on the calendars
         table. Landing F asked "which tables are crowded?" and correctly answered "one", leaving
         this one alone; this epic asks a different question — "do these tables answer the same
         question three ways?" — and the answer was yes. The cost is stated rather than glossed:
         deleting a project is two presses instead of one, which the product owner accepted on the
         grounds that the buried action is the destructive one and a moment's friction is cheapest
         there. */
      cell: (project) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(project.id)}
            aria-label={`Edit ${project.name}`}
          >
            Edit
          </Button>
          <RowActionsMenu subject={project.name} context="Projects">
            <MenuItem
              destructive
              onSelect={() => {
                setDeleteError(null);
                setDeleting(project);
              }}
            >
              Delete
            </MenuItem>
          </RowActionsMenu>
        </div>
      ),
    });
  }

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    deleteProject.mutate(deleting.id, {
      onSuccess: () => {
        // Close the dialog synchronously before moving focus (see ClientsTable).
        flushSync(() => {
          setDeleting(null);
          setDeleteError(null);
        });
        announce(`Project “${name}” deleted.`);
        regionRef.current?.focus();
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  return (
    <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
      <DataTable
        caption="Projects"
        columns={columns}
        query={projects}
        getRowKey={(project) => project.id}
        loadingLabel="Loading projects…"
        errorLabel="Couldn’t load projects. Please try again."
        empty={<>No projects yet.{canWrite ? ' Create the first project for this client.' : ''}</>}
      />

      {canWrite ? (
        <>
          <ProjectFormDialog
            orgSlug={orgSlug}
            clientId={clientId}
            open={editing !== undefined}
            onClose={() => setEditingId(null)}
            {...(editing ? { project: editing } : {})}
          />
          <ConfirmDialog
            open={deleting !== null}
            onClose={() => {
              setDeleting(null);
              setDeleteError(null);
            }}
            onConfirm={confirmDelete}
            title="Delete project"
            description={deleting ? deleteCascadeWarning('project', deleting.name) : ''}
            pending={deleteProject.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
        </>
      ) : null}
    </div>
  );
}
