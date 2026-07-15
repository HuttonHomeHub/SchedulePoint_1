import { describe, expect, it } from 'vitest';

import { checkCoverage, REQUIRED_COVERAGE_TAGS } from './coverage.js';
import { loadFixture } from './load.js';
import type { ConformanceFixture, FixtureActivity } from './schema.js';
import { validateStructure } from './validate.js';

/** A deep clone of the real fixture that tests mutate to force one failure at a time. */
function clone(): ConformanceFixture {
  return structuredClone(loadFixture());
}

function activity(f: ConformanceFixture, id: string): FixtureActivity {
  const a = f.activities.find((x) => x.id === id);
  if (!a) throw new Error(`test setup: activity ${id} not in fixture`);
  return a;
}

describe('structural validator', () => {
  it('passes clean on the real fixture (no errors, no warnings)', () => {
    const result = validateStructure(loadFixture());
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('flags an unknown calendar reference', () => {
    const f = clone();
    activity(f, 'A1000').calendar = 'CAL-NOPE';
    const result = validateStructure(f);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('A1000: unknown calendar CAL-NOPE');
  });

  it('flags a dangling relationship endpoint', () => {
    const f = clone();
    const rel = f.relationships[0];
    expect(rel).toBeDefined();
    if (rel) rel.successor = 'A9999';
    expect(validateStructure(f).errors.some((e) => e.includes('unknown successor A9999'))).toBe(
      true,
    );
  });

  it('flags a self-loop', () => {
    const f = clone();
    const rel = f.relationships[0];
    if (rel) rel.successor = rel.predecessor;
    expect(validateStructure(f).errors.some((e) => e.includes('self-loop'))).toBe(true);
  });

  it('flags a duplicate relationship pair', () => {
    const f = clone();
    const rel = f.relationships[0];
    if (rel) {
      f.relationships.push({ ...rel, id: 'DUP-1' });
      const result = validateStructure(f);
      expect(result.errors.some((e) => e.startsWith('duplicate relationship pair'))).toBe(true);
    }
  });

  it('detects a cycle in the main network and names the stuck activities', () => {
    const f = clone();
    // A back-edge from a late milestone to an early one closes a loop.
    f.relationships.push({
      id: 'CYCLE-1',
      predecessor: 'A13000',
      successor: 'A1000',
      type: 'FS',
      lag_h: 0,
      lag_calendar: null,
      test_tags: [],
      note: null,
    });
    const result = validateStructure(f);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.startsWith('CYCLE DETECTED'))).toBe(true);
  });

  it('flags a level-of-effort activity without a full span', () => {
    const f = clone();
    // Strip every relationship touching an LOE so it has neither predecessor nor successor.
    f.relationships = f.relationships.filter(
      (r) => r.predecessor !== 'A1010' && r.successor !== 'A1010',
    );
    expect(validateStructure(f).errors).toContain('A1010: LOE without a full span');
  });

  it('flags a completed activity that still carries remaining duration', () => {
    const f = clone();
    activity(f, 'A1000').remaining_duration_h = 8;
    expect(validateStructure(f).errors).toContain('A1000: COMPLETED with remaining duration');
  });

  it('flags a milestone with a non-zero duration', () => {
    const f = clone();
    activity(f, 'A1000').original_duration_h = 40;
    expect(validateStructure(f).errors).toContain('A1000: milestone with non-zero duration');
  });

  it('warns (not errors) when the open-end sets drift', () => {
    const f = clone();
    // Give A2100 (an intended open start) a predecessor so the open-start set no longer matches.
    f.relationships.push({
      id: 'W-1',
      predecessor: 'A1000',
      successor: 'A2100',
      type: 'FS',
      lag_h: 0,
      lag_calendar: null,
      test_tags: [],
      note: null,
    });
    const result = validateStructure(f);
    expect(result.ok).toBe(true); // a warning, not an error
    expect(result.warnings.some((w) => w.startsWith('open starts differ'))).toBe(true);
  });
});

describe('feature coverage', () => {
  it('is complete on the real fixture (every required tag exercised)', () => {
    const result = checkCoverage(loadFixture());
    expect(result.missing).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('reports a required tag that stops being covered', () => {
    const f = clone();
    delete (f.coverage_index as Record<string, unknown>)['rel_sf'];
    const result = checkCoverage(f);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('rel_sf');
  });

  it('keeps the required-tag list non-empty (guards an accidental wipe)', () => {
    expect(REQUIRED_COVERAGE_TAGS.length).toBeGreaterThan(90);
  });
});
