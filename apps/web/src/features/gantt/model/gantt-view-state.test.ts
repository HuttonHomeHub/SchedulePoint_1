import { describe, expect, it } from 'vitest';

import { DEFAULT_GANTT_SORT } from '../layout/row-model';

import {
  DEFAULT_HIDDEN_COLUMNS,
  GANTT_VIEW_DEFAULTS,
  GANTT_VIEW_PARAMS,
  HIDEABLE_COLUMNS,
  MAX_COLLAPSED_IN_URL,
  parseCollapsed,
  parseGanttViewState,
  parseHiddenColumns,
  parseSort,
  serialiseCollapsed,
  serialiseHiddenColumns,
  serialiseSort,
} from './gantt-view-state';

/**
 * **The view memory's readers, driven with what the ROUTER actually hands them.**
 *
 * The cases that earn their place are the non-string ones. `docs/TECH_DEBT.md` #96: TanStack
 * Router JSON-parses every search param, so `?gsort=1` arrives as a **number** — and ADR-0074 M5
 * shipped a live defect from precisely that, invisible to a unit suite because those mock
 * `useSearch` and never cross the parser. These do cross it, by passing the parsed shapes.
 */

describe('the sort param', () => {
  it('defaults when the URL says nothing', () => {
    expect(parseSort(undefined)).toEqual(DEFAULT_GANTT_SORT);
  });

  it('reads a key and a direction', () => {
    expect(parseSort('earlyStart:desc')).toEqual({ key: 'earlyStart', direction: 'desc' });
  });

  it('takes a bare key as ascending, because that is a legible thing to type', () => {
    expect(parseSort('duration')).toEqual({ key: 'duration', direction: 'asc' });
  });

  it('degrades an unknown key to the default rather than throwing', () => {
    // A removed column, a typo, a URL from a future version. The planner gets a working chart.
    expect(parseSort('inventedColumn:desc')).toEqual(DEFAULT_GANTT_SORT);
  });

  it('survives the router handing it a NUMBER (TECH_DEBT #96)', () => {
    // `?gsort=1` — the exact shape that shipped a defect in ADR-0074 M5.
    expect(parseSort(1)).toEqual(DEFAULT_GANTT_SORT);
  });

  it('survives a boolean and a repeated param', () => {
    expect(parseSort(true)).toEqual(DEFAULT_GANTT_SORT);
    // `?gsort=name:desc&gsort=code` → an array. First wins; it does not crash and it does not
    // silently sort by something nobody asked for.
    expect(parseSort(['name:desc', 'code'])).toEqual({ key: 'name', direction: 'desc' });
  });

  it('round-trips', () => {
    const sort = { key: 'totalFloat', direction: 'desc' } as const;
    expect(parseSort(serialiseSort(sort))).toEqual(sort);
  });
});

describe('the hidden-columns param', () => {
  it('hides predecessors by default — a chart does not grow a column overnight', () => {
    expect([...parseHiddenColumns(undefined)]).toEqual([...DEFAULT_HIDDEN_COLUMNS]);
  });

  it('distinguishes "hide nothing" from "say nothing"', () => {
    // The case that makes the round trip work at all: a planner who switches Predecessors ON must
    // be able to express it, and an empty string is how. Reading it as "unset" would silently
    // restore the default and make that choice unstickable.
    expect([...parseHiddenColumns('')]).toEqual([]);
    expect([...parseHiddenColumns(undefined)]).toEqual([...DEFAULT_HIDDEN_COLUMNS]);
  });

  it('drops a key nobody may hide, rather than honouring it', () => {
    // `name` identifies the row and carries the editor and the de-emphasis marker. A URL asking to
    // hide it is answered by not hiding it.
    expect([...parseHiddenColumns('name,code')]).toEqual(['code']);
  });

  it('ignores a key that is not a column at all', () => {
    expect([...parseHiddenColumns('code,notAColumn')]).toEqual(['code']);
  });

  it('serialises in a stable order, whatever order they were switched off in', () => {
    // A URL that differs by the history of how it was made is a URL nobody can compare.
    const a = serialiseHiddenColumns(new Set(['totalFloat', 'code'] as const));
    const b = serialiseHiddenColumns(new Set(['code', 'totalFloat'] as const));
    expect(a).toBe(b);
    expect(a).toBe('code,totalFloat');
  });

  it('encodes "hide nothing" as a value the URL can CARRY, not the empty string', () => {
    // The defect `view-state.spec.ts` found on its first run. `useUrlFilterState` deletes any param
    // whose value is `''` — its defaults-are-omitted rule — so an empty hidden-set round-tripped to
    // no param at all, which the parser then correctly read as the DEFAULT. Switching Predecessors
    // ON was therefore unrepresentable.
    //
    // The case above asserts the parser's half and passed throughout; nothing crossed the hook that
    // deletes the value, because unit tests hand the parser its input directly. This asserts the
    // ENCODING instead: whatever "hide nothing" serialises to must survive a rule that drops empties.
    const serialised = serialiseHiddenColumns(new Set());
    expect(serialised).not.toBe('');
    expect([...parseHiddenColumns(serialised)]).toEqual([]);
  });

  it('still reads a bare empty string as "hide nothing", for a URL typed by hand', () => {
    expect([...parseHiddenColumns('')]).toEqual([]);
  });

  it('round-trips every hideable column', () => {
    const all = new Set(HIDEABLE_COLUMNS);
    expect([...parseHiddenColumns(serialiseHiddenColumns(all))].sort()).toEqual(
      [...HIDEABLE_COLUMNS].sort(),
    );
  });
});

