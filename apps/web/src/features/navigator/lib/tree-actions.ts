/**
 * Pure model for the in-tree CRUD menu (ADR-0029 Phase 2). Given a node kind and
 * whether the current user may write, it returns the ordered actions the row's
 * context menu should offer. No DOM/React — exhaustively unit-tested and consumed
 * by the `HierarchyTree` view. The coordinator (shell layer) turns a chosen action
 * into the matching dialog + existing mutation, so this stays UI-only.
 */

import type { NodeKind } from './tree-model';

/**
 * A CRUD intent a tree row can emit. `create-project`/`create-plan` are the
 * "create a child" actions (only offered on the parent kind); `rename`/`delete`
 * act on the node itself. Root client creation is a rail-header affordance, not a
 * node action, so it is intentionally absent here.
 */
export type NodeActionKind = 'create-project' | 'create-plan' | 'rename' | 'delete';

/** One menu entry: the intent, its visible label, and whether it is destructive. */
export interface NodeAction {
  kind: NodeActionKind;
  label: string;
  destructive?: boolean;
}

/**
 * The actions a row offers. Non-writers get none (the tree then renders no trigger
 * at all). A client can spawn a project, a project can spawn a plan; every node can
 * be renamed or deleted. Order: create-child first, then rename, then the
 * destructive delete last.
 */
export function nodeActions(kind: NodeKind, canWrite: boolean): NodeAction[] {
  if (!canWrite) return [];
  const actions: NodeAction[] = [];
  if (kind === 'client') actions.push({ kind: 'create-project', label: 'New project' });
  if (kind === 'project') actions.push({ kind: 'create-plan', label: 'New plan' });
  actions.push({ kind: 'rename', label: 'Rename' });
  actions.push({ kind: 'delete', label: 'Delete', destructive: true });
  return actions;
}
