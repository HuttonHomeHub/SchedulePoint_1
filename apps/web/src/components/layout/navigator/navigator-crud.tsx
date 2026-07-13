import type { ClientSummary, PlanSummary, ProjectSummary } from '@repo/types';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';

import { useAnnounce } from '@/components/ui/announcer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ClientFormDialog, clientsQueryOptions, useDeleteClient } from '@/features/clients';
import {
  NavigatorCrudProvider,
  type AfterDeleteSignal,
  type NavigatorCrudApi,
  type NodeActionKind,
  type NodeActionTarget,
  type UseExpansionState,
} from '@/features/navigator';
import { PlanFormDialog, plansQueryOptions, useDeletePlan } from '@/features/plans';
import { ProjectFormDialog, projectsQueryOptions, useDeleteProject } from '@/features/projects';

/** The dialog the coordinator is currently showing (one at a time). */
type CrudDialog =
  | { type: 'create-client' }
  | { type: 'create-project'; clientId: string }
  | { type: 'create-plan'; projectId: string }
  | { type: 'rename'; target: NodeActionTarget }
  | { type: 'delete'; target: NodeActionTarget };

const KIND_NOUN: Record<NodeActionTarget['kind'], string> = {
  client: 'client',
  project: 'project',
  plan: 'plan',
};

/** Kind-appropriate cascade warning; every variant ends "You can restore it later." */
function deleteDescription(target: NodeActionTarget): string {
  const name = `“${target.name}”`;
  if (target.kind === 'client') {
    return `Delete ${name} and all its projects and plans? You can restore it later.`;
  }
  if (target.kind === 'project') {
    return `Delete ${name} and all its plans? You can restore it later.`;
  }
  return `Delete ${name}? You can restore it later.`;
}

/**
 * The in-tree CRUD coordinator (ADR-0029 Phase 2) — the composition-layer owner of
 * the create/rename/delete dialogs for the Project Explorer. It provides the
 * {@link NavigatorCrudProvider} seam the shared tree emits intents through (so the
 * tree never imports a sibling feature), reuses the existing feature form dialogs,
 * `ConfirmDialog`, and mutation hooks verbatim, and handles post-mutation
 * orientation: reveal a new folder's parent, navigate to a new plan (the deep-link
 * machinery then selects + reveals it), and re-home focus after a delete. Selection
 * stays a pure projection of the URL (ADR-0029), so folders are revealed, not
 * force-selected. Renders `children` (the shell body) plus whichever dialog is open.
 */
