import type { ProjectSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { useRef, useState } from 'react';

import { useDeleteProject, useProjects } from '../api/use-projects';

import { ProjectFormDialog } from './ProjectFormDialog';

import { useAnnounce } from '@/components/ui/announcer';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/components/ui/data-table';

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
      cell: (project) => (
        <Link
          to="/orgs/$orgSlug/projects/$projectId"
          params={{ orgSlug, projectId: project.id }}
          className="font-medium underline-offset-4 hover:underline"
        >
          {project.name}
        </Link>
      ),
    },
    {
      header: 'Description',
      cell: (project) => (
        <span className="text-muted-foreground">{project.description ?? '—'}</span>
      ),
    },
  ];
  if (canWrite) {
    columns.push({
      header: 'Actions',
      srHeader: true,
      headClassName: 'py-2 font-medium',
      cellClassName: 'py-2 text-right whitespace-nowrap',
      cell: (project) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditingId(project.id)}
            aria-label={`Edit ${project.name}`}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDeleteError(null);
              setDeleting(project);
            }}
            aria-label={`Delete ${project.name}`}
          >
            Delete
          </Button>
        </div>
      ),
    });
  }

  const confirmDelete = (): void => {
    if (!deleting) return;
    const name = deleting.name;
    deleteProject.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setDeleteError(null);
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
        empty={
          <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
            No projects yet.{canWrite ? ' Create the first project for this client.' : ''}
          </div>
        }
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
            description={
              deleting
                ? `Delete “${deleting.name}” and all its plans? You can restore it later.`
                : ''
            }
            pending={deleteProject.isPending}
            pendingLabel="Deleting…"
            error={deleteError}
          />
        </>
      ) : null}
    </div>
  );
}
