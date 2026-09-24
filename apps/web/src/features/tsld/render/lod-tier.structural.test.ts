import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { LOD_DETAIL_MIN_PX_PER_DAY, LOD_WORKING_MIN_PX_PER_DAY, lodTier } from './geometry';

/**
 * **One definition of the canvas's tiers of detail** (NetPoint grammar, spec G11 and §4.13 A5).
 *
 * A layer that joins a tier asks `lodTier(view.pxPerDay)`. It never writes the threshold itself. Two
 * copies of a threshold drift about which zoom a date appears at. Nothing on screen would say so,
 * and only a planner zooming slowly across the boundary would ever see it.
 *
 * The scan covers the canvas feature and refuses a declaration of an `LOD_` constant outside
 * `geometry.ts`. It also refuses a `pxPerDay` comparison against a bare copy of either threshold's
 * value. Comments are stripped first, so a docblock that explains a threshold does not count as
 * using one (the repository's scan-matching-prose failure, ADR-0106).
 */
const TSLD = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('lodTier', () => {
  it('places each zoom in its tier, with the thresholds inclusive at the top', () => {
    expect(lodTier(LOD_WORKING_MIN_PX_PER_DAY - 0.01)).toBe('overview');
    expect(lodTier(LOD_WORKING_MIN_PX_PER_DAY)).toBe('working');
    expect(lodTier(LOD_DETAIL_MIN_PX_PER_DAY - 0.01)).toBe('working');
    expect(lodTier(LOD_DETAIL_MIN_PX_PER_DAY)).toBe('detail');
  });

  it('keeps the tiers ordered', () => {
    expect(LOD_WORKING_MIN_PX_PER_DAY).toBeLessThan(LOD_DETAIL_MIN_PX_PER_DAY);
  });
});

describe('the tier thresholds have one home', () => {
  const files = sourcesUnder(TSLD);

  it('finds the canvas sources it scans (a scan that found nothing would pass vacuously)', () => {
    expect(files.some((f) => f.endsWith(join('render', 'geometry.ts')))).toBe(true);
    expect(files.some((f) => f.endsWith(join('render', 'paint.ts')))).toBe(true);
  });

  it('declares no LOD_ constant outside geometry.ts', () => {
    const offenders = files
      .filter((f) => !f.endsWith(join('render', 'geometry.ts')))
      .filter((f) => /\bconst\s+LOD_[A-Z_]+\s*=/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('compares pxPerDay against neither threshold as a bare number', () => {
    const values = [LOD_WORKING_MIN_PX_PER_DAY, LOD_DETAIL_MIN_PX_PER_DAY];
    const pattern = new RegExp(`pxPerDay\\s*>=?\\s*(${values.join('|')})\\b(?!\\.)`);
    const offenders = files.filter((f) => pattern.test(stripComments(readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});
