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
import { readFileSync } from 'node:fs';

import { findChunkCycles, runGate } from '../apps/web/scripts/check-bundle-size.mjs';
import { packagesIn, staticClosure } from '../apps/web/scripts/bundle-report-plugin.ts';

let failures = 0;
const cases = [];
const it = (name, fn) => cases.push([name, fn]);

/** A report the gate accepts, from which each case removes exactly one thing. */
const REPORT = {
  entryGraph: { chunks: 2, raw: 110000, gzip: 100000 },
  chunks: [
    { file: 'assets/index.js', raw: 90000, gzip: 90000, inEntryGraph: true, packages: ['react'] },
    { file: 'assets/paint.js', raw: 10000, gzip: 10000, inEntryGraph: true, packages: [] },
    { file: 'assets/jspdf.js', raw: 50000, gzip: 40000, inEntryGraph: false, packages: ['jspdf'] },
  ],
  css: { raw: 20000, gzip: 10000 },
};

/**
 * Each budget is `floor x 1.05` rounded UP to a whole KiB (B8a): 105,000 -> 105,472 (103 KiB),
 * 42,000 -> 43,008 (42 KiB), 10,500 -> 11,264 (11 KiB). The floors are not round numbers on purpose
 * for the last two, so a plain-multiplication implementation of the rule fails the positive case.
 */
const BUDGET = {
  floor: { entryGraphGzipBytes: 100000, maxNonEntryChunkGzipBytes: 40000, cssGzipBytes: 10000 },
  headroomRatio: 1.05,
  entryGraphGzipBytes: 105472,
  maxNonEntryChunkGzipBytes: 43008,
  cssGzipBytes: 11264,
  raisedBecause: null,
};

