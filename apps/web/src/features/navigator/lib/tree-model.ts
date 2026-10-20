/**
 * Pure, headless model for the hierarchy navigator (ADR-0029, no DOM/React). The
 * tree is a **projection of loaded data + an expansion set**; selection is a pure
 * function of the URL. Everything here is exhaustively unit-tested and consumed by
 * the accessible `HierarchyTree` view and the `useHierarchyTree` data orchestrator.
 */

/** The three node kinds, top-down. Only clients/projects are expandable; plans are leaves. */
export type NodeKind = 'client' | 'project' | 'plan';

/** A single tree node — the minimum the view needs (identity, label, parent). */
export interface TreeNodeData {
  kind: NodeKind;
  id: string;
  name: string;
  /** Parent id: `null` for a client, the client id for a project, the project id for a plan. */
  parentId: string | null;
}

/** Load status of one parent's children (or the root client list). */
export type LoadStatus = 'idle' | 'loading' | 'error' | 'loaded';

/** A parent's children plus their load status (drives the synthetic state rows). */
export interface ChildGroup {
  status: LoadStatus;
  nodes: TreeNodeData[];
}

/** A rendered row: a real node, or a synthetic per-parent loading/empty/error row. */
export type RowType = 'node' | 'loading' | 'empty' | 'error';

/**
 * One flattened, visible row with the ARIA metadata a `treeitem` needs
 * (`aria-level`/`-setsize`/`-posinset`). State rows carry the same geometry so the
 * windowed view can render them uniformly.
 */
export interface VisibleRow {
  key: string;
  type: RowType;
  /** Present when `type === 'node'`. */
  node?: TreeNodeData;
  /** The parent whose children this row belongs to (`null` at the root). */
  parentId: string | null;
  /** 1-based depth (`aria-level`). */
  level: number;
  setSize: number;
  posInSet: number;
  expandable: boolean;
  expanded: boolean;
}

function stateRow(
  type: 'loading' | 'empty' | 'error',
  level: number,
  parentId: string | null,
): VisibleRow {
  return {
    key: `${parentId ?? 'root'}:${type}`,
    type,
    parentId,
    level,
    setSize: 1,
    posInSet: 1,
    expandable: false,
    expanded: false,
  };
}

/**
 * Flatten the visible tree, depth-first, into an ordered row list. Only expanded
 * parents contribute children; a parent that is expanded but whose children are
 * still loading / empty / errored contributes a single synthetic state row at the
 * child level. Generation is O(visible rows), never O(whole tree).
 */
export function flattenVisible(
  roots: ChildGroup,
  childrenByParent: ReadonlyMap<string, ChildGroup>,
  expanded: ReadonlySet<string>,
): VisibleRow[] {
  const rows: VisibleRow[] = [];

  const pushGroup = (group: ChildGroup, level: number, parentId: string | null): void => {
    if (group.status === 'loading' || group.status === 'idle') {
      rows.push(stateRow('loading', level, parentId));
      return;
    }
    if (group.status === 'error') {
      rows.push(stateRow('error', level, parentId));
      return;
    }
    if (group.nodes.length === 0) {
      rows.push(stateRow('empty', level, parentId));
      return;
    }
    group.nodes.forEach((node, index) => {
      const expandable = node.kind !== 'plan';
      const isExpanded = expandable && expanded.has(node.id);
      rows.push({
        key: node.id,
        type: 'node',
        node,
        parentId,
        level,
        setSize: group.nodes.length,
        posInSet: index + 1,
        expandable,
        expanded: isExpanded,
      });
      if (isExpanded) {
        pushGroup(
          childrenByParent.get(node.id) ?? { status: 'loading', nodes: [] },
          level + 1,
          node.id,
        );
      }
    });
  };

  pushGroup(roots, 1, null);
  return rows;
}

/** Selection derived from the current route (the URL is the source of truth). */
export interface Selection {
  kind: NodeKind;
  id: string;
}

