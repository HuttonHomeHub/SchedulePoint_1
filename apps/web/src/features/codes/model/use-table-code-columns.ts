import { useCallback, useMemo } from 'react';

import { useCodeColumns, type CodeColumnsHost } from './use-code-columns';

import { useUrlFilterState } from '@/hooks/use-url-filter-state';
import { parseCodeColumnIds } from '@/lib/code-columns';

/** The table's code-column choice in the URL; the Gantt keeps its own (`gcodes`), see `m3-ui-design.md` §5.2. */
const TABLE_CODES_PARAM = 'acodes';
const DEFAULTS: Record<string, string> = { [TABLE_CODES_PARAM]: '' };

function parseRaw(raw: Record<string, unknown>): Record<string, string> {
  // The ids are parsed (and `searchString` applied) by `parseCodeColumnIds`; here we only carry the
  // value through, as the Gantt's view state does for its own params.
  const value = raw[TABLE_CODES_PARAM];
  return {
    [TABLE_CODES_PARAM]:
      typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '',
  };
}

/**
 * **The Activities table's code columns**, kept in the URL as `acodes` so a reload keeps them and a
 * link carries them (`m3-ui-design.md` §5.2). Off by default: an absent parameter shows none.
 *
 * Needs the router, like every `useUrlFilterState` caller, so it belongs to the workspace host and not to
 * the table, which its own unit tests mount bare.
 */
export function useTableCodeColumns(orgSlug: string, planId: string): CodeColumnsHost {
  const [params, setParams] = useUrlFilterState(DEFAULTS, parseRaw);
  const requestedIds = useMemo(() => parseCodeColumnIds(params[TABLE_CODES_PARAM]), [params]);
  const write = useCallback(
    (serialised: string) => setParams({ [TABLE_CODES_PARAM]: serialised }),
    [setParams],
  );
  return useCodeColumns({ orgSlug, planId, requestedIds, write });
}
