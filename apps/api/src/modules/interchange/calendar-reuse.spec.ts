import type { ImportCalendarScope } from '@repo/interchange';
import { describe, expect, it } from 'vitest';

import {
  REUSE_CONTENT_CHUNK,
  resolveCalendarReuse,
  type CalendarResolution,
  type ReuseCandidate,
  type SourceCalendar,
} from './calendar-reuse';
import { isImportedVariantOf } from './imported-name';

const TODAY = '2026-10-26';

const source = (
  key: string,
  name: string,
  identityKey = 'A',
  scope: ImportCalendarScope = 'PROJECT',
): SourceCalendar => ({ key, name, scope, identityKey });

/** A candidate and the identity key its stored content would produce. */
interface Stored extends ReuseCandidate {
  readonly identityKey: string;
}

const candidate = (id: string, name: string, identityKey = 'A', day = 1): Stored => ({
  id,
  name,
  identityKey,
  createdAt: new Date(Date.UTC(2026, 9, day)),
});

async function run(
  calendars: SourceCalendar[],
  candidates: Stored[],
  scope: ImportCalendarScope = 'PROJECT',
  taken: string[] = candidates.map((c) => c.name),
  reads: string[][] = [],
): Promise<Map<string, CalendarResolution>> {
  const keyOf = new Map(candidates.map((c) => [c.id, c.identityKey]));
  return resolveCalendarReuse({
    calendars,
    candidatesByScope: new Map([[scope, candidates]]),
    couldMatch: () => true,
    loadKeys: (ids) => {
      reads.push([...ids]);
      return Promise.resolve(new Map(ids.map((id) => [id, keyOf.get(id) ?? ''])));
    },
    takenByScope: new Map([[scope, new Set(taken)]]),
    today: TODAY,
    maxNameLength: 120,
    onNoFreeName: () => {
      throw new Error('no free name');
    },
  });
}

describe('resolveCalendarReuse (ADR-0208 D2)', () => {
  it('reuses an identical calendar of the same name', async () => {
    const out = await run([source('c1', 'Site 6-Day')], [candidate('x', 'Site 6-Day')]);
    expect(out.get('c1')).toEqual({ kind: 'reuse', id: 'x', existingName: 'Site 6-Day' });
  });

  it('creates a copy, as before, when the content differs', async () => {
    const out = await run([source('c1', 'Site 6-Day', 'A')], [candidate('x', 'Site 6-Day', 'B')]);
    expect(out.get('c1')).toEqual({ kind: 'create', name: `Site 6-Day (imported ${TODAY})` });
  });

  it('reuses the importer`s own variant of the name', async () => {
    const out = await run(
      [source('c1', 'Site 6-Day')],
      [candidate('x', 'Site 6-Day (imported 2026-10-20)')],
    );
    expect(out.get('c1')).toMatchObject({ kind: 'reuse', id: 'x' });
  });

  it('prefers the exact name over a variant, then the oldest variant', async () => {
    const exact = await run(
      [source('c1', 'Site 6-Day')],
      [
        candidate('v', 'Site 6-Day (imported 2026-10-20)', 'A', 1),
        candidate('e', 'Site 6-Day', 'A', 5),
      ],
    );
    expect(exact.get('c1')).toMatchObject({ id: 'e' });

    const oldest = await run(
      [source('c1', 'Site 6-Day')],
      [
        candidate('new', 'Site 6-Day (imported 2026-10-22)', 'A', 9),
        candidate('old', 'Site 6-Day (imported 2026-10-20)', 'A', 2),
      ],
    );
    expect(oldest.get('c1')).toMatchObject({ id: 'old' });
  });

  it('never reuses an unrelated name that shares the prefix', async () => {
    const out = await run([source('c1', 'Site 6-Day')], [candidate('x', 'Site 6-Day North')]);
    expect(out.get('c1')).toMatchObject({ kind: 'create' });
  });

  it('lets one existing calendar be claimed once: the second identical source is created', async () => {
    const out = await run(
      [source('c1', 'Site 6-Day'), source('c2', 'Site 6-Day')],
      [candidate('x', 'Site 6-Day')],
    );
    expect(out.get('c1')).toMatchObject({ kind: 'reuse', id: 'x' });
    expect(out.get('c2')).toEqual({ kind: 'create', name: `Site 6-Day (imported ${TODAY})` });
  });

  it('creates a source that matches nothing under today`s free name', async () => {
    const out = await run([source('c1', 'Crew A')], []);
    expect(out.get('c1')).toEqual({ kind: 'create', name: 'Crew A' });
  });

  it('gives two created sources of one name different variants', async () => {
    const out = await run(
      [source('c1', 'Crew A', 'A'), source('c2', 'Crew A', 'B')],
      [],
      'PROJECT',
      ['Crew A'],
    );
    expect(out.get('c1')).toEqual({ kind: 'create', name: `Crew A (imported ${TODAY})` });
    expect(out.get('c2')).toEqual({ kind: 'create', name: `Crew A (imported ${TODAY}) (2)` });
  });

  it('applies the same rule per tier and does not cross them', async () => {
    const out = await resolveCalendarReuse({
      calendars: [source('p', 'Shared', 'A', 'PROJECT'), source('o', 'Shared', 'A', 'ORG')],
      candidatesByScope: new Map([['ORG', [candidate('org', 'Shared')]]]),
      couldMatch: () => true,
      loadKeys: (ids) => Promise.resolve(new Map(ids.map((id) => [id, 'A']))),
      takenByScope: new Map([['ORG', new Set(['Shared'])]]),
      today: TODAY,
      maxNameLength: 120,
      onNoFreeName: () => {
        throw new Error('no free name');
      },
    });
    expect(out.get('p')).toEqual({ kind: 'create', name: 'Shared' });
    expect(out.get('o')).toMatchObject({ kind: 'reuse', id: 'org' });
  });

  it('skips a candidate the aggregate rule excluded without reading its content', async () => {
    const reads: string[][] = [];
    const keyOf = new Map([['skip', 'A']]);
    const out = await resolveCalendarReuse({
      calendars: [source('c1', 'Site 6-Day')],
      candidatesByScope: new Map([['PROJECT', [candidate('skip', 'Site 6-Day')]]]),
      couldMatch: () => false,
      loadKeys: (ids) => {
        reads.push([...ids]);
        return Promise.resolve(new Map(ids.map((id) => [id, keyOf.get(id) ?? ''])));
      },
      takenByScope: new Map([['PROJECT', new Set(['Site 6-Day'])]]),
      today: TODAY,
      maxNameLength: 120,
      onNoFreeName: () => {
        throw new Error('no free name');
      },
    });
    expect(out.get('c1')).toMatchObject({ kind: 'create' });
    expect(reads).toEqual([]);
  });
});

