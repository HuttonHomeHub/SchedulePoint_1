import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **History is a side record of inputs and the engine never meets it** (ADR-0174 D9) — pinned in both
 * directions, so `computeSchedule` is byte-identical with and without the feature by construction
 * rather than by a sentence in a pull request.
 *
 * - Nothing under `modules/schedule/` (the engine and the schedule service that drives it) imports
 *   anything from `modules/activity-history/` or `common/db/activity-history-lock`. A history import
 *   there would be the first step of the engine's output depending on who edited what.
 * - Nothing under `modules/activity-history/` imports from `modules/schedule/`. History reads
 *   activities, links and assignments through Prisma and has no business with a calculation.
 *
 * `check:engine-parity` guards the engine directory's contents; this guards the seam to it.
 */
const SRC = join(__dirname, '..', '..');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** The module specifiers a file imports or re-exports from, comments excluded. */
function specifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map(
    (m) => (m[1] ?? m[2]) as string,
  );
}

describe('activity history ↔ engine isolation (ADR-0174 D9)', () => {
  it('finds files on both sides, so an empty walk cannot pass', () => {
    expect(sources(join(SRC, 'modules', 'schedule')).length).toBeGreaterThan(20);
    expect(sources(join(SRC, 'modules', 'activity-history')).length).toBeGreaterThanOrEqual(8);
  });

  it('the schedule module imports nothing from history', () => {
    const offenders: string[] = [];
    for (const file of sources(join(SRC, 'modules', 'schedule'))) {
      for (const spec of specifiers(file)) {
        if (/activity-history/.test(spec)) offenders.push(`${relative(SRC, file)} → ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('history imports nothing from the schedule module or the engine', () => {
    const offenders: string[] = [];
    for (const file of sources(join(SRC, 'modules', 'activity-history'))) {
      if (file.endsWith('parity.structural.spec.ts')) continue;
      for (const spec of specifiers(file)) {
        if (/(^|\/)schedule(\/|$)/.test(spec) || /engine/.test(spec)) {
          offenders.push(`${relative(SRC, file)} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
