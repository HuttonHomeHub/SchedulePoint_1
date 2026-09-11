/**
 * **The bundle gate's seven assertions, and the plugin's two helper functions — pinned.**
 *
 * `docs/specs/delivery-gates/` M5. This file exists because two of the five specialist reviews
 * blocked on the same absence, independently: M3 shipped with seven assertions "verified red" by
 * hand against a real build and **nothing committed that could verify them again**. In a repository
 * whose rule is that a gate is finished when the defect it names has made it fail (ADR-0110 D5),
 * that is the epic's own thesis failing on the epic's own newest gate — a future edit weakening B2
 * or B6 would have shipped with every suite green.
 *
 * Two helpers were worse than untested. `staticClosure`'s `seen` guard exists because "a chunk
 * graph may contain cycles, and a recursive walk over one does not return" — never exercised by
 * anything, and its failure mode is a **hang**, not a red test. `packagesIn`'s scoped-package
 * branch decides whether B2 can identify `@scope/name` at all, which is the shape B2 exists for.
 *
 * It runs from the repository root (`check:doc-register`) rather than under
 * `pnpm --filter @repo/web test`, because `apps/web/vitest.config.ts` restricts `include` to
 * `src/**`, so a suite placed beside the gate would silently not run — the review found that too.
 * Node strips the plugin's TypeScript natively (22.18+), so the real module is imported rather than
 * mirrored: a private mirror of the logic would stay green through the regression it is named for.
 */
import assert from 'node:assert/strict';

import { runGate } from '../apps/web/scripts/check-bundle-size.mjs';
import { packagesIn, staticClosure } from '../apps/web/scripts/bundle-report-plugin.ts';

let failures = 0;
const cases = [];
const it = (name, fn) => cases.push([name, fn]);

/** A report the gate accepts, from which each case removes exactly one thing. */
const REPORT = {
  entryGraph: { chunks: 2, raw: 1000, gzip: 1000 },
  chunks: [
    { file: 'assets/index.js', raw: 900, gzip: 900, inEntryGraph: true, packages: ['react'] },
    { file: 'assets/paint.js', raw: 100, gzip: 100, inEntryGraph: true, packages: [] },
    { file: 'assets/jspdf.js', raw: 500, gzip: 400, inEntryGraph: false, packages: ['jspdf'] },
  ],
  css: { raw: 200, gzip: 100 },
};

const BUDGET = {
  floor: { entryGraphGzipBytes: 1000, maxNonEntryChunkGzipBytes: 400, cssGzipBytes: 100 },
  headroomRatio: 1.05,
  entryGraphGzipBytes: 1050,
  maxNonEntryChunkGzipBytes: 420,
  cssGzipBytes: 105,
  raisedBecause: null,
};

/** Run the gate quietly — its own output would drown the suite's — keeping what it said. */
let said = '';
function run(report = REPORT, budget = BUDGET) {
  const write = process.stdout.write.bind(process.stdout);
  said = '';
  process.stdout.write = (chunk) => {
    said += chunk;
    return true;
  };
  try {
    return runGate({ report, budget });
  } finally {
    process.stdout.write = write;
  }
}

const clone = (o) => JSON.parse(JSON.stringify(o));

it('the fixture passes — the pinned positive case', () => {
  // ADR-0093. Every case below asserts a 1, and a gate that returned 1 unconditionally would
  // satisfy all of them. This is the one that says a good bundle is allowed through.
  assert.equal(run(), 0);
});

it('B1 — an entry graph over budget FAILS', () => {
  const r = clone(REPORT);
  r.entryGraph.gzip = BUDGET.entryGraphGzipBytes + 1;
  assert.equal(run(r), 1);
  // And exactly AT the budget passes: `>` not `>=`, so the budget is a value the bundle may take.
  r.entryGraph.gzip = BUDGET.entryGraphGzipBytes;
  assert.equal(run(r), 0);
});

it('B2 — a must-stay-lazy package in the ENTRY GRAPH fails, read from the module graph', () => {
  /**
   * The defect `#48(b)` was filed for. The first version of this assertion looked for a CHUNK NAMED
   * `jspdf`, and could never have fired: a static `import 'jspdf'` is INLINED by Rollup into the
   * entry chunk, so the separate chunk vanishes and the name is nowhere. That was found by adding
   * the import and building, not by reading — and this fixture reproduces the shape it produces.
   */
  const r = clone(REPORT);
  r.chunks = [
    {
      file: 'assets/index.js',
      raw: 1400,
      gzip: 900,
      inEntryGraph: true,
      packages: ['react', 'jspdf'],
    },
  ];
  assert.equal(run(r), 1);
});

it('B2 — and an empty entry-package set is refused, not read as "nothing forbidden"', () => {
  // The assertion above is over a set. An empty one satisfies it perfectly, which is how a
  // reporter/gate mismatch would read as a clean bundle.
  const r = clone(REPORT);
  for (const c of r.chunks) c.packages = [];
  assert.equal(run(r), 1);
});