/** The selected node from route params — the most specific id present, else `null`. */
export function selectionFromParams(params: {
  clientId?: string | undefined;
  projectId?: string | undefined;
  planId?: string | undefined;
}): Selection | null {
  if (params.planId) return { kind: 'plan', id: params.planId };
  if (params.projectId) return { kind: 'project', id: params.projectId };
  if (params.clientId) return { kind: 'client', id: params.clientId };
  return null;
}

/** A keyboard intent from the WAI-ARIA APG tree keymap (resolved by the view). */
export type TreeIntent =
  | 'prev'
  | 'next'
  | 'first'
  | 'last'
  | 'expand'
  | 'collapse'
  | 'firstChild'
  | 'toParent'
  | 'activate';

/**
 * Map a key press on a focused row to a tree intent (WAI-ARIA APG "Tree View").
 * Returns `null` for keys the tree doesn't handle (so the caller leaves them alone).
 */
export function treeKeydown(
  key: string,
  row: { expandable: boolean; expanded: boolean },
): TreeIntent | null {
  switch (key) {
    case 'ArrowDown':
      return 'next';
    case 'ArrowUp':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Enter':
      return 'activate';
    case ' ':
      // Space mirrors the ROW's own click; Enter mirrors the NAME's (#143, §19.13 gate). When
      // activate() started navigating for every kind, Space silently inherited it — and the key
      // that most closely stands in for "click the thing I'm sitting on" navigated the reader
      // away from the Explorer where the row's click toggles. A container toggles; a leaf
      // activates.
      if (row.expandable) return row.expanded ? 'collapse' : 'expand';
      return 'activate';
    case 'ArrowRight':
      if (row.expandable && !row.expanded) return 'expand';
      if (row.expandable && row.expanded) return 'firstChild';
      return null;
    case 'ArrowLeft':
      if (row.expandable && row.expanded) return 'collapse';
      return 'toParent';
    default:
      return null;
  }
}

/** The tree intents that move the roving focus to another row, as opposed to expanding or opening. */
export type FocusMove = 'prev' | 'next' | 'first' | 'last' | 'firstChild';

/**
 * Whether a row may be a focus destination: everything except the transient `loading` placeholder.
 * One predicate so the arrow-key target and the tab-stop fallback cannot disagree about it.
 */
export function isSettledRow(row: VisibleRow): boolean {
  return row.type !== 'loading';
}

/**
 * Where a focus move lands, as a row index (`docs/TECH_DEBT.md` #307(a)).
 *
 * **A `loading` row is transient status text and is never a destination while a real row exists.**
 * It has no operable command whose reason must stay reachable (so ADR-0082's "a shaded item keeps
 * its focus" does not transfer) and it is guaranteed to unmount when its fetch resolves — which is
 * how #297 (a stale tab stop) and #305 (focus dropped to `<body>`) were both reached. Skipping it
 * shrinks both surfaces to the root case. `empty` and `error` rows are settled state and stay
 * reachable.
 *
 * When there is nowhere to go the answer is `from` itself: focus stays put. The root case needs no
 * special branch — a whole list that is loading is a single `loading` row, which is the only row
 * there is, so `first`/`last` fall back to it.
 */
export function focusTarget(rows: readonly VisibleRow[], from: number, move: FocusMove): number {
  const settled = (index: number): boolean => {
    const row = rows[index];
    return row !== undefined && isSettledRow(row);
  };
  switch (move) {
    case 'next':
    case 'prev': {
      const step = move === 'next' ? 1 : -1;
      for (let i = from + step; i >= 0 && i < rows.length; i += step) {
        if (settled(i)) return i;
      }
      return from;
    }
    case 'first': {
      const found = rows.findIndex(isSettledRow);
      return found >= 0 ? found : 0;
    }
    case 'last': {
      const found = rows.findLastIndex(isSettledRow);
      return found >= 0 ? found : rows.length - 1;
    }
    case 'firstChild':
      // The child of an expanded node is the next row; if that is its loading placeholder the
      // parent keeps the focus, since the placeholder is the only thing there.
      return settled(from + 1) ? from + 1 : from;
  }
}