/** Run the gate quietly — its own output would drown the suite's — keeping what it said. */
let said = '';
function run(report = REPORT, budget = BUDGET, chunkSources = undefined) {
  const write = process.stdout.write.bind(process.stdout);
  said = '';
  process.stdout.write = (chunk) => {
    said += chunk;
    return true;
  };
  try {
    return runGate({ report, budget, chunkSources });
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

it('B9 — a synthetic two-chunk import cycle FAILS, naming both chunks', () => {
  // ADR-0110: the defect the assertion names, built. Both import forms are used so neither regex
  // branch can be dropped unnoticed: a named static import, and a bare re-export.
  const sources = {
    'a-1.js': 'import{x as y}from"./b-2.js";export{y as z};',
    'b-2.js': 'export{q}from"./a-1.js";',
  };
  assert.deepEqual(findChunkCycles(sources), [['a-1.js', 'b-2.js']]);
  assert.equal(run(REPORT, BUDGET, sources), 1);
  assert.match(said, /a-1\.js <-> b-2\.js/);
});

it('B9 — a longer cycle through a third chunk FAILS too', () => {
  const sources = {
    'a.js': 'import"./b.js";',
    'b.js': 'import{n}from"./c.js";',
    'c.js': 'import{m}from"./a.js";',
  };
  assert.deepEqual(findChunkCycles(sources), [['a.js', 'b.js', 'c.js']]);
});

it('B9 — an acyclic set, with a diamond and a DYNAMIC back-reference, passes', () => {
  // The dynamic `import("./a.js")` in `d.js` points back up the graph and is NOT an edge: the
  // gate must not read a lazy route that links home as a cycle.
  const sources = {
    'a.js': 'import{x}from"./b.js";import{y}from"./c.js";',
    'b.js': 'import{z}from"./d.js";',
    'c.js': 'import{z}from"./d.js";',
    'd.js': 'const go=()=>import(`./a.js`);',
  };
  assert.deepEqual(findChunkCycles(sources), []);
  assert.equal(run(REPORT, BUDGET, sources), 0);
});

it('B9 — an empty chunk set is refused, not read as "no cycles"', () => {
  assert.equal(run(REPORT, BUDGET, {}), 1);
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

it('B8a — a budget looser than floor x headroom, rounded up to a KiB, FAILS', () => {
  // Verified red by loosening the entry-graph budget by one KiB: nothing else here would notice,
  // since B1 only compares the report to the budget it is handed.
  assert.equal(
    run(REPORT, { ...BUDGET, entryGraphGzipBytes: BUDGET.entryGraphGzipBytes + 1024 }),
    1,
  );
  assert.match(said, /entryGraphGzipBytes is 106496/);
  assert.equal(
    run(REPORT, { ...BUDGET, maxNonEntryChunkGzipBytes: BUDGET.maxNonEntryChunkGzipBytes + 1024 }),
    1,
  );
  assert.equal(run(REPORT, { ...BUDGET, cssGzipBytes: BUDGET.cssGzipBytes + 1024 }), 1);
});

it('B8a — and a budget TIGHTER than the rule fails too: the budget is derived, not chosen', () => {
  assert.equal(
    run(REPORT, { ...BUDGET, entryGraphGzipBytes: BUDGET.entryGraphGzipBytes - 1024 }),
    1,
  );
});

it('B8a — the rule is a KiB ceiling, so plain floor x 1.05 is NOT what it asserts', () => {
  // 100000 x 1.05 = 105000, which is not the budget; 105472 is. A gate that asserted plain
  // multiplication would reject the committed budget on day one.
  assert.notEqual(BUDGET.entryGraphGzipBytes, BUDGET.floor.entryGraphGzipBytes * 1.05);
  assert.equal(run(), 0);
});

it('B8a — a `raisedBecause` exempts the budgets, and a blank one does not', () => {
  const loose = { ...BUDGET, entryGraphGzipBytes: BUDGET.entryGraphGzipBytes + 1024 };
  assert.equal(run(REPORT, { ...loose, raisedBecause: 'a library the product needs' }), 0);
  assert.equal(run(REPORT, { ...loose, raisedBecause: '   ' }), 1);
});

it('B8a — a missing headroomRatio is refused, not read as no rule', () => {
  const b = clone(BUDGET);
  delete b.headroomRatio;
  assert.equal(run(REPORT, b), 1);
});

it('B8b — a build far below the floor FAILS and says to re-floor', () => {
  // The ratchet. A split changes the report and neither budget field, so without this a build
  // 280 kB lighter passes every assertion against a budget 280 kB too generous. Verified red
  // against the real shape: today's budget with a post-split report.
  const shrunk = clone(REPORT);
  shrunk.entryGraph.gzip = 50000;
  assert.equal(run(shrunk), 1);
  assert.match(said, /Re-floor/);
});

it('B8b — the boundary: floor / headroom is allowed, one byte under is not', () => {
  const r = clone(REPORT);
  r.entryGraph.gzip = 95239; // x 1.05 = 100000.95, at or above the 100000 floor
  assert.equal(run(r), 0);
  r.entryGraph.gzip = 95238; // x 1.05 = 99999.9
  assert.equal(run(r), 1);
});

it('B8a and B8b hold for the COMMITTED budget, read from the file', () => {
  // The day-one check: a derivation rule that rejects the repository's own budget is a gate that
  // gets deleted. A report sitting exactly at the recorded floor must pass both.
  const budget = JSON.parse(
    readFileSync(new URL('../apps/web/bundle-budget.json', import.meta.url), 'utf8'),
  );
  const report = clone(REPORT);
  report.entryGraph.gzip = budget.floor.entryGraphGzipBytes;
  report.chunks[2].gzip = budget.floor.maxNonEntryChunkGzipBytes;
  report.css.gzip = budget.floor.cssGzipBytes;
  assert.equal(run(report, budget), 0, said);
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

it('the root gate can run on a turbo cache hit, and cannot pass over a stale report', () => {
  /**
   * `check:web-bundle` (ADR-0160) runs in `pnpm prepush` and in CI. Two things make its verdict
   * describe the current tree rather than an old one:
   *
   * - `turbo.json` declares the report as a build output. Without it a cache hit restores `dist/`,
   *   never runs `vite build`, and leaves no report, so the check fails asking for a build on a
   *   correct bundle. Measured 2026-09-26 before the entry existed. Verified red by removing it.
   * - The script deletes the report BEFORE the build. Without that, a build that fails leaves the
   *   previous green report on disk for nothing to overwrite. Verified red by moving the deletion
   *   after the build.
   *
   * Read from the files rather than restated, so the test is about the shipped configuration.
   */
  const turbo = JSON.parse(readFileSync(new URL('../turbo.json', import.meta.url), 'utf8'));
  assert.ok(
    turbo.tasks.build.outputs.includes('bundle-report.json'),
    'turbo.json build outputs must include bundle-report.json, or a cache hit leaves no report',
  );
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const script = pkg.scripts['check:web-bundle'];
  assert.equal(typeof script, 'string', 'the root check:web-bundle script exists');
  const clear = script.indexOf('rimraf apps/web/bundle-report.json');
  const build = script.indexOf('turbo run build --filter=@repo/web');
  const check = script.indexOf('pnpm --filter @repo/web check:bundle-size');
  assert.ok(clear >= 0 && build >= 0 && check >= 0, `unexpected script: ${script}`);
  assert.ok(clear < build && build < check, 'the report is cleared, then built, then checked');
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
