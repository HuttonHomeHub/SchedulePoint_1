import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { codeTypesQueryOptions, useCodeTypes } from '../api/use-code-types';
import { codeValuesQueryOptions } from '../api/use-code-values';

import { codeValueName } from './code-names';

import {
  CodeColumnsUnavailableError,
  NO_CODE_COLUMNS,
  resolveCodeColumnIds,
  serialiseCodeColumnIds,
  type CodeColumn,
  type CodeColumnsChoice,
} from '@/lib/code-columns';

/** One shown type's values as the columns need them: their state, and the rows when there are any. */
interface ShownValues {
  status: 'pending' | 'success' | 'error';
  data: CodeValueSummary[] | undefined;
}

const NO_IDS: readonly string[] = [];

const sameShown = (a: readonly ShownValues[], b: readonly ShownValues[]): boolean =>
  a.length === b.length && a.every((x, i) => x.status === b[i]?.status && x.data === b[i]?.data);

/** `useQueries`' `combine` must be a stable reference, or the result is rebuilt on every render. */
const combineValues = (
  results: readonly {
    status: 'pending' | 'success' | 'error';
    data: CodeValueSummary[] | undefined;
  }[],
): ShownValues[] => results.map((r) => ({ status: r.status, data: r.data }));

/**
 * One type drawn as a column. **The cell reads the value's name** (`codeValueName`: the description, else
 * the short code), the rule a history line and, from M4, a swimlane read by too, so a value reads the same
 * wherever it appears. An activity with no value, or whose value is not among the live ones, reads an em
 * dash: no cell ever falls back to an id.
 */
function buildColumn(
  type: Pick<CodeTypeSummary, 'id' | 'name'>,
  values: CodeValueSummary[] | undefined,
  status: CodeColumn['status'],
): CodeColumn {
  const names = new Map((values ?? []).map((value) => [value.id, codeValueName(value)]));
  return {
    key: type.id,
    label: type.name,
    status,
    text: (activity) => {
      const assigned = activity.codes?.find((c) => c.codeTypeId === type.id);
      return (assigned && names.get(assigned.codeValueId)) ?? '—';
    },
  };
}

export interface CodeColumnsHost {
  /** What the Columns menu and the `View ▾` list offer. Stable until a type or the choice changes. */
  choice: CodeColumnsChoice;
  /**
   * The columns to draw, in type order. **The identity changes only when a shown type, its name or its
   * values do**, so the table's column memo does not rebuild for anything else (the render-count test
   * is the gate), and with nothing shown it is the one shared empty array.
   */
  columns: readonly CodeColumn[];
  /**
   * The shown columns with their values **resolved before they are used**, for the printed programme:
   * paper never carries "Loading…", "Unavailable" or an id. Normally every type is cached (30 s), so it
   * costs no request; a type that cannot be loaded rejects with {@link CodeColumnsUnavailableError}
   * naming every such type.
   */
  resolvePrintColumns: () => Promise<readonly CodeColumn[]>;
}

/**
 * **The code columns one grid shows** (`m3-ui-design.md` §5.2): the requested ids from the URL, resolved
 * against the plan's live types, with each shown type's values loaded on demand and nothing loaded for a
 * hidden one.
 *
 * Called once per grid (the table and the Gantt keep separate choices); the two share one query per
 * type, so a type shown in both is one request.
 */
export function useCodeColumns(input: {
  orgSlug: string;
  planId: string;
  /** The ids the URL names, unresolved. */
  requestedIds: readonly string[];
  /** Write the shown ids back to the URL (already in type order and capped). */
  write: (serialised: string) => void;
}): CodeColumnsHost {
  const { orgSlug, planId, requestedIds, write } = input;
  const queryClient = useQueryClient();
  const types = useCodeTypes(orgSlug, planId);
  const typeList = types.data;

  const typeIds = useMemo(() => typeList?.map((t) => t.id) ?? NO_IDS, [typeList]);
  // Keyed by content: a host that re-parses the URL hands a new array of the same ids, and that must not
  // rebuild the columns. Ids are plain tokens (`parseCodeColumnIds`), so a comma cannot occur in one.
  const shownKey =
    typeList === undefined ? '' : resolveCodeColumnIds(requestedIds, typeIds).join(',');
  const shownIds = useMemo(() => (shownKey === '' ? NO_IDS : shownKey.split(',')), [shownKey]);

  const latest = useQueries({
    queries: shownIds.map((id) => codeValuesQueryOptions(orgSlug, planId, id)),
    combine: combineValues,
  });
  // `useQueries` hands back a fresh array on every render even when nothing in it changed, which would
  // rebuild every column (and the table's column memo with it). Hold the previous one until a status or
  // a values list actually differs — the "adjust state while rendering" form, which needs no ref.
  const [held, setHeld] = useState(latest);
  const unchanged = sameShown(held, latest);
  if (!unchanged) setHeld(latest);
  const shown = unchanged ? held : latest;

  const columns = useMemo(() => {
    if (typeList === undefined || shownIds.length === 0) return NO_CODE_COLUMNS;
    return shownIds.flatMap((id, i) => {
      const type = typeList.find((t) => t.id === id);
      const values = shown[i];
      if (type === undefined || values === undefined) return [];
      return [
        buildColumn(
          type,
          values.data,
          values.status === 'success' ? 'ready' : values.status === 'error' ? 'error' : 'loading',
        ),
      ];
    });
  }, [typeList, shownIds, shown]);

  const choiceTypes = useMemo(
    () => typeList?.map((t) => ({ id: t.id, name: t.name })) ?? [],
    [typeList],
  );
  const setShown = useCallback(
    (ids: readonly string[]) => write(serialiseCodeColumnIds(ids, typeIds)),
    [write, typeIds],
  );
  const status = types.isError ? 'error' : typeList === undefined ? 'loading' : 'ready';
  const choice = useMemo<CodeColumnsChoice>(
    () => ({ status, types: choiceTypes, shownIds, setShown }),
    [status, choiceTypes, shownIds, setShown],
  );

  const resolvePrintColumns = useCallback(
    () => resolveForPrint(queryClient, orgSlug, planId, typeList ?? [], shownIds),
    [queryClient, orgSlug, planId, typeList, shownIds],
  );

  return { choice, columns, resolvePrintColumns };
}

async function resolveForPrint(
  queryClient: QueryClient,
  orgSlug: string,
  planId: string,
  types: readonly CodeTypeSummary[],
  shownIds: readonly string[],
): Promise<readonly CodeColumn[]> {
  // The types are cached whenever a column is shown, but a print cannot assume it: ensure them too.
  const known =
    types.length > 0
      ? types
      : await queryClient.ensureQueryData(codeTypesQueryOptions(orgSlug, planId));
  const settled = await Promise.allSettled(
    shownIds.map((id) => queryClient.ensureQueryData(codeValuesQueryOptions(orgSlug, planId, id))),
  );
  const failed: string[] = [];
  const out: CodeColumn[] = [];
  shownIds.forEach((id, i) => {
    const type = known.find((t) => t.id === id);
    const result = settled[i];
    if (type === undefined || result === undefined) return;
    if (result.status === 'rejected') failed.push(type.name);
    else out.push(buildColumn(type, result.value, 'ready'));
  });
  if (failed.length > 0) throw new CodeColumnsUnavailableError(failed);
  return out;
}
