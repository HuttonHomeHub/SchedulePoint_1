import { describe, expect, it } from 'vitest';

import {
  findResourceCollisions,
  matchImportResources,
  type LibraryResource,
  type SourceResource,
} from './resource-match';

const src = (key: string, name: string, code: string | null = null): SourceResource => ({
  key,
  name,
  code,
});
const lib = (
  id: string,
  name: string,
  code: string | null = null,
  archivedAt: Date | null = null,
): LibraryResource => ({ id, name, code, archivedAt });

const match = (
  resources: SourceResource[],
  library: LibraryResource[],
  resolutions: Record<string, 'REUSE_EXISTING' | 'CREATE_COPY'> = {},
) => matchImportResources({ resources }, library, resolutions);

describe('matchImportResources — the three match paths', () => {
  it('inserts a resource the library does not hold', () => {
    const m = match([src('R1', 'Crane', 'CR')], []);
    expect(m.decisions.get('R1')).toEqual({ kind: 'insert', copy: false });
    expect(m.collisions).toEqual([]);
    expect(m.unarchive).toEqual([]);
  });

  it('matches by code against the library without asking, even when the name differs', () => {
    const m = match([src('R1', 'Tower crane', 'CR')], [lib('L1', 'Crane', 'CR')]);
    expect(m.decisions.get('R1')).toEqual({ kind: 'match', via: 'code', libraryId: 'L1' });
    expect(m.collisions).toEqual([]);
    expect(m.unresolved).toEqual([]);
  });

  it('asks about a library name match that no code identifies, and inserts until answered', () => {
    const m = match([src('R1', 'Crane')], [lib('L1', 'Crane')]);
    expect(m.collisions.map((c) => c.resourceKey)).toEqual(['R1']);
    expect(m.unresolved.map((c) => c.resourceKey)).toEqual(['R1']);
    expect(m.collisions[0]!.existing).toEqual({
      id: 'L1',
      name: 'Crane',
      code: null,
      archived: false,
    });
  });

  it('REUSE_EXISTING matches the library row by answer', () => {
    const m = match([src('R1', 'Crane')], [lib('L1', 'Crane')], { R1: 'REUSE_EXISTING' });
    expect(m.decisions.get('R1')).toEqual({ kind: 'match', via: 'answer', libraryId: 'L1' });
    expect(m.unresolved).toEqual([]);
  });

  it('CREATE_COPY inserts a copy', () => {
    const m = match([src('R1', 'Crane')], [lib('L1', 'Crane')], { R1: 'CREATE_COPY' });
    expect(m.decisions.get('R1')).toEqual({ kind: 'insert', copy: true });
    expect(m.unresolved).toEqual([]);
  });

  it('a code match never needs an answer even for a colliding name', () => {
    const m = match([src('R1', 'Crane', 'CR')], [lib('L1', 'Crane', 'CR')]);
    expect(m.decisions.get('R1')).toEqual({ kind: 'match', via: 'code', libraryId: 'L1' });
    expect(m.collisions).toEqual([]);
  });
});

