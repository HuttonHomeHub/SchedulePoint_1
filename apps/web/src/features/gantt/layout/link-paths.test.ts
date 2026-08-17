import type { DependencySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { ganttLinkPaths, predecessorSummary } from './link-paths';

/**
 * **M4-T1 — which links are drawn, and what is said about the ones that are not.**
 *
 * The two assertions that carry weight are the culling rule (a link with both ends off-window is
 * not drawn) and the cap's **reported** withheld count. A cap that truncates silently reads as
 * "that is all the links there are", which is worse than no overlay: the reader draws a conclusion
 * from an absence that is an artefact.
 */

const link = (id: string, from: string, to: string): DependencySummary =>
  ({
    id,
    type: 'FS',
    predecessor: { id: from, code: null, name: from.toUpperCase() },
    successor: { id: to, code: null, name: to.toUpperCase() },
  }) as unknown as DependencySummary;

/** Rows a to e at indices 0–4 — the "window". */
const WINDOW = new Map([
  ['a', 0],
  ['b', 1],
  ['c', 2],
]);

describe('the culling rule', () => {
  it('draws a link with both endpoints on screen', () => {
    const { paths } = ganttLinkPaths({
      dependencies: [link('1', 'a', 'b')],
      rowIndexById: WINDOW,
      showAll: true,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ fromRow: 0, toRow: 1, fromOffscreen: false });
  });

  it('draws a link with ONE endpoint on screen, and marks the other off', () => {
    // The chain does not stop at the window edge, and drawing it as if it did would be a claim about
    // the plan rather than about the viewport. The stub flag is what lets the renderer say so.
    const { paths } = ganttLinkPaths({
      dependencies: [link('1', 'zz', 'b')],
      rowIndexById: WINDOW,
      showAll: true,
    });
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({ fromRow: null, toRow: 1, fromOffscreen: true });
  });

  it('drops a link with BOTH endpoints off screen', () => {
    // The rejected alternative — every link whose row SPAN crosses the window — would draw this one:
    // a line across the whole chart showing neither party to the relationship it asserts. Measured
    // as well as argued (M0-T1 R5): the adopted rule is sort-independent at p95 71–74, the rejected
    // one reaches 88 p95 / 93 max under the Start sort.
    const { paths } = ganttLinkPaths({
      dependencies: [link('1', 'yy', 'zz')],
      rowIndexById: WINDOW,
      showAll: true,
    });
    expect(paths).toHaveLength(0);
  });
});

describe('the toggle and the selection', () => {
  it('draws nothing when the toggle is off and nothing is selected', () => {
    const { paths } = ganttLinkPaths({
      dependencies: [link('1', 'a', 'b')],
      rowIndexById: WINDOW,
      showAll: false,
    });
    expect(paths).toHaveLength(0);
  });

  it("draws a selected row's own links with the toggle OFF", () => {
    // The toggle's off-state, not an exception to it: "why is this bar here?" has to be answerable
    // without turning anything on, and it is bounded by that activity's degree.
    const { paths } = ganttLinkPaths({
      dependencies: [link('1', 'a', 'b'), link('2', 'b', 'c')],
      rowIndexById: WINDOW,
      showAll: false,
      selectedId: 'a',
    });
    expect(paths.map((p) => p.id)).toEqual(['1']);
  });

  it('draws both directions for the selection, not just successors', () => {
    const { paths } = ganttLinkPaths({
      dependencies: [link('1', 'a', 'b'), link('2', 'b', 'c')],
      rowIndexById: WINDOW,
      showAll: false,
      selectedId: 'b',
    });
    expect(paths.map((p) => p.id)).toEqual(['1', '2']);
  });
});

describe('the cap', () => {
  const many = Array.from({ length: 10 }, (_, i) => link(String(i), 'a', 'b'));

  it('reports what it withheld, rather than truncating silently', () => {
    const { paths, withheld } = ganttLinkPaths({
      dependencies: many,
      rowIndexById: WINDOW,
      showAll: true,
      max: 4,
    });
    expect(paths).toHaveLength(4);
    // The number the caller must show. Without it the reader concludes there are four links.
    expect(withheld).toBe(6);
  });

  it('always answers with a count, even when nothing was withheld', () => {
    // `withheld: 0` rather than an absent field, so a caller cannot forget the case exists — the
    // difference between "no cap fired" and "we did not look" should not be a missing property.
    const { withheld } = ganttLinkPaths({
      dependencies: [link('1', 'a', 'b')],
      rowIndexById: WINDOW,
      showAll: true,
    });
    expect(withheld).toBe(0);
  });

  it('does not count a culled link as withheld', () => {
    // A link dropped by the culling rule is not "not shown because we ran out"; conflating the two
    // would report a cap on every scrolled plan and teach the reader to ignore the number.
    const { withheld } = ganttLinkPaths({
      dependencies: [link('1', 'yy', 'zz')],
      rowIndexById: WINDOW,
      showAll: true,
      max: 1,
    });
    expect(withheld).toBe(0);
  });
});

describe('the textual equivalent', () => {
  it('names the predecessors rather than counting them', () => {
    // "2 predecessors" says there is something to look for and not what it is; the whole question a
    // planner asks of a link is WHICH activity.
    expect(predecessorSummary('c', [link('1', 'a', 'c'), link('2', 'b', 'c')])).toBe(
      'Follows A, B.',
    );
  });

  it('says nothing at all for a row with no predecessors', () => {
    // Not "Follows nothing" — an empty sentence on every unconstrained row is noise in the one
    // channel a screen-reader user has.
    expect(predecessorSummary('a', [link('1', 'a', 'b')])).toBeNull();
  });
});
