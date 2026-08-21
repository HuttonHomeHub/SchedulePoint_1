import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The world extent is derived exactly once, in `geometry.ts`** (minimap epic M1-T1).
 *
 * Before this test, the plan's day extent and lane maximum were derived inline in three
 * places — `dayExtent` (`render/paint.ts`), `fitToContent` (`render/viewport.ts`) and
 * `buildExportViewport` (`export/export-image.ts`) — and the minimap would have been the
 * fourth. Three copies agreed the day they were written; the fourth is where they stop,
 * and the drift is invisible because each looks right alone (the ADR-0065
 * `routeOrthogonal` argument: only someone comparing the ruler's extent against the
 * export's framing of the same plan would ever see it).
 *
 * The rule: outside `render/geometry.ts`, no production module under `features/tsld`
 * folds a day extent (`minDay`/`maxDay` accumulation) or a lane maximum out of the
 * activity list. They call `worldExtent()` instead. The patterns are the accumulation
 * idioms the three original sites actually used — verified RED against the pre-change
 * tree (all three sites reported) before the conversion landed.
 */
const TSLD = join(import.meta.dirname, '..');

function productionSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...productionSources(path));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(name)) continue;
    out.push(path);
  }
  return out;
}

const DERIVATION_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'day-extent accumulation', pattern: /minDay\s*=\s*(Infinity|Math\.min\()/ },
  {
    name: 'lane-maximum accumulation',
    pattern: /maxLane\s*=\s*Math\.max\(|laneIndex\s*>\s*maxLane/,
  },
];

describe('one world-extent derivation', () => {
  it('no production module outside geometry.ts derives a day extent or lane maximum inline', () => {
    const offenders: string[] = [];
    for (const file of productionSources(TSLD)) {
      if (file.endsWith(join('render', 'geometry.ts'))) continue;
      const source = readFileSync(file, 'utf8');
      for (const { name, pattern } of DERIVATION_PATTERNS) {
        if (pattern.test(source)) offenders.push(`${file.slice(TSLD.length + 1)}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('geometry.ts itself holds the one derivation', () => {
    // The inverse half (the ADR-0081/ADR-0093 lesson): the assertion above would pass
    // equally if the derivation vanished everywhere. `worldExtent` must exist in the leaf.
    const geometry = readFileSync(join(TSLD, 'render', 'geometry.ts'), 'utf8');
    expect(geometry).toMatch(/export function worldExtent\(/);
  });
});
