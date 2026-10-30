import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { codeBasisOf, codeSwimlaneName, codeSwimlaneValues } from './code-swimlanes.js';

interface Case {
  name: string;
  values: { id: string; deleted: boolean }[];
  activities: { type: string; deleted: boolean; valueId: string | null }[];
  expectedInUse: number;
}

const fixture = JSON.parse(
  readFileSync(new URL('./code-swimlane-values-in-use.fixture.json', import.meta.url), 'utf8'),
) as { cases: Case[] };

describe('codeSwimlaneValues reads the shared "values in use" fixture', () => {
  it('has the cases the API reads too', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(8);
  });

  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const live = c.values.filter((v) => !v.deleted);
    const liveIds = new Set(live.map((v) => v.id));
    const members = c.activities
      .filter((a) => !a.deleted)
      .map((a) => ({
        type: a.type,
        valueId: a.valueId !== null && liveIds.has(a.valueId) ? a.valueId : null,
      }));
    expect(codeSwimlaneValues(live, members)).toHaveLength(c.expectedInUse);
  });
});

describe('codeSwimlaneValues', () => {
  it('keeps the order of the values it is given, not the order activities carry them', () => {
    const values = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const members = [
      { type: 'TASK', valueId: 'c' },
      { type: 'TASK', valueId: 'a' },
    ];
    expect(codeSwimlaneValues(values, members).map((v) => v.id)).toEqual(['a', 'c']);
  });

  it('returns the very value objects, so a caller keeps whatever else they carry', () => {
    const value = { id: 'a', shortCode: 'GF' };
    expect(codeSwimlaneValues([value], [{ type: 'TASK', valueId: 'a' }])[0]).toBe(value);
  });
});

describe('codeBasisOf', () => {
  const live = new Set(['v1', 'v2']);
  const codes = [
    { codeTypeId: 'area', codeValueId: 'v1' },
    { codeTypeId: 'trade', codeValueId: 'gone' },
  ];

  it('is the live value of the type', () => {
    expect(codeBasisOf(codes, 'area', live)).toBe('v1');
  });

  it('is null for a type the activity carries no value of', () => {
    expect(codeBasisOf(codes, 'phase', live)).toBeNull();
    expect(codeBasisOf(undefined, 'area', live)).toBeNull();
  });

  it('is null for a value that is not live, as the server derives (T, NULL)', () => {
    expect(codeBasisOf(codes, 'trade', live)).toBeNull();
  });
});

describe('codeSwimlaneName', () => {
  it('is the description, else the short code', () => {
    expect(codeSwimlaneName({ shortCode: 'L1', description: 'Level 1' })).toBe('Level 1');
    expect(codeSwimlaneName({ shortCode: 'L1', description: null })).toBe('L1');
  });
});