it('B3 — a lazy chunk over the per-chunk ceiling FAILS', () => {
  const r = clone(REPORT);
  r.chunks[2].gzip = BUDGET.maxNonEntryChunkGzipBytes + 1;
  assert.equal(run(r), 1);
});

it('B3 — the ceiling does NOT apply to entry-graph chunks', () => {
  // They have their own budget, and any ceiling small enough to be useful for lazy chunks would
  // trip on the entry chunk. Without this case, B3 could be rewritten to sweep every chunk and
  // nothing would say so.
  const r = clone(REPORT);
  r.chunks[0].gzip = BUDGET.maxNonEntryChunkGzipBytes + 1;
  r.entryGraph.gzip = BUDGET.entryGraphGzipBytes;
  assert.equal(run(r), 0);
});

it('B4 — a report with no entryGraph.gzip is refused, not read as zero', () => {
  const r = clone(REPORT);
  delete r.entryGraph.gzip;
  assert.equal(run(r), 1);
});

it('B5 — a budget with no measured floor FAILS', () => {
  const b = clone(BUDGET);
  delete b.floor.entryGraphGzipBytes;
  assert.equal(run(REPORT, b), 1);
});

it('B6 — render-blocking CSS over budget FAILS, and a missing figure is refused', () => {
  /**
   * Added at the M5 gate pass. The CSS total had been computed by the reporter and read by nothing
   * for the whole of M3, under a docblock claiming the gate covered everything the browser must
   * parse before it renders. It is a `<link rel="stylesheet">` in `index.html`, so it blocks paint.
   */
  const over = clone(REPORT);
  over.css.gzip = BUDGET.cssGzipBytes + 1;
  assert.equal(run(over), 1);

  const missing = clone(REPORT);
  delete missing.css;
  assert.equal(run(missing), 1);
});

it('B7 — an unknown key in the budget file FAILS', () => {
  // A key the gate does not read is a number nobody is enforcing, and it looks exactly like one
  // that is. Verified red by dropping the KNOWN-set loop.
  assert.equal(run(REPORT, { ...BUDGET, maxEntryChunkGzipBytes: 999999 }), 1);
});

it('the empty-population refusal blocks a report with no chunks — ON ITS OWN TERMS', () => {
  /**
   * ADR-0093, replicated in the gate rather than imported because `scripts/lib/` is not reachable
   * across the pnpm workspace boundary. Every loop above is satisfied by a bundle of zero chunks.
   *
   * **Asserting the exit code alone did NOT discriminate, and the mutation sweep said so.** With
   * no chunks the entry-package set is necessarily empty too, so B2's own refusal fires and the
   * gate returns 1 whether or not the population check exists — a case that passes for a reason
   * other than the one it is named for. The two are not independent here and cannot be made so:
   * packages come FROM chunks. So this reads the sentence instead, which only the population
   * refusal prints.
   */
  const r = clone(REPORT);
  r.chunks = [];
  assert.equal(run(r), 1);
  assert.match(
    said,
    /the population is empty/,
    'the refusal must be the reason, not a side effect',
  );
});

it('staticClosure follows static imports only, and terminates on a cycle', () => {
  /**
   * The `seen` guard has never been exercised by anything, and its failure mode is a HANG rather
   * than a red test — so nothing would have reported it, on any run, ever. Verified by deleting
   * the guard: this case does not fail, it does not return.
   */
  const importsOf = (id) => ({ entry: ['a'], a: ['b'], b: ['a'], c: [] })[id] ?? [];
  const closure = staticClosure('entry', importsOf);
  assert.deepEqual([...closure].sort(), ['a', 'b', 'entry']);
  assert.ok(!closure.has('c'), 'a chunk nothing imports is not in the closure');
});

it('packagesIn keeps a scoped package whole, and takes the LAST node_modules', () => {
  /**
   * B2 asks whether a named package is in the entry graph, so this is the function that decides
   * whether B2 can see `@scope/name` at all. Verified red by returning `tail[0]` unconditionally:
   * every scoped package then reports as its bare scope, and a future
   * `@some-scope/heavy-lib` in the entry graph becomes invisible to the assertion written for it.
   *
   * The LAST `node_modules` wins because a nested dependency's path contains both.
   */
  assert.deepEqual(packagesIn(['/r/node_modules/jspdf/dist/x.js']), ['jspdf']);
  assert.deepEqual(packagesIn(['/r/node_modules/@scope/name/dist/x.js']), ['@scope/name']);
  assert.deepEqual(
    packagesIn(['/r/node_modules/outer/node_modules/inner/x.js']),
    ['inner'],
    'the last node_modules wins — a nested dependency is not its parent',
  );
  assert.deepEqual(packagesIn(['/r/src/app/main.tsx']), [], 'our own source is not a package');
});

for (const [name, fn] of cases) {
  try {
    fn();
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stdout.write(`  ✗ ${name}\n    ${error instanceof Error ? error.message : error}\n`);
  }
}
process.stdout.write(
  `check:bundle-size tests: ${failures === 0 ? 'OK' : 'FAIL'} — ${cases.length - failures}/${cases.length} passed.\n`,
);
process.exit(failures === 0 ? 0 : 1);
