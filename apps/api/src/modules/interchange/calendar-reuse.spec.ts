import type { ImportCalendarScope } from '@repo/interchange';
import { describe, expect, it } from 'vitest';

import {
  resolveCalendarReuse,
  type CalendarResolution,
  type ReuseCandidate,
  type SourceCalendar,
} from './calendar-reuse';

const TODAY = '2026-10-26';

const source = (
  key: string,
  name: string,
  identityKey = 'A',
  scope: ImportCalendarScope = 'PROJECT',
) => ({ key, name, scope, identityKey }) satisfies SourceCalendar;

const candidate = (id: string, name: string, identityKey = 'A', day = 1): ReuseCandidate => ({
  id,
  name,
  identityKey,
  createdAt: new Date(Date.UTC(2026, 9, day)),
});

function run(
  calendars: SourceCalendar[],
  candidates: ReuseCandidate[],
  scope: ImportCalendarScope = 'PROJECT',
  taken: string[] = candidates.map((c) => c.name),
): Map<string, CalendarResolution> {
  return resolveCalendarReuse({
    calendars,
    candidatesByScope: new Map([[scope, candidates]]),
    takenByScope: new Map([[scope, new Set(taken)]]),
    today: TODAY,
    maxNameLength: 120,
    onNoFreeName: () => {
      throw new Error('no free name');
    },
  });
}

describe('resolveCalendarReuse (ADR-0208 D2)', () => {
  it('reuses an identical calendar of the same name', () => {
    const out = run([source('c1', 'Site 6-Day')], [candidate('x', 'Site 6-Day')]);
    expect(out.get('c1')).toEqual({ kind: 'reuse', id: 'x', existingName: 'Site 6-Day' });
  });

  it('creates a copy, as before, when the content differs', () => {
    const out = run([source('c1', 'Site 6-Day', 'A')], [candidate('x', 'Site 6-Day', 'B')]);
    expect(out.get('c1')).toEqual({ kind: 'create', name: `Site 6-Day (imported ${TODAY})` });
  });

  it('reuses the importer`s own variant of the name', () => {
    const out = run(
      [source('c1', 'Site 6-Day')],
      [candidate('x', 'Site 6-Day (imported 2026-10-20)')],
    );
    expect(out.get('c1')).toMatchObject({ kind: 'reuse', id: 'x' });
  });

  it('prefers the exact name over a variant, then the oldest variant', () => {
    const exact = run(
      [source('c1', 'Site 6-Day')],
      [
        candidate('v', 'Site 6-Day (imported 2026-10-20)', 'A', 1),
        candidate('e', 'Site 6-Day', 'A', 5),
      ],
    );
    expect(exact.get('c1')).toMatchObject({ id: 'e' });

    const oldest = run(
      [source('c1', 'Site 6-Day')],
      [
        candidate('new', 'Site 6-Day (imported 2026-10-22)', 'A', 9),
        candidate('old', 'Site 6-Day (imported 2026-10-20)', 'A', 2),
      ],
    );
    expect(oldest.get('c1')).toMatchObject({ id: 'old' });
  });

  it('never reuses an unrelated name that shares the prefix', () => {
    const out = run([source('c1', 'Site 6-Day')], [candidate('x', 'Site 6-Day North')]);
    expect(out.get('c1')).toMatchObject({ kind: 'create' });
  });

  it('lets one existing calendar be claimed once: the second identical source is created', () => {
    const out = run(
      [source('c1', 'Site 6-Day'), source('c2', 'Site 6-Day')],
      [candidate('x', 'Site 6-Day')],
    );
    expect(out.get('c1')).toMatchObject({ kind: 'reuse', id: 'x' });
    expect(out.get('c2')).toEqual({ kind: 'create', name: `Site 6-Day (imported ${TODAY})` });
  });

  it('creates a source that matches nothing under today`s free name', () => {
    const out = run([source('c1', 'Crew A')], []);
    expect(out.get('c1')).toEqual({ kind: 'create', name: 'Crew A' });
  });

  it('gives two created sources of one name different variants', () => {
    const out = run([source('c1', 'Crew A', 'A'), source('c2', 'Crew A', 'B')], [], 'PROJECT', [
      'Crew A',
    ]);
    expect(out.get('c1')).toEqual({ kind: 'create', name: `Crew A (imported ${TODAY})` });
    expect(out.get('c2')).toEqual({ kind: 'create', name: `Crew A (imported ${TODAY}) (2)` });
  });

  it('applies the same rule per tier and does not cross them', () => {
    const out = resolveCalendarReuse({
      calendars: [source('p', 'Shared', 'A', 'PROJECT'), source('o', 'Shared', 'A', 'ORG')],
      candidatesByScope: new Map([['ORG', [candidate('org', 'Shared')]]]),
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
});
