import type { ProjectSummary } from '@repo/types';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';

import { useDeleteProject, useProjects } from '../api/use-projects';

import { ProjectFormDialog } from './ProjectFormDialog';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';

/**
 * A client's projects as a table. Each name links to the project's plans.
 * Edit/Delete render only for writers; delete is a soft cascade confirmed first.
 * Covers loading, error, and empty states.
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
  const [editing, setEditing] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (projects.isPending) {
    return (
      <div className="p-6">
        <Spinner label="Loading projects…" />
      </div>
    );
  }

  if (projects.isError) {
    return (
      <p role="alert" className="text-destructive-text text-sm">
        Couldn&rsquo;t load projects. Please try again.
      </p>
    );
  }

  if (projects.data.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        No projects yet.{canWrite ? ' Create the first project for this client.' : ''}
      </div>
    );
  }

  const confirmDelete = (): void => {
    if (!deleting) return;
    deleteProject.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setDeleteError(null);
      },
      onError: (err) => setDeleteError(err.message),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Projects</caption>
          <thead>
            <tr className="border-border text-muted-foreground border-b text-left">
              <th scope="col" className="py-2 pr-4 font-medium">
                Name
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Description
              </th>
              {canWrite ? (
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {projects.data.map((project) => (
              <tr key={project.id} className="border-border border-b">
                <td className="py-2 pr-4">
                  <Link
                    to="/orgs/$orgSlug/projects/$projectId"
                    params={{ orgSlug, projectId: project.id }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {project.name}
                  </Link>
                </td>
                <td className="text-muted-foreground py-2 pr-4">{project.description ?? '—'}</td>
                {canWrite ? (
                  <td className="py-2 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(project)}
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
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canWrite ? (
        <>
          <ProjectFormDialog
            orgSlug={orgSlug}
            clientId={clientId}
            open={editing !== null}
            onClose={() => setEditing(null)}
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