export function NavigatorCrud({
  orgSlug,
  canWrite,
  expansion,
  children,
}: {
  orgSlug: string | undefined;
  canWrite: boolean;
  expansion: UseExpansionState;
  children: React.ReactNode;
}): React.ReactElement {
  const navigate = useNavigate();
  const announce = useAnnounce();
  const [dialog, setDialog] = useState<CrudDialog | null>(null);
  const [afterDelete, setAfterDelete] = useState<AfterDeleteSignal | null>(null);
  const org = orgSlug ?? '';

  const closeDialog = useCallback(() => setDialog(null), []);

  const onNodeAction = useCallback((action: NodeActionKind, target: NodeActionTarget) => {
    switch (action) {
      case 'create-project':
        setDialog({ type: 'create-project', clientId: target.id });
        break;
      case 'create-plan':
        setDialog({ type: 'create-plan', projectId: target.id });
        break;
      case 'rename':
        setDialog({ type: 'rename', target });
        break;
      case 'delete':
        setDialog({ type: 'delete', target });
        break;
    }
  }, []);

  const onCreateClient = useCallback(() => setDialog({ type: 'create-client' }), []);

  const crud = useMemo<NavigatorCrudApi>(
    () => ({ canWrite, onNodeAction, onCreateClient, afterDelete }),
    [canWrite, onNodeAction, onCreateClient, afterDelete],
  );

  // ── Delete: the coordinator owns the mutation (ConfirmDialog is generic). All three
  // hooks are declared unconditionally (rules of hooks); the inactive ones get an empty
  // parent id and are never fired. ──────────────────────────────────────────────────
  const del = dialog?.type === 'delete' ? dialog.target : null;
  const deleteClient = useDeleteClient(org);
  const deleteProject = useDeleteProject(org, del?.kind === 'project' ? (del.parentId ?? '') : '');
  const deletePlan = useDeletePlan(org, del?.kind === 'plan' ? (del.parentId ?? '') : '');
  const activeDelete =
    del?.kind === 'client' ? deleteClient : del?.kind === 'project' ? deleteProject : deletePlan;

  const confirmDelete = useCallback(() => {
    if (!del) return;
    activeDelete.mutate(del.id, {
      onSuccess: () => {
        announce(`${KIND_NOUN[del.kind]} “${del.name}” deleted.`);
        setAfterDelete((prev) => ({ seq: (prev?.seq ?? 0) + 1, parentId: del.parentId }));
        setDialog(null);
      },
    });
  }, [del, activeDelete, announce]);

  const closeDelete = useCallback(() => {
    activeDelete.reset();
    setDialog(null);
  }, [activeDelete]);

  return (
    <NavigatorCrudProvider value={crud}>
      {children}

      {dialog?.type === 'create-client' ? (
        <ClientFormDialog
          orgSlug={org}
          open
          onClose={closeDialog}
          onCreated={(client: ClientSummary) => {
            // A new client is a root — it appears after the list refetch; nothing to reveal.
            void client;
          }}
        />
      ) : null}

      {dialog?.type === 'create-project' ? (
        <ProjectFormDialog
          orgSlug={org}
          clientId={dialog.clientId}
          open
          onClose={closeDialog}
          onCreated={(project: ProjectSummary) => {
            // Reveal the new project by expanding its client (folders aren't URL-selected).
            expansion.expandPath([project.clientId]);
          }}
        />
      ) : null}

      {dialog?.type === 'create-plan' ? (
        <PlanFormDialog
          orgSlug={org}
          projectId={dialog.projectId}
          open
          onClose={closeDialog}
          onCreated={(plan: PlanSummary) => {
            // Navigating to the plan makes the URL select it; the tree's deep-link reveal
            // then expands its ancestors and scrolls it into view.
            void navigate({
              to: '/orgs/$orgSlug/plans/$planId',
              params: { orgSlug: org, planId: plan.id },
            });
          }}
        />
      ) : null}

      {dialog?.type === 'rename' ? (
        <RenameDialog orgSlug={org} target={dialog.target} onClose={closeDialog} />
      ) : null}

      {del ? (
        <ConfirmDialog
          open
          onClose={closeDelete}
          onConfirm={confirmDelete}
          title={`Delete ${KIND_NOUN[del.kind]}`}
          description={deleteDescription(del)}
          pending={activeDelete.isPending}
          error={activeDelete.isError ? activeDelete.error.message : null}
        />
      ) : null}
    </NavigatorCrudProvider>
  );
}

/**
 * Resolves the rename target's full summary (with the optimistic-lock `version`) from
 * the cached list query — the node is visible in the tree, so its list is warm — and
 * opens the existing edit dialog seeded from it. The dialog owns the PATCH + 409 path
 * unchanged. Rendered only while a rename is in flight.
 */
function RenameDialog({
  orgSlug,
  target,
  onClose,
}: {
  orgSlug: string;
  target: NodeActionTarget;
  onClose: () => void;
}): React.ReactElement | null {
  const clients = useQuery({
    ...clientsQueryOptions(orgSlug),
    enabled: target.kind === 'client',
  });
  const projects = useQuery({
    ...projectsQueryOptions(orgSlug, target.parentId ?? ''),
    enabled: target.kind === 'project' && Boolean(target.parentId),
  });
  const plans = useQuery({
    ...plansQueryOptions(orgSlug, target.parentId ?? ''),
    enabled: target.kind === 'plan' && Boolean(target.parentId),
  });

  if (target.kind === 'client') {
    const client = clients.data?.find((c) => c.id === target.id);
    if (!client) return null;
    return <ClientFormDialog orgSlug={orgSlug} open onClose={onClose} client={client} />;
  }
  if (target.kind === 'project') {
    const project = projects.data?.find((p) => p.id === target.id);
    if (!project) return null;
    return (
      <ProjectFormDialog
        orgSlug={orgSlug}
        clientId={project.clientId}
        open
        onClose={onClose}
        project={project}
      />
    );
  }
  const plan = plans.data?.find((p) => p.id === target.id);
  if (!plan) return null;
  return (
    <PlanFormDialog
      orgSlug={orgSlug}
      projectId={plan.projectId}
      open
      onClose={onClose}
      plan={plan}
    />
  );
}