describe('matchImportResources — a repeat inside one file', () => {
  it('two rows sharing a code resolve to the first row', () => {
    const m = match([src('R1', 'Crane A', 'CR'), src('R2', 'Crane B', 'CR')], []);
    expect(m.decisions.get('R1')).toEqual({ kind: 'insert', copy: false });
    expect(m.decisions.get('R2')).toEqual({ kind: 'match', via: 'file', fileKey: 'R1' });
  });

  it('two rows sharing a name resolve to the first row and raise no second question', () => {
    const m = match([src('R1', 'Crane'), src('R2', 'Crane')], [lib('L1', 'Crane')], {
      R1: 'CREATE_COPY',
    });
    expect(m.collisions.map((c) => c.resourceKey)).toEqual(['R1']);
    expect(m.decisions.get('R1')).toEqual({ kind: 'insert', copy: true });
    expect(m.decisions.get('R2')).toEqual({ kind: 'match', via: 'file', fileKey: 'R1' });
  });

  it('a repeat of a reused library name follows the first row to the library row', () => {
    const m = match([src('R1', 'Crane'), src('R2', 'Crane')], [lib('L1', 'Crane')], {
      R1: 'REUSE_EXISTING',
    });
    expect(m.decisions.get('R2')).toEqual({ kind: 'match', via: 'file', fileKey: 'R1' });
  });

  it('a code already decided by the file wins over the library holding that code', () => {
    // R1 reuses by answer; R2 carries a code the library also holds under another row.
    const m = match(
      [src('R1', 'Crane', 'CR'), src('R2', 'Hoist', 'CR')],
      [lib('L1', 'Crane'), lib('L2', 'Other', 'CR')],
      { R1: 'REUSE_EXISTING' },
    );
    // R1's code matches L2 in the library first (code is identity), so R1 is a code match.
    expect(m.decisions.get('R1')).toEqual({ kind: 'match', via: 'code', libraryId: 'L2' });
    expect(m.decisions.get('R2')).toEqual({ kind: 'match', via: 'file', fileKey: 'R1' });
  });

  it('a code match after a name match: a later row naming the same crew with a new code follows the name', () => {
    const m = match([src('R1', 'Crane'), src('R2', 'Crane', 'CR')], []);
    expect(m.decisions.get('R1')).toEqual({ kind: 'insert', copy: false });
    expect(m.decisions.get('R2')).toEqual({ kind: 'match', via: 'file', fileKey: 'R1' });
  });

  it('a later row whose code the first row introduced matches it even under another name', () => {
    const m = match([src('R1', 'Crane', 'CR'), src('R2', 'Hoist'), src('R3', 'Hoist2', 'CR')], []);
    expect(m.decisions.get('R2')).toEqual({ kind: 'insert', copy: false });
    expect(m.decisions.get('R3')).toEqual({ kind: 'match', via: 'file', fileKey: 'R1' });
  });
});

describe('matchImportResources — archived library rows', () => {
  const archivedAt = new Date('2026-01-01T00:00:00Z');

  it('a code match on an archived row is reported for unarchive once, however often it is hit', () => {
    const m = match(
      [src('R1', 'Crane', 'CR'), src('R2', 'Crane again', 'CR')],
      [lib('L1', 'Crane', 'CR', archivedAt)],
    );
    expect(m.unarchive.map((r) => r.id)).toEqual(['L1']);
  });

  it('a REUSE_EXISTING answer on an archived row unarchives it', () => {
    const m = match([src('R1', 'Crane')], [lib('L1', 'Crane', null, archivedAt)], {
      R1: 'REUSE_EXISTING',
    });
    expect(m.unarchive.map((r) => r.id)).toEqual(['L1']);
    expect(m.collisions[0]!.existing.archived).toBe(true);
  });

  it('a CREATE_COPY answer leaves the archived row alone', () => {
    const m = match([src('R1', 'Crane')], [lib('L1', 'Crane', null, archivedAt)], {
      R1: 'CREATE_COPY',
    });
    expect(m.unarchive).toEqual([]);
  });

  it('unarchives in the order the file first reaches the rows', () => {
    const m = match(
      [src('R1', 'B', 'B'), src('R2', 'A', 'A')],
      [lib('LA', 'A', 'A', archivedAt), lib('LB', 'B', 'B', archivedAt)],
    );
    expect(m.unarchive.map((r) => r.id)).toEqual(['LB', 'LA']);
  });

  it('does not report an active library row', () => {
    const m = match([src('R1', 'Crane', 'CR')], [lib('L1', 'Crane', 'CR')]);
    expect(m.unarchive).toEqual([]);
  });
});

describe('findResourceCollisions', () => {
  it('reports each library name once per file, and not for a code match', () => {
    const collisions = findResourceCollisions(
      [src('R1', 'Crane'), src('R2', 'Crane'), src('R3', 'Hoist', 'HO'), src('R4', 'Hoist')],
      [lib('L1', 'Crane'), lib('L2', 'Hoist', 'HO')],
    );
    expect(collisions.map((c) => c.resourceKey)).toEqual(['R1']);
  });
});
