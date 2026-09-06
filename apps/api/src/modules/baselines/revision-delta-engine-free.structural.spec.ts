import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertedRevisionSources, REVISION_SOURCE_FLOOR } from './revision-sources';

/**
 * **The revision delta is engine-free, and this asserts it structurally.**
 *
 * Copied line for line from `schedule/health/health-engine-free.structural.spec.ts`, whose shape is
 * proven, and retargeted. Its recorded BLIND SPOT is kept because it is still true here: **a
 * transitive import is invisible to a one-level source scan.** If `revision-delta.ts` imports a
 * module that itself imports the engine, this passes. What it does catch is the direct import a
 * contributor reaches for when a case looks easier to answer by recomputing than by reading — which
 * is the actual failure mode, because the engine is one `import` away and its answer looks
 * authoritative.
 *
 * Why it matters: the delta's whole parity argument is that `computeSchedule` is not called, so the
 * ADR-0034 recalculation parity gate is untouched **by construction** rather than by test. A single
 * import turns that from a structural claim into a claim somebody has to re-verify.
 */
const HERE = join(__dirname);

/**
 * Only the delta's own sources. The service and repository legitimately live beside the engine.
 *
 * **Derived, and it was the literal `['revision-delta.ts']` until the changes epic.** A pinned
 * roster is correct for one module and silently stops covering the family when a second lands —
 * nothing goes red, the gate simply guards less. `revision-sources.ts` keeps the pin's protection
 * (a floor that must be present, and a hard failure on an empty set) while covering whatever the
 * family grows to.
 */
const DELTA_SOURCES = assertedRevisionSources(join(__dirname));

describe('the revision delta does not import the CPM engine', () => {
  it('scanned a non-zero number of delta source files', () => {
    // An assertion that passes against an empty set is not an assertion — ADR-0108's census gate
    // caught itself on exactly this, and ADR-0093 records a green suite that could not tell "all
    // classified" from "found nothing". Pinned rather than derived from a glob for the same reason.
    expect(DELTA_SOURCES.length).toBeGreaterThan(0);
    // The floor, asserted here as well as inside the derivation, so a reader of THIS file can see
    // what it is guaranteed to have covered without following the import.
    for (const known of REVISION_SOURCE_FLOOR) expect(DELTA_SOURCES).toContain(known);
  });

  it.each(DELTA_SOURCES)('%s does not import the engine', (file) => {
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
});
