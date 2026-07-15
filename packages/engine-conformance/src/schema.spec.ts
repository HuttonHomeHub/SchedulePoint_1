import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { loadFixture, loadNegativeCases, fixturePath } from './load.js';
import { fixtureSchema } from './schema.js';

const rawFixture = (): unknown =>
  JSON.parse(readFileSync(fixturePath('p6_torture_test_v1.json'), 'utf8'));

describe('conformance fixture loader', () => {
  it('loads the fixture with the expected object counts', () => {
    const f = loadFixture();
    expect(f.schema_version).toBe('1.0');
    expect(f.activities).toHaveLength(129);
    expect(f.relationships).toHaveLength(188);
    expect(f.calendars).toHaveLength(8);
    expect(f.resources).toHaveLength(22);
    expect(f.assignments).toHaveLength(45);
    expect(f.scenarios).toHaveLength(13);
  });

  it('round-trips faithfully (every key is modelled — no silent stripping)', () => {
    // If the schema omitted a key present in the fixture, Zod would strip it and this would fail —
    // which is exactly the drift signal we want.
    expect(loadFixture()).toEqual(rawFixture());
  });

  it('rejects a mutated shape (a wrong-typed field)', () => {
    const mutated = rawFixture() as { activities: Array<Record<string, unknown>> };
    const first = mutated.activities[0];
    expect(first).toBeDefined();
    if (first) first['original_duration_h'] = 'not-a-number';
    expect(() => fixtureSchema.parse(mutated)).toThrow();
  });

  it('rejects an unknown enum value (a mistyped relationship type)', () => {
    const mutated = rawFixture() as { relationships: Array<Record<string, unknown>> };
    const first = mutated.relationships[0];
    if (first) first['type'] = 'XY';
    expect(() => fixtureSchema.parse(mutated)).toThrow();
  });

  it('loads the 18 hostile negative cases', () => {
    const neg = loadNegativeCases();
    expect(neg.cases).toHaveLength(18);
    expect(neg.cases.map((c) => c.id)).toContain('N11_ZERO_HOUR_CALENDAR');
  });
});
