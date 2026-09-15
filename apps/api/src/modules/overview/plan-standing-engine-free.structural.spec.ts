import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The plan-standing read is engine-free, and this asserts it structurally.**
 *
 * Copied from `baselines/revision-delta-engine-free.structural.spec.ts`, whose shape is proven, and
 * retargeted — including its recorded BLIND SPOT, which is still true here: **a transitive import is
 * invisible to a one-level source scan.** If one of these files imports a module that itself imports
 * the engine, this passes. What it does catch is the direct import a contributor reaches for when a
 * case looks easier to answer by recomputing than by reading — which is the actual failure mode,
 * because the engine is one `import` away and its answer looks authoritative.
 *
 * Why it matters: R2's whole parity argument is that every figure is a column the last recalculation
 * already persisted, so `computeSchedule` is not called and the ADR-0034 recalculation parity gate is
 * untouched **by construction** rather than by test. One import turns that from a structural property
 * into a claim somebody has to re-verify.
 *
 * **`WorkingTimeCalendar` is why `baselineMovementOf` takes an injected function.** Measuring in
 * working days needs a calendar walker, and that port lives in `schedule/engine/`. Importing it here
 * for its TYPE alone would be harmless at runtime and would still fail this gate — correctly, because
 * the next reader would have the whole engine in scope. So the frame is a plain
 * `(from, to) => number` the service supplies (ADR-0024's port pattern).
 */
const HERE = __dirname;

/**
 * The read's own sources. `overview.service.ts` is deliberately NOT here: it legitimately resolves
 * a calendar and composes the port, which is the seam this design puts the engine-adjacent work
 * behind. Pinned rather than globbed so a green run means these files were read — a glob that
 * matches nothing passes perfectly (ADR-0093).
 */
const STANDING_SOURCES = ['plan-standing.ts', 'overview.repository.ts'];

describe('the plan-standing read does not import the CPM engine', () => {
  it('scanned every file it claims to cover', () => {
    // An assertion that passes against an empty set is not an assertion — ADR-0108's census gate
    // caught itself on exactly this.
    expect(STANDING_SOURCES.length).toBeGreaterThan(0);
    for (const file of STANDING_SOURCES) {
      expect(() => readFileSync(join(HERE, file), 'utf8')).not.toThrow();
    }
  });

  it.each(STANDING_SOURCES)('%s does not import the engine', (file) => {
    const text = readFileSync(join(HERE, file), 'utf8');
    const offending = text
      .split('\n')
      // Comments are stripped: four gates in this repository have gone red or green on their own
      // docblocks, and this file's own prose names the engine repeatedly.
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
      .filter((line) => /^\s*import\b/.test(line) || /\bfrom\s+['"]/.test(line))
      .filter((line) => /schedule\/engine|computeSchedule|levelSchedule/.test(line));
    expect(offending).toEqual([]);
  });

  it('derives movement through an injected frame, never a calendar of its own', () => {
    // The positive half: without it, the assertions above pass equally against a `plan-standing.ts`
    // that has been emptied, and a green suite could not tell "engine-free" from "gone"
    // (ADR-0093's pinned-positive-case rule).
    const text = readFileSync(join(HERE, 'plan-standing.ts'), 'utf8');
    // `| null` is not decoration: it is what lets the frame DECLINE — a calendar that will not
    // build, or a walk past the engine's horizon — instead of the pure module inventing a number in
    // some other frame. Pinned as written, so widening it back to a bare `number` (which would
    // force a `?? 0` or a throw at the seam) is a failure here rather than a review comment.
    expect(text).toMatch(/movementDaysBetween:\s*\(from: string, to: string\) => number \| null/);
    expect(text).toMatch(/export function baselineMovementOf/);
  });
});
