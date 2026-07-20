import { describe, expect, it } from 'vitest';

import { buildExportFilename, FALLBACK_SLUG, MAX_SLUG_LENGTH, slugify } from './filename';

describe('slugify', () => {
  it('lower-cases and dashes a plain name', () => {
    expect(slugify('North Tower')).toBe('north-tower');
  });

  it('collapses runs of separators/punctuation into a single dash', () => {
    expect(slugify('North   Tower — Phase  2!!')).toBe('north-tower-phase-2');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  --Foo--  ')).toBe('foo');
  });

  it('folds accents to their ASCII base (unicode)', () => {
    expect(slugify('Café Résumé')).toBe('cafe-resume');
    expect(slugify('Zürich Süd')).toBe('zurich-sud');
  });

  it('falls back to "plan" for an empty string', () => {
    expect(slugify('')).toBe(FALLBACK_SLUG);
  });

  it('falls back to "plan" for a punctuation-only name', () => {
    expect(slugify('!!! ??? ---')).toBe('plan');
  });

  it('falls back to "plan" for a non-Latin script that decomposes to nothing', () => {
    expect(slugify('工程计划')).toBe('plan');
  });

  it('caps the slug length and re-trims a trailing dash left by the cut', () => {
    const long = 'a'.repeat(80);
    expect(slugify(long)).toHaveLength(MAX_SLUG_LENGTH);
    // A name that would end on a dash exactly at the cut boundary must not keep it.
    const boundary = `${'a'.repeat(MAX_SLUG_LENGTH - 1)} extra words here`;
    const result = slugify(boundary);
    expect(result.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(result.endsWith('-')).toBe(false);
  });

  it('keeps digits and interior single dashes', () => {
    expect(slugify('Level-2 zone 3')).toBe('level-2-zone-3');
  });
});

describe('buildExportFilename', () => {
  it('builds {slug}-{kind}-{date}.{ext} with the supplied date', () => {
    expect(
      buildExportFilename({
        planName: 'North Tower',
        kind: 'schedule',
        ext: 'csv',
        date: '2026-07-20',
      }),
    ).toBe('north-tower-schedule-2026-07-20.csv');
  });

  it('uses the fallback slug for an empty plan name', () => {
    expect(
      buildExportFilename({ planName: '', kind: 'diagram', ext: 'png', date: '2026-07-20' }),
    ).toBe('plan-diagram-2026-07-20.png');
  });

  it('defaults the date to a YYYY-MM-DD local day when omitted', () => {
    const name = buildExportFilename({ planName: 'Plan', kind: 'schedule', ext: 'pdf' });
    expect(name).toMatch(/^plan-schedule-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