describe('the collapsed param', () => {
  it('is empty when the URL says nothing', () => {
    expect(parseCollapsed(undefined).size).toBe(0);
  });

  it('reads a list', () => {
    expect([...parseCollapsed('a,b')]).toEqual(['a', 'b']);
  });

  it('reports what the cap withheld rather than truncating silently', () => {
    // Ids are 36 characters; an uncapped list on a hundred-phase programme builds a URL that gets
    // truncated in transit, and a half-restored view looks deliberate. The count is the caller's
    // to act on.
    const many = new Set(Array.from({ length: MAX_COLLAPSED_IN_URL + 5 }, (_, i) => `id-${i}`));
    const { value, withheld } = serialiseCollapsed(many);
    expect(value.split(',')).toHaveLength(MAX_COLLAPSED_IN_URL);
    expect(withheld).toBe(5);
  });

  it('answers with a count even when nothing was withheld', () => {
    // `0` rather than an absent field, so a caller cannot forget the case exists.
    expect(serialiseCollapsed(new Set(['a'])).withheld).toBe(0);
  });

  it('reads MORE than the cap, because a URL from a future cap should still open', () => {
    const ids = Array.from({ length: MAX_COLLAPSED_IN_URL + 10 }, (_, i) => `id-${i}`);
    expect(parseCollapsed(ids.join(',')).size).toBe(ids.length);
  });
});

describe('the whole state', () => {
  it('reads an untouched URL as the defaults', () => {
    const state = parseGanttViewState({});
    expect(state.sort).toEqual(DEFAULT_GANTT_SORT);
    expect([...state.hiddenColumns]).toEqual([...DEFAULT_HIDDEN_COLUMNS]);
    expect(state.collapsed.size).toBe(0);
  });

  it('reads a fully specified URL', () => {
    const state = parseGanttViewState({
      [GANTT_VIEW_PARAMS.sort]: 'name:desc',
      [GANTT_VIEW_PARAMS.hidden]: 'code',
      [GANTT_VIEW_PARAMS.collapsed]: 'x,y',
    });
    expect(state.sort).toEqual({ key: 'name', direction: 'desc' });
    expect([...state.hiddenColumns]).toEqual(['code']);
    expect([...state.collapsed]).toEqual(['x', 'y']);
  });

  it('derives its defaults from the same constants the parsers use', () => {
    // A hand-written literal here would be a SECOND definition of "default" — and the two would
    // drift the first time one changed, leaving a value that is serialised into every URL because
    // the omit-check no longer recognises it.
    const state = parseGanttViewState({});
    expect(GANTT_VIEW_DEFAULTS[GANTT_VIEW_PARAMS.sort]).toBe(serialiseSort(state.sort));
    expect(GANTT_VIEW_DEFAULTS[GANTT_VIEW_PARAMS.hidden]).toBe(
      serialiseHiddenColumns(state.hiddenColumns),
    );
    expect(GANTT_VIEW_DEFAULTS[GANTT_VIEW_PARAMS.collapsed]).toBe('');
  });
});
