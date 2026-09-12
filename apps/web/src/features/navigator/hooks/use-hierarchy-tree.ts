import type { ClientSummary, PlanSummary, ProjectSummary } from '@repo/types';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useRef } from 'react';

import {
  flattenVisible,
  selectionFromParams,
  type ChildGroup,
  type Selection,
  type TreeNodeData,
  type VisibleRow,
} from '../lib/tree-model';

import { type UseExpansionState } from './use-expansion-state';

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

/**
 * A child group that has just stopped loading — the outcome of one lazy expansion.
 *
 * ADR-0029 §202-203 specified that these are announced ("12 projects loaded") and **nothing was
 * ever built**: `useAnnounce` had no reference anywhere under `features/navigator`
 * (`docs/TECH_DEBT.md` #307). Emitted here rather than announced here, because the shell mounts
 * **two** rails (pinned + drawer) sharing one expansion set, so both instances of this hook see
 * the same transition and only the visible one may speak. That discrimination needs a layout box,
 * which is the consumer's business — the `afterDelete` precedent in `HierarchyTree.tsx`.
 */
export interface LazyLoadOutcome {
  /** The expanded node whose children arrived. */
  parentId: string;
  /** What arrived, so the sentence can name it. Derived by construction, never inferred. */
  childKind: 'project' | 'plan';
  count: number;
  failed: boolean;
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
 *
 * Expansion is passed in (owned by the shell, ADR-0029 Phase 2) so the CRUD
 * coordinator can `expandPath` to reveal a freshly-created child, and both rail
 * instances (pinned + drawer) share one expansion set.
 */
export function useHierarchyTree(
  orgSlug: string,
  expansion: UseExpansionState,
  /**
   * Called once per group that leaves `loading` — **transitions, not states**, so a group that is
   * merely still loaded never reports and the consumer needs no memory of what it has said.
   * Optional: a consumer that does not care about lazy-load outcomes passes nothing.
   */
  onLazyLoadOutcome?: (outcome: LazyLoadOutcome) => void,
): HierarchyTree {
  const params = useParams({ strict: false });
  const selection = selectionFromParams(params);
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

  /**
   * **Which groups just stopped loading — reported through a callback, from an effect.**
   *
   * ADR-0029 §202-203 specified that lazy-load outcomes are announced ("12 projects loaded") and
   * **nothing was ever built**: `useAnnounce` had no reference anywhere under `features/navigator`
   * (`docs/TECH_DEBT.md` #307). This emits the transition; the consumer decides whether to speak,
   * because the shell mounts **two** rails sharing one expansion set and only the visible one may.
   *
   * **The first version computed this during render and that was wrong** — it read and wrote a ref
   * inside `useMemo`, which `react-hooks` rejects as "Cannot access refs during render", and
   * rightly: a render React discards would still have consumed the transition, and StrictMode's
   * double render would consume it twice. The docblock had justified render-time computation on the
   * ground that an effect keyed on `childrenByParent` would re-run on every background refetch and
   * re-announce a group that had not moved. That objection is real and is answered by keying the
   * effect on a **scalar signature** instead — the `afterDelete?.seq` pattern already used in
   * `HierarchyTree.tsx`, where the dependency is deliberately narrower than what the body reads.
   *
   * The child kind comes from WHICH collection the parent was in (`expandedClientIds` hold
   * clients, so their children are projects; `expandedProjectIds` hold projects, so theirs are
   * plans), which makes it right by construction. Looking it up in `rows` would be a second
   * derivation of a fact already known here, and would go wrong exactly when a parent is scrolled
   * out of the virtualized window.
   */
  const groupStates = useMemo(() => {
    const states: {
      parentId: string;
      childKind: 'project' | 'plan';
      status: ChildGroup['status'];
      count: number;
    }[] = [];
    const collect = (parentId: string, childKind: 'project' | 'plan'): void => {
      const group = childrenByParent.get(parentId);
      if (group)
        states.push({ parentId, childKind, status: group.status, count: group.nodes.length });
    };
    expandedClientIds.forEach((clientId) => collect(clientId, 'project'));
    expandedProjectIds.forEach((projectId) => collect(projectId, 'plan'));
    return states;
  }, [childrenByParent, expandedClientIds, expandedProjectIds]);

  /** The effect's real dependency: what would have to change for an outcome to exist. */
  const groupSignature = groupStates
    .map((state) => `${state.parentId}:${state.status}:${state.count}`)
    .join('|');

  const previousStatuses = useRef(new Map<string, ChildGroup['status']>());
  useEffect(() => {
    const previous = previousStatuses.current;
    const next = new Map<string, ChildGroup['status']>();
    const outcomes: LazyLoadOutcome[] = [];
    groupStates.forEach((state) => {
      next.set(state.parentId, state.status);
      const settled = state.status === 'loaded' || state.status === 'error';
      // Only a LOADING → settled edge counts. A group that is merely already loaded (a re-render,
      // a collapse and re-expand served from cache) never reports, which is why the consumer does
      // not have to remember what it has already said.
      if (previous.get(state.parentId) === 'loading' && settled) {
        outcomes.push({
          parentId: state.parentId,
          childKind: state.childKind,
          count: state.count,
          failed: state.status === 'error',
        });
      }
    });
    previousStatuses.current = next;
    outcomes.forEach((outcome) => onLazyLoadOutcome?.(outcome));
    // `groupSignature` is the dependency: it changes exactly when a status or a count does, which
    // is the only way an outcome can arise. `groupStates` and the callback are read but deliberately
    // not depended on — the map is rebuilt on every background refetch, and depending on it would
    // re-run this with nothing having moved. The `afterDelete?.seq` precedent, one file over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupSignature]);

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
