import type { ActivitySummary } from '@repo/types';

/** The row overflow menu's open state: the row it belongs to and where the trigger sat. */
export interface RowMenuState {
  activity: ActivitySummary;
  anchor: { x: number; y: number };
}

interface ActivitiesTableState {
  /** Ids, not rows: the list refetches under the selection (see `ActivitiesTable`). */
  selectedIds: ReadonlySet<string>;
  menu: RowMenuState | null;
}

/**
 * The activities table's per-row volatile state — the bulk-assign selection and the open row menu —
 * held **outside React state** so the columns that render it never have to change.
 *
 * `docs/TECH_DEBT.md` #334, M2. These two used to be `useState` read by closure inside each cell
 * renderer, which made `columns` a fresh array on every toggle and every row re-render for it: at
 * 2,000 rows a single checkbox tick re-ran ~2,000 rows of cells. With the state here, a cell mounts
 * a small leaf that subscribes to **its own row's slice** (`useSyncExternalStore` with a boolean
 * snapshot), so the columns stay identity-stable, `DataTable`'s memoised rows skip, and only the
 * one row whose slice changed re-renders. A plain `useState` lifted into a context would not do
 * that — a context change re-renders every consumer.
 *
 * It is a per-table instance, never a module singleton: two tables on a page (or two tests) must
 * not share a selection.
 */
export function createActivitiesTableStore(): {
  getState: () => ActivitiesTableState;
  subscribe: (listener: () => void) => () => void;
  toggleRow: (id: string) => void;
  setSelectedIds: (ids: ReadonlySet<string>) => void;
  clearSelection: () => void;
  setMenu: (menu: RowMenuState | null) => void;
} {
  let state: ActivitiesTableState = { selectedIds: new Set(), menu: null };
  const listeners = new Set<() => void>();
  const commit = (next: ActivitiesTableState): void => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggleRow: (id) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      commit({ ...state, selectedIds: next });
    },
    setSelectedIds: (ids) => commit({ ...state, selectedIds: ids }),
    clearSelection: () => commit({ ...state, selectedIds: new Set() }),
    setMenu: (menu) => commit({ ...state, menu }),
  };
}

export type ActivitiesTableStore = ReturnType<typeof createActivitiesTableStore>;
