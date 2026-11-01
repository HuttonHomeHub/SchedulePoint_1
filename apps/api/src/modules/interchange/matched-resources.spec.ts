import type { ImportGraph } from '@repo/interchange';
import { describe, expect, it } from 'vitest';

import { describeMatchedResources, libraryCalendarIdsToRead } from './matched-resources';
import { matchImportResources, type LibraryResource } from './resource-match';

/**
 * ADR-0208 D7: which stored calendars the sameness judgement reads, and what it concludes. Pure, so the
 * service's one database read is exactly the set named here.
 */

const graphOf = (
  resources: { key: string; name: string; code: string | null; calendarKey: string | null }[],
): ImportGraph => ({ resources }) as unknown as ImportGraph;

const lib = (id: string, code: string, calendarId: string | null): LibraryResource => ({
  id,
  code,
  name: `Library ${id}`,
  archivedAt: null,
  calendarId,
});

const CANDIDATES = new Set(['K1', 'K2']);

function setup(
  rows: { key: string; code: string | null; calendarKey: string | null }[],
  library: LibraryResource[],
) {
  const graph = graphOf(rows.map((row) => ({ ...row, name: `Crew ${row.key}` })));
  return { graph, match: matchImportResources(graph, library, {}) };
}

describe('libraryCalendarIdsToRead', () => {
  it('names the stored calendar of a code-matched holder of a candidate calendar', () => {
    const library = [lib('L1', 'A', 'CAL-1')];
    const { graph, match } = setup([{ key: 'R1', code: 'A', calendarKey: 'K1' }], library);
    expect(libraryCalendarIdsToRead(graph, library, match, CANDIDATES)).toEqual(['CAL-1']);
  });

  it('reads nothing for an inserted resource, a non-candidate calendar or a calendar-less row', () => {
    const library = [lib('L1', 'A', 'CAL-1'), lib('L2', 'B', null)];
    const { graph, match } = setup(
      [
        { key: 'R1', code: 'A', calendarKey: 'OTHER' },
        { key: 'R2', code: 'B', calendarKey: 'K1' },
        { key: 'R3', code: 'C', calendarKey: 'K2' },
      ],
      library,
    );
    expect(libraryCalendarIdsToRead(graph, library, match, CANDIDATES)).toEqual([]);
  });

  it('follows an earlier-row match to the library row it ended on', () => {
    const library = [lib('L1', 'A', 'CAL-1')];
    const { graph, match } = setup(
      [
        { key: 'R1', code: 'A', calendarKey: null },
        { key: 'R2', code: 'A', calendarKey: 'K1' },
      ],
      library,
    );
    expect(match.decisions.get('R2')).toMatchObject({ kind: 'match', via: 'file' });
    expect(libraryCalendarIdsToRead(graph, library, match, CANDIDATES)).toEqual(['CAL-1']);
  });
});

describe('describeMatchedResources', () => {
  const sourceKeyOf = (key: string): string | undefined => ({ K1: 'week-A', K2: 'week-B' })[key];

  it('is the same when the kept calendar has the file’s identity key (E1)', () => {
    const library = [lib('L1', 'A', 'CAL-1')];
    const { graph, match } = setup([{ key: 'R1', code: 'A', calendarKey: 'K1' }], library);
    const matched = describeMatchedResources(
      graph,
      library,
      match,
      CANDIDATES,
      new Map([['CAL-1', 'week-A']]),
      sourceKeyOf,
    );
    expect(matched.get('R1')).toEqual({ name: 'Crew R1', keptCalendarSame: true });
  });

  it('is different when the keys differ', () => {
    const library = [lib('L1', 'A', 'CAL-1')];
    const { graph, match } = setup([{ key: 'R1', code: 'A', calendarKey: 'K1' }], library);
    const matched = describeMatchedResources(
      graph,
      library,
      match,
      CANDIDATES,
      new Map([['CAL-1', 'week-Z']]),
      sourceKeyOf,
    );
    expect(matched.get('R1')?.keptCalendarSame).toBe(false);
  });

  it('is different when the matched row has no calendar (E15) or its calendar was not returned', () => {
    const library = [lib('L1', 'A', null), lib('L2', 'B', 'GONE')];
    const { graph, match } = setup(
      [
        { key: 'R1', code: 'A', calendarKey: 'K1' },
        { key: 'R2', code: 'B', calendarKey: 'K2' },
      ],
      library,
    );
    const matched = describeMatchedResources(
      graph,
      library,
      match,
      CANDIDATES,
      new Map(),
      sourceKeyOf,
    );
    expect(matched.get('R1')?.keptCalendarSame).toBe(false);
    expect(matched.get('R2')?.keptCalendarSame).toBe(false);
  });

  it('compares an earlier row of the same file by its own calendar (E5)', () => {
    const { graph, match } = setup(
      [
        { key: 'R1', code: 'A', calendarKey: 'K1' },
        { key: 'R2', code: 'A', calendarKey: 'K2' },
      ],
      [],
    );
    const matched = describeMatchedResources(graph, [], match, CANDIDATES, new Map(), sourceKeyOf);
    // R1 is inserted, so it is not in the map; R2 matched it and its calendar (week-B) differs.
    expect(matched.has('R1')).toBe(false);
    expect(matched.get('R2')).toEqual({ name: 'Crew R2', keptCalendarSame: false });
  });

  it('omits an inserted resource, which is what keeps its calendar in the graph (E3, E8)', () => {
    const { graph, match } = setup([{ key: 'R1', code: 'A', calendarKey: 'K1' }], []);
    expect(
      describeMatchedResources(graph, [], match, CANDIDATES, new Map(), sourceKeyOf).size,
    ).toBe(0);
  });
});