describe('resolveCalendarReuse is lazy but chooses what an eager comparison chooses', () => {
  // A pile of variants of one name, in a scrambled creation order, a few of which are identical.
  const pile = (identical: readonly number[]): Stored[] =>
    Array.from({ length: 23 }, (_, i) =>
      candidate(
        `id-${String(i).padStart(2, '0')}`,
        i === 17
          ? 'Site 6-Day'
          : `Site 6-Day (imported 2026-09-${String((i % 27) + 1).padStart(2, '0')})`,
        identical.includes(i) ? 'A' : 'B',
        ((i * 7) % 23) + 1,
      ),
    );

  /** The eager choice: every candidate compared, the most preferred identical one taken. */
  const eagerChoice = (candidates: Stored[], name: string, key: string): string | undefined =>
    candidates
      .filter((c) => c.identityKey === key && isImportedVariantOf(c.name, name, 120))
      .sort((a, b) => {
        const exact = Number(b.name === name) - Number(a.name === name);
        return exact || a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1);
      })[0]?.id;

  it.each([[[5, 9, 20]], [[17]], [[0]], [[22]], [[3, 4, 5, 6, 7, 8, 9, 10, 11, 12]], [[]]])(
    'identical at %j',
    async (identical) => {
      const candidates = pile(identical);
      const reads: string[][] = [];
      const out = await run([source('c1', 'Site 6-Day')], candidates, 'PROJECT', [], reads);
      const expected = eagerChoice(candidates, 'Site 6-Day', 'A');
      const got = out.get('c1');
      if (expected === undefined) expect(got).toMatchObject({ kind: 'create' });
      else expect(got).toMatchObject({ kind: 'reuse', id: expected });
      expect(reads.every((ids) => ids.length <= REUSE_CONTENT_CHUNK)).toBe(true);
    },
  );

  it('reads ONE calendar when the most preferred candidate is identical', async () => {
    const candidates = pile([17]); // the exact name
    const reads: string[][] = [];
    await run([source('c1', 'Site 6-Day')], candidates, 'PROJECT', [], reads);
    expect(reads).toEqual([['id-17']]);
  });

  it('reads every candidate, chunk by chunk, only when none is identical', async () => {
    const candidates = pile([]);
    const reads: string[][] = [];
    await run([source('c1', 'Site 6-Day')], candidates, 'PROJECT', [], reads);
    expect(reads.flat()).toHaveLength(candidates.length);
    expect(reads).toHaveLength(1 + Math.ceil((candidates.length - 1) / REUSE_CONTENT_CHUNK));
  });
});
