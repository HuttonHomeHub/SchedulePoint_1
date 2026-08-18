import { useCallback, useMemo } from 'react';

import type { GanttSort } from '../layout/row-model';

import {
  GANTT_VIEW_DEFAULTS,
  GANTT_VIEW_PARAMS,
  parseGanttViewState,
  serialiseCollapsed,
  serialiseHiddenColumns,
  serialiseSort,
  type GanttColumnKey,
  type GanttViewState,
} from './gantt-view-state';

import { useUrlFilterState } from '@/hooks/use-url-filter-state';

/** What a host hands the panel to make its view state stick (ADR-0095 M5-T6). */
export interface GanttViewStateBundle extends GanttViewState {
  onSortChange: (sort: GanttSort) => void;
  onHiddenColumnsChange: (hidden: ReadonlySet<GanttColumnKey>) => void;
  onCollapsedChange: (collapsed: ReadonlySet<string>) => void;
  /** Collapsed summaries the URL could not carry — see `serialiseCollapsed`. Usually 0. */
  collapsedWithheld: number;
}

/**
 * The Gantt's sort, hidden columns and collapse set, backed by the URL.
 *
 * A **bundle**, in the idiom this epic already uses for `editing`, `drag` and `dependencies`: the
 * panel takes it or it does not, and without it the panel keeps its own `useState` and behaves
 * byte-for-byte as before. That is what keeps the print surface and every existing test untouched —
 * they mount `GanttPanel` directly, outside any router, which is exactly the case
 * `useUrlFilterState`'s own docblock says to solve with props rather than the hook.
 *
 * `replace: true` comes from that hook and is right here: choosing a sort is a filter-shaped act,
 * and Back should leave the plan rather than walk backwards through six column choices. The view
 * SWITCH pushes (ADR-0059 §3) because it is one deliberate act; these are not.
 */
export function useGanttViewState(): GanttViewStateBundle {
  const [params, setParams] = useUrlFilterState(GANTT_VIEW_DEFAULTS, parseRaw);

  const state = useMemo(() => parseGanttViewState(params), [params]);
  const collapsedSerialised = useMemo(() => serialiseCollapsed(state.collapsed), [state.collapsed]);

  const onSortChange = useCallback(
    (sort: GanttSort) => setParams({ [GANTT_VIEW_PARAMS.sort]: serialiseSort(sort) }),
    [setParams],
  );

  const onHiddenColumnsChange = useCallback(
    (hidden: ReadonlySet<GanttColumnKey>) =>
      setParams({ [GANTT_VIEW_PARAMS.hidden]: serialiseHiddenColumns(hidden) }),
    [setParams],
  );

  const onCollapsedChange = useCallback(
    (collapsed: ReadonlySet<string>) =>
      setParams({ [GANTT_VIEW_PARAMS.collapsed]: serialiseCollapsed(collapsed).value }),
    [setParams],
  );

  return {
    ...state,
    onSortChange,
    onHiddenColumnsChange,
    onCollapsedChange,
    collapsedWithheld: collapsedSerialised.withheld,
  };
}

/**
 * `useUrlFilterState` is typed over `Record<string, string>`, so the raw search object is narrowed
 * to strings HERE and the meaning is parsed downstream. Two steps rather than one because the hook
 * compares against string defaults to decide what to delete from the URL — handing it a parsed
 * object would make that comparison structural, and "is this sort the default?" would stop being
 * answerable by `===`.
 */
function parseRaw(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = { ...GANTT_VIEW_DEFAULTS };
  for (const key of Object.values(GANTT_VIEW_PARAMS)) {
    const value = raw[key];
    // The #96 coercion lives in `gantt-view-state.ts`; here we only need "was anything said?".
    if (typeof value === 'string') out[key] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value);
  }
  return out;
}
