import type { ClientSummary, PlanSummary, ProjectSummary } from '@repo/types';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';

import {
  flattenVisible,
  selectionFromParams,
  type ChildGroup,
  type Selection,
  type TreeNodeData,
  type VisibleRow,
} from '../lib/tree-model';

import { useExpansionState } from './use-expansion-state';

import {
  clientsQueryOptions,
  planQueryOptions,
  plansQueryOptions,
  projectQueryOptions,
  projectsQueryOptions,
} from '@/lib/query/hierarchy-queries';

/** Map a list query's state to a {@link ChildGroup} (loading/error/loaded + nodes). */
function toChildGroup<T>(
  query: Pick<UseQueryResult<T[]>, 'data' | 'isError'>,
  map: (item: T) => TreeNodeData,
): ChildGroup {
  if (query.isError) return { status: 'error', nodes: [] };
  if (!query.data) return { status: 'loading', nodes: [] };
  return { status: 'loaded', nodes: query.data.map(map) };
}

export interface HierarchyTree {
  rows: VisibleRow[];
  selection: Selection | null;
  orgSlug: string;
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  expand: (id: string) => void;
  collapse: (id: string) => void;
}

/**
 * The navigator's data orchestrator (ADR-0029): the root client list plus, for each
 * **expanded** parent, its children — lazily, one query per expanded node via
 * `useQueries` (no rules-of-hooks violation), reusing the shared hierarchy read
 * contracts so page CRUD invalidations refresh the tree for free. Selection is a pure
 * projection of the URL; a deep-linked project/plan resolves and auto-reveals its
 * ancestor path. Returns the flattened visible rows + expansion actions for the view.
 */
export function useHierarchyTree(orgSlug: string): HierarchyTree {
  const params = useParams({ strict: false });
  const selection = selectionFromParams(params);
  const expansion = useExpansionState(orgSlug);
  const { expanded, expandPath } = expansion;

  // Roots: the org's clients.
  const clientsQuery = useQuery({ ...clientsQueryOptions(orgSlug), enabled: Boolean(orgSlug) });
  const clients = useMemo<TreeNodeData[]>(
    () =>
      (clientsQuery.data ?? []).map((client: ClientSummary) => ({
        kind: 'client',
        id: client.id,
        name: client.name,
        parentId: null,
      })),
    [clientsQuery.data],
  );

  // One projects query per expanded, loaded client.
  const expandedClientIds = useMemo(
    () => clients.filter((client) => expanded.has(client.id)).map((client) => client.id),
    [clients, expanded],
  );
  const projectQueries = useQueries({
    queries: expandedClientIds.map((clientId) => projectsQueryOptions(orgSlug, clientId)),
  });

  // Assemble the client→projects groups and gather every loaded project.
  const { projectsByClient, allProjects } = useMemo(() => {
    const byClient = new Map<string, ChildGroup>();
    const projects: TreeNodeData[] = [];
    expandedClientIds.forEach((clientId, index) => {
      const query = projectQueries[index];
      const group = toChildGroup<ProjectSummary>(
        query ?? { data: undefined, isError: false },
        (p) => ({
          kind: 'project',
          id: p.id,
          name: p.name,
          parentId: clientId,
        }),
      );
      byClient.set(clientId, group);
      projects.push(...group.nodes);
    });
    return { projectsByClient: byClient, allProjects: projects };
  }, [expandedClientIds, projectQueries]);

  // One plans query per expanded, loaded project.
  const expandedProjectIds = useMemo(
    () => allProjects.filter((project) => expanded.has(project.id)).map((project) => project.id),
    [allProjects, expanded],
  );
  const planQueries = useQueries({
    queries: expandedProjectIds.map((projectId) => plansQueryOptions(orgSlug, projectId)),
  });

  const childrenByParent = useMemo(() => {
    const map = new Map<string, ChildGroup>(projectsByClient);
    expandedProjectIds.forEach((projectId, index) => {
      const query = planQueries[index];
      map.set(
        projectId,
        toChildGroup<PlanSummary>(query ?? { data: undefined, isError: false }, (plan) => ({
          kind: 'plan',
          id: plan.id,
          name: plan.name,
          parentId: projectId,
        })),
      );
    });
    return map;
  }, [projectsByClient, expandedProjectIds, planQueries]);

  const roots = useMemo<ChildGroup>(
    () =>
      clientsQuery.isError
        ? { status: 'error', nodes: [] }
        : clientsQuery.data
          ? { status: 'loaded', nodes: clients }
          : { status: 'loading', nodes: [] },
    [clientsQuery.isError, clientsQuery.data, clients],
  );

  const rows = useMemo(
    () => flattenVisible(roots, childrenByParent, expanded),
    [roots, childrenByParent, expanded],
  );

  // Deep-link reveal: resolve the selected node's ancestor path (plan → project →
  // client) via the detail queries and expand it so the selection is visible.
  const planId = selection?.kind === 'plan' ? selection.id : '';
  const planDetail = useQuery({ ...planQueryOptions(orgSlug, planId), enabled: Boolean(planId) });
  const ancestorProjectId =
    selection?.kind === 'project' ? selection.id : planDetail.data?.projectId;
  const projectDetail = useQuery({
    ...projectQueryOptions(orgSlug, ancestorProjectId ?? ''),
    enabled: Boolean(ancestorProjectId) && selection?.kind !== 'client',
  });
  const ancestorClientId = projectDetail.data?.clientId;

  const ancestorPath = useMemo(() => {
    const ids: string[] = [];
    if (ancestorClientId) ids.push(ancestorClientId);
    if (selection?.kind === 'plan' && ancestorProjectId) ids.push(ancestorProjectId);
    return ids;
  }, [ancestorClientId, ancestorProjectId, selection?.kind]);

  const ancestorKey = ancestorPath.join(',');
  useEffect(() => {
    if (ancestorPath.length > 0) expandPath(ancestorPath);
    // ancestorKey captures the path identity without depending on the array reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancestorKey, expandPath]);

  return {
    rows,
    selection,
    orgSlug,
    isExpanded: expansion.isExpanded,
    toggle: expansion.toggle,
    expand: expansion.expand,
    collapse: expansion.collapse,
  };
}
