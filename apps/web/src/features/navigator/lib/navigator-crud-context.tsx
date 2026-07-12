import { createContext, useContext } from 'react';

import type { NodeActionKind } from './tree-actions';
import type { NodeKind } from './tree-model';

/**
 * The seam that lets the **shared** tree emit CRUD intents to a shell-layer
 * coordinator without a `feature → feature` import (ADR-0029 Phase 2,
 * docs/FRONTEND_ARCHITECTURE.md). The tree consumes {@link useNavigatorCrud} to
 * decide whether to render write affordances and where to send an action; the
 * `NavigatorCrud` coordinator (composition layer) provides the implementation,
 * owning the dialogs + the existing mutation hooks. Kept pure (no feature deps) so
 * the navigator only ever depends *downward*.
 */

/** The node an action targets — enough for the coordinator to resolve + mutate it. */
export interface NodeActionTarget {
  kind: NodeKind;
  id: string;
  name: string;
  /** Parent id: `null` for a client, the client id for a project, the project id for a plan. */
  parentId: string | null;
}

/**
 * A one-shot signal from the coordinator back to the tree after a confirmed delete,
 * so the tree can re-home keyboard focus (the deleted row is gone — native dialog
 * focus-return would otherwise fall to `<body>`). `seq` makes each delete distinct so
 * a repeat delete of the same parent still fires the tree's effect.
 */
export interface AfterDeleteSignal {
  seq: number;
  /** Parent of the deleted node: focus lands on the parent row, or the tree if `null`. */
  parentId: string | null;
}

export interface NavigatorCrudApi {
  /** Whether the current user may write (drives whether the tree renders affordances). */
  canWrite: boolean;
  /** Dispatch a node action (rename/delete/create-child) to the coordinator. */
  onNodeAction: (action: NodeActionKind, target: NodeActionTarget) => void;
  /** Open the root "New client" dialog (the rail-header affordance). */
  onCreateClient: () => void;
  /** Bumped after a confirmed delete so the tree can re-home focus; `null` otherwise. */
  afterDelete: AfterDeleteSignal | null;
}

/** Inert default: no write surface. Flag-off / no-provider trees stay read-only. */
const INERT: NavigatorCrudApi = {
  canWrite: false,
  onNodeAction: () => {},
  onCreateClient: () => {},
  afterDelete: null,
};

const NavigatorCrudContext = createContext<NavigatorCrudApi>(INERT);

export const NavigatorCrudProvider = NavigatorCrudContext.Provider;

/** Read the CRUD seam. Returns the inert (read-only) API when no coordinator wraps. */
export function useNavigatorCrud(): NavigatorCrudApi {
  return useContext(NavigatorCrudContext);
}
