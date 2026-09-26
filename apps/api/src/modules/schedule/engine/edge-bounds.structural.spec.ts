import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { stripComments } from '../../../common/contracts/cost-key-scan';

/**
 * **The engine's link arithmetic lives in one file (#385 M1-T4, gate 1).**
 *
 * M1-T1 moved `applyLag`, `forwardLowerBound` and `backwardUpperBound` out of `compute.ts` into
 * `edge-bounds.ts` so the cross-plan derivation can call the rule the in-plan passes call (spec
 * D2). The move is worth something only while it stays one rule: a second switch on the link type
 * growing back in `compute.ts`, or anywhere else in the engine, is how #385 happened in the first
 * place. So every engine source other than `edge-bounds.ts` must hold no bound function, no
 * link-type `case` label and no read of an edge's lag, and `compute.ts` must import the two bounds.
 *
 * **Scope, stated so nobody reads this as covering more.** These assertions catch drift in
 * STRUCTURE (where the bound switch lives), not in CONTENT. A wrong value inside a moved function is
 * FC-5's to catch: `compute.spec.ts`, the golden suites and the conformance suites passing unedited.
 * test-engineer raised this in the agreement round and asked for no action; it is written here so
 * the gate is not read as a proof of the arithmetic.
 *
 * **Blind spots.** A bound computed under another function name, with an `if` on the link type
 * rather than a `case`, reading the lag from a variable not named `edge`, is invisible to a name
 * scan. The pinned positive cases below keep the scan from passing by finding nothing, and the
 * synthetic cases prove each pattern matches the defect it names.
 *
 * **Verified red** (ADR-0110 D5), each against a named mutation, then reverted:
 * - `compute.ts` restored to its pre-M1 text (`git show a5e701f0:…/compute.ts`), which holds the
 *   three private functions and no `edge-bounds` import: the import assertion failed, and the
 *   per-file assertion failed on `compute.ts` listing the three declarations, the eight case labels
 *   and the edge-lag reads.
 * - `forwardLowerBound` renamed in `edge-bounds.ts`: the pinned positive case failed.
 */

const ENGINE_DIR = __dirname;
const HOME = 'edge-bounds.ts';
const BOUND_FUNCTIONS = ['applyLag', 'forwardLowerBound', 'backwardUpperBound'] as const;

/** A declaration of one of the three bound functions, as a function or a `const` arrow. */
const BOUND_DECLARATION = new RegExp(
  `(?:function\\s+|(?:const|let|var)\\s+)(${BOUND_FUNCTIONS.join('|')})\\b`,
  'g',
);
/** A `case` label naming a link type: the shape of the bound switch. */
const LINK_TYPE_CASE = /case\s+['"](FS|SS|FF|SF)['"]\s*:/g;
/** A read of an edge's own lag or lag calendar: the input only the lag walk should consume. */
const EDGE_LAG_READ = /\bedge\.(lagMinutes|lagCalendar)\b/g;
/** The import `compute.ts` must carry. */
const BOUNDS_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]\.\/edge-bounds['"]/;

function matches(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map((m) => m[0]);
}

/** Every finding in one engine source other than `edge-bounds.ts`. */
function findings(text: string): string[] {
  const code = stripComments(text);
  return [
    ...matches(BOUND_DECLARATION, code),
    ...matches(LINK_TYPE_CASE, code),
    ...matches(EDGE_LAG_READ, code),
  ];
}

const sources = readdirSync(ENGINE_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts') && !f.endsWith('.test.ts'))
  .sort();
const read = (file: string) => readFileSync(join(ENGINE_DIR, file), 'utf8');

describe('#385 M1-T4 gate 1: the bound switch lives only in edge-bounds.ts', () => {
  it('scanned the engine (pinned: a scan that finds nothing proves nothing)', () => {
    expect(sources).toContain(HOME);
    expect(sources).toContain('compute.ts');
    expect(sources.length).toBeGreaterThanOrEqual(10);
  });

  it('edge-bounds.ts holds the three functions and both four-way switches (pinned)', () => {
    const code = stripComments(read(HOME));
    for (const name of BOUND_FUNCTIONS) {
      expect(code, name).toMatch(new RegExp(`export function ${name}\\(`));
    }
    expect(matches(LINK_TYPE_CASE, code)).toHaveLength(8);
  });

  it('compute.ts imports both bounds from edge-bounds.ts', () => {
    const imported = BOUNDS_IMPORT.exec(stripComments(read('compute.ts')));
    expect(imported, 'compute.ts has no import from ./edge-bounds').not.toBeNull();
    const names = imported![1]!.split(',').map((n) => n.trim());
    expect(names).toEqual(expect.arrayContaining(['forwardLowerBound', 'backwardUpperBound']));
  });

  it.each(sources.filter((f) => f !== HOME))(
    '%s holds no bound function, link-type case or edge lag read',
    (file) => {
      expect(findings(read(file)), file).toEqual([]);
    },
  );

  it('the patterns see the defect they name (synthetic sources)', () => {
    const inlined = `
      function forwardLowerBound(edge, a, b) {
        switch (edge.type) {
          case 'FS':
            return a + edge.lagMinutes;
        }
      }`;
    expect(findings(inlined)).toEqual([
      'function forwardLowerBound',
      "case 'FS':",
      'edge.lagMinutes',
    ]);
    expect(findings('const applyLag = (a) => a;')).toEqual(['const applyLag']);
    // A comment quoting the defect is not the defect: four gates here have gone red on prose.
    expect(findings("// case 'FS': return edge.lagMinutes;")).toEqual([]);
    // The one legitimate link-type test in compute.ts (the LOE derivation) is not a case label.
    expect(findings("if (edge.type !== 'SS') continue;")).toEqual([]);
  });
});
