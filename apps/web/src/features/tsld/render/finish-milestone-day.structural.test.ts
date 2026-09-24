import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Every site that puts an activity's date on the time axis goes through the finish-milestone
 * shift** (#381, ADR-0155, `lib/milestone-day.ts`).
 *
 * A finish milestone is dated by the day it closes and drawn on that day's END boundary. A site that
 * converts its date with a bare `daysBetween` draws it a day early on a 24-hour calendar — and a
 * weekend early after a Friday — while every other site draws it correctly, so the disagreement is
 * visible only to somebody comparing two views of one milestone. That is the drift this gate exists
 * to make loud, rather than a reviewer's memory.
 *
 * What it cannot see, stated rather than implied: a site that reads a date through a local variable
 * (`const { start } = barDatesFor(...)` then `daysBetween(d, start)`) is matched by name only in the
 * modules listed in {@link MUST_SHIFT}. A new module doing that is invisible to the first assertion.
 * The ghost layers (baseline, compare, levelled) are inside it since #383: each carries its type and
 * goes through `ghostGeometry`, so a bare `daysBetween` on a ghost date is an offender like any other.
 */
const SRC = join(import.meta.dirname, '../../..');
const ROOTS = ['features/tsld', 'features/gantt'].map((r) => join(SRC, r));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__snapshots__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [path] : [];
  });
}

/** A bare `daysBetween(anchor, x.<date>)` — an activity's or a ghost's date put on the axis. */
const BARE =
  /daysBetween\([^,()]+,\s*[\w?.]+\.(earlyStart|earlyFinish|baselineStart|baselineFinish|fromStart|fromFinish|leveledStart|leveledFinish)\b/;

/** Modules that convert an activity's dates through a local and must apply the shift by name. */
const MUST_SHIFT = [
  'features/tsld/model/drawn-span.ts',
  'features/tsld/model/auto-resolve.ts',
  'features/gantt/layout/bar-geometry.ts',
  'features/gantt/components/GanttPanel.tsx',
  // The writes: an axis day back to a stored date.
  'components/layout/workspace/use-plan-workspace-model.ts',
];

describe('the finish-milestone axis shift is applied at every axis site (#381)', () => {
  const files = ROOTS.flatMap(sourceFiles);

  it('no activity date reaches the axis through a bare daysBetween', () => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => (BARE.test(line) ? `${relative(SRC, file)}:${i + 1}` : null))
        .filter((hit): hit is string => hit !== null),
    );
    expect(offenders).toEqual([]);
  });

  it('the scan found the sites it exists to police (pinned positive case)', () => {
    // A gate that finds no `axisDayOf` would pass the assertion above against an empty tree.
    const uses = files.reduce(
      (n, file) => n + (readFileSync(file, 'utf8').match(/axisDayOf\(/g)?.length ?? 0),
      0,
    );
    expect(uses).toBeGreaterThanOrEqual(20);
  });

  it.each(MUST_SHIFT)('%s applies finishMilestoneDayShift', (path) => {
    expect(readFileSync(join(SRC, path), 'utf8')).toMatch(/finishMilestoneDayShift\(/);
  });
});
