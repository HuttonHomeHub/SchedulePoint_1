#!/usr/bin/env node
/**
 * **What the browser downloads as JAVASCRIPT before it can render anything, compared to a number
 * somebody chose deliberately.**
 *
 * **JavaScript, and the word is load-bearing.** The M5 performance review caught this docblock
 * claiming "everything the browser must have parsed" while CSS — 15,144 gzip bytes in the measured
 * build, render-blocking, and computed in the same report — was read by nothing here. B6 now
 * asserts it, so the claim and the gate agree; fonts (`font-display: swap`, so text paints without
 * them) and `index.html` remain outside, stated rather than implied.
 *
 * `docs/specs/delivery-gates/` M3, closing `docs/TECH_DEBT.md` #48(b). `docs/FRONTEND_QUALITY.md`
 * carried a ~200 kB budget that predated any build being looked at, and nothing in CI ever compared
 * it to a real artefact — so a library landing in the entry graph would have cost every first paint
 * and failed nothing.
 *
 * ## The quantity
 *
 * The **entry graph**: the entry chunk plus the transitive closure of its **static** imports.
 * Dynamic imports are excluded and reported separately, because a `jspdf` behind an
 * `await import()` costs the first paint nothing and counting it would make the number describe a
 * download nobody performs. Rollup's own `imports` / `dynamicImports` lists are the source
 * (`scripts/bundle-report-plugin.ts`) — filenames on disk cannot say which kind an import was.
 *
 * ## How it is run: the root gate `check:web-bundle` (ADR-0160)
 *
 * This script only reads a report; it never builds. The root script `check:web-bundle` deletes the
 * report, runs `turbo run build --filter=@repo/web`, then calls this. `pnpm prepush` and CI both run
 * that root command, so a contributor meets an over-budget bundle before CI does.
 *
 * Until ADR-0160 this was deliberately CI-only, on the premise that a build would make "a
 * five-second push" wait thirty seconds. The push gate was never five seconds (the full
 * `pnpm prepush` is about six minutes), and the build was never measured. Measured 2026-09-26: 16.8 s
 * cold, 1.5 s on a turbo cache hit. PR #701 then passed prepush and failed CI on this gate, which is
 * the round trip the pre-push gate exists to save.
 *
 * ## The report is a turbo output
 *
 * The report is written OUTSIDE `dist/` so it can never be served. That also put it outside
 * `turbo.json`'s declared `build` outputs, so on a cache hit `dist/**` was restored, `vite build`
 * never ran, and no report was written. This docblock used to say that "cannot happen today"
 * because CI caches nothing for Turbo. That was wrong: turbo's LOCAL cache is on by default, and a
 * second build on one machine already hit it. Worse than asking for a build, it let the check read
 * whatever report an EARLIER build left: measured 2026-09-26, a bundle with jspdf in its entry graph
 * passed on a stale green report (`docs/specs/prepush-bundle-gate/m1-red-run.md` §3).
 *
 * So `turbo.json` now declares `bundle-report.json` as an output, which makes a cache hit restore
 * the report for the inputs that produced it, and the root gate deletes the report first, so a
 * build that writes none cannot be judged by an old one. `scripts/check-bundle-size.test.mjs` pins
 * both.
 *
 * ## The budget is derived and ratcheted (B8a, B8b)
 *
 * Each budget is its floor x `headroomRatio` rounded up to a whole KiB, and the floor may not sit
 * above what the build now costs by more than the headroom. See the two assertions below.
 *
 * ## What it does NOT check
 *
 * Whether the bundle is *fast*. Bytes are a proxy: parse and execute time, and the waterfall a
 * route actually triggers, are `docs/TECH_DEBT.md` #292's subject and not this gate's. A green run
 * means the payload has not grown past the line, never that the page is quick.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const NAME = 'check:bundle-size';

const say = (s) => process.stdout.write(`${s}\n`);
// KiB, not kB: the divisor is 1024. The label read `kB` until M1 of `docs/specs/route-code-splitting/`
// (M0-T2's residue), which made every figure this prints look 2.4% smaller than the bytes in the
// report it was read from.
const kb = (n) => `${(n / 1024).toFixed(2)} KiB`;

/**
 * The empty-population refusal, replicated rather than imported.
 *
 * `report()` lives in the repository root's `scripts/lib/`, which this workspace package cannot
 * import across the pnpm boundary. The milestone's own instruction was explicit: if it is not
 * importable, **replicate the refusal** rather than dropping it — a gate that reports green over
 * nothing is the failure mode every other gate here is built against (ADR-0093).
 */
function finish(problems, population, summary) {
  for (const p of problems) say(`  ✗ ${p}`);
  if (population === 0) {
    say(`${NAME}: FAIL — the population is empty, so this run checked nothing.`);
    say('  A gate with no subject reports green and reads as "checked". Refusing to.');
    return 1;
  }
  if (problems.length > 0) {
    say(`${NAME}: FAIL — ${problems.length} finding(s). ${summary}`);
    return 1;
  }
  say(`${NAME}: OK. ${summary}`);
  return 0;
}

/**
 * The static `import … from "./x.js"` and `export … from "./x.js"` edges of one emitted chunk.
 *
 * Read from the emitted text rather than from Rollup's `imports` list because this is the artefact
 * the browser actually evaluates. A dynamic `import("./x.js")` is not an edge: it opens a call, not
 * a module-evaluation dependency, and cannot deadlock initialisation order. The pattern needs the
 * quote to follow `import`/`from` directly, which is what excludes `import(`.
 */
const STATIC_EDGE = /\b(?:import|export)\s*(?:[^;"'`()]*?\bfrom\s*)?["'`]\.\/([^"'`]+\.js)["'`]/g;

/**
 * Chunks that import each other, found as strongly connected components larger than one (Tarjan).
 *
 * `sources` maps an emitted file name to its text. A cycle between chunks is not a size problem and
 * no other assertion sees it: the modules in it evaluate in an order the page then depends on, which
 * broke the plan screen intermittently (`Cannot read properties of undefined (reading 'FS')`) the
 * one time a chunk grouping produced one (`vite.config.ts`). Iterative, so a long import chain
 * cannot overflow the stack.
 */
export function findChunkCycles(sources) {
  const names = Object.keys(sources);
  const known = new Set(names);
  const edges = new Map(
    names.map((name) => [
      name,
      [...sources[name].matchAll(STATIC_EDGE)].map((m) => m[1]).filter((t) => known.has(t)),
    ]),
  );
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const cycles = [];
  let counter = 0;
  for (const root of names) {
    if (index.has(root)) continue;
    const work = [[root, 0]];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const [node, i] = frame;
      if (i === 0) {
        index.set(node, counter);
        low.set(node, counter);
        counter += 1;
        stack.push(node);
        onStack.add(node);
      }
      const out = edges.get(node);
      if (i < out.length) {
        frame[1] += 1;
        const next = out[i];
        if (!index.has(next)) work.push([next, 0]);
        else if (onStack.has(next)) low.set(node, Math.min(low.get(node), index.get(next)));
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        const component = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          component.push(member);
        } while (member !== node);
        if (component.length > 1) cycles.push(component.sort());
      }
    }
  }
  return cycles;
}

/**
 * Run every assertion against a report and a budget, and return the exit code.
 *
 * **Exported, and the CLI below is a thin caller, so a suite drives the REAL assertions.** It was
 * top-level script code reading fixed paths until the M5 gate pass, where two independent reviews
 * blocked on the same thing: seven assertions "verified red" by hand against a live build, with
 * nothing committed that could ever verify them again. A future edit weakening B2 or B6 would have
 * shipped with every suite in the repository green — the exact failure this epic exists to remove,
 * in its own newest gate.
 */
export function runGate({ report, budget, chunkSources }) {
  const problems = [];

  /**
   * B9 — no two emitted chunks import each other, statically, directly or through others.
   *
   * `chunkSources` is absent only for a caller that has no `dist/` to give; the CLI always gives
   * one, and an EMPTY one is refused rather than read as "no cycles".
   */
  if (chunkSources !== undefined) {
    if (Object.keys(chunkSources).length === 0) {
      problems.push('no emitted chunks were found to check for import cycles — build first.');
    }
    for (const cycle of findChunkCycles(chunkSources)) {
      problems.push(
        `chunks import each other in a cycle: ${cycle.join(' <-> ')}.\n` +
          '      Their evaluation order is then undefined to the page. Adjust the `codeSplitting` ' +
          'groups in vite.config.ts (a group that spans an entry and a lazy route is the usual cause).',
      );
    }
  }

  /** B7 — an unknown key means the file was edited against a different reader. */
  const KNOWN = new Set([
    '_',
    'measuredAt',
    'measuredBy',
    'floor',
    'headroomRatio',
    'headroomRatioIsAJudgement',
    'entryGraphGzipBytes',
    'maxNonEntryChunkGzipBytes',
    'cssGzipBytes',
    'raisedBecause',
  ]);
  for (const key of Object.keys(budget)) {
    if (!KNOWN.has(key)) {
      problems.push(
        `bundle-budget.json has an unknown key "${key}". This gate reads a fixed set; a key it does ` +
          'not read is a number nobody is enforcing.',
      );
    }
  }

  const entryGraph = report.entryGraph?.gzip;
  if (typeof entryGraph !== 'number') {
    problems.push(
      'bundle-report.json has no entryGraph.gzip — the reporter and this gate disagree.',
    );
    return finish(problems, 0, 'the report could not be read.');
  }

  // B1 — the entry graph.
  if (entryGraph > budget.entryGraphGzipBytes) {
    problems.push(
      `the entry graph is ${kb(entryGraph)} gzip, over the ${kb(budget.entryGraphGzipBytes)} budget ` +
        `by ${kb(entryGraph - budget.entryGraphGzipBytes)}.\n` +
        '      This is what the browser parses before it can render. Either make it smaller, or ' +
        'raise the budget in apps/web/bundle-budget.json WITH a one-line `raisedBecause`.',
    );
  }

  // B3 — the per-chunk ceiling, over non-entry chunks. The entry graph has its own budget above and
  // would trip any ceiling small enough to be useful for the others.
  const lazy = (report.chunks ?? []).filter((c) => !c.inEntryGraph);
  for (const chunk of lazy) {
    if (chunk.gzip > budget.maxNonEntryChunkGzipBytes) {
      problems.push(
        `${chunk.file} is ${kb(chunk.gzip)} gzip, over the ${kb(budget.maxNonEntryChunkGzipBytes)} ` +
          'per-chunk ceiling. A lazy chunk costs nothing until it is needed and everything when it ' +
          'is; this is the line where "lazy" stops being an excuse.',
      );
    }
  }

  /**
   * B2 — the defect `#48(b)` was filed for, read from the MODULE GRAPH rather than from chunk names.
   *
   * A `jspdf` statically imported at the entry adds ~126 kB gzip to every first paint. B1 catches
   * that today only because the headroom happens to be smaller than jsPDF; a library half that size
   * would slip through while being exactly the same mistake.
   *
   * **The first version of this assertion could never have fired, and that was found by doing the
   * thing rather than simulating it.** It looked for a chunk whose FILENAME contained `jspdf` — which
   * exists only while the import is dynamic. Adding a real `import 'jspdf'` to `src/main.tsx` and
   * building showed Rollup inlining it into the entry chunk: the separate chunk vanishes, the name is
   * nowhere, and the assertion written to catch that exact defect goes quiet. Only B1 fired.
   * `packages` in the report is what survives, because it is what a chunk is MADE of.
   */
  const MUST_STAY_LAZY = ['jspdf', 'html2canvas'];
  const entryPackages = new Set(
    (report.chunks ?? []).filter((c) => c.inEntryGraph).flatMap((c) => c.packages ?? []),
  );
  if (entryPackages.size === 0) {
    problems.push(
      'no package names were recorded for the entry graph, so the must-stay-lazy check below is ' +
        'asserting over nothing. Rebuild: the reporter and this gate are out of step.',
    );
  }
  for (const name of MUST_STAY_LAZY) {
    if (!entryPackages.has(name)) continue;
    problems.push(
      `${name} is in the ENTRY GRAPH. It is an export-path library and must stay behind a dynamic ` +
        'import — every first paint pays for it otherwise, including the readers who never export ' +
        'anything.',
    );
  }

  /**
   * B6 — the render-blocking CSS, which the gate measured and did not read until the M5 review.
   *
   * `dist/index.html` loads it as a `<link rel="stylesheet">`, so the browser will not paint until it
   * has it: it belongs in a first-paint budget by the same argument that admits the entry graph. It
   * gets its own line rather than being folded into the JS number because the remedies are different
   * and a combined figure would hide which half moved.
   */
  if (typeof report.css?.gzip !== 'number') {
    problems.push('bundle-report.json has no css.gzip — the reporter and this gate disagree.');
  } else if (report.css.gzip > budget.cssGzipBytes) {
    problems.push(
      `the render-blocking CSS is ${kb(report.css.gzip)} gzip, over the ` +
        `${kb(budget.cssGzipBytes)} budget by ${kb(report.css.gzip - budget.cssGzipBytes)}.\n` +
        '      It is a <link rel="stylesheet"> in index.html, so nothing paints until it arrives.',
    );
  }

  /**
   * B5 — the measured floor is present.
   *
   * **Its scope shifted with the design, and saying so is the point.** The plan specified B5 as "a
   * budget entry naming a chunk that no longer exists → red", which the shipped design makes
   * inapplicable: there are no per-chunk-named budgets, only one ceiling. What it asserts instead is
   * that the derivation is stated — a budget with no recorded floor cannot tell a reader how much
   * headroom has been spent. Recorded the way B2's reinterpretation was, so a reader comparing the
   * plan's B5 against this one does not assume they test the same thing (M5 performance review).
   */
  if (typeof budget.floor?.entryGraphGzipBytes !== 'number') {
    problems.push(
      'bundle-budget.json has no floor.entryGraphGzipBytes — the derivation is unstated.',
    );
  }

  /**
   * B8a — each budget is derived from its floor, not chosen.
   *
   * The rule, read off every committed pair (three on 2026-09-16, three on 2026-09-25, all
   * agreeing): **`floor × headroomRatio`, rounded UP to the next whole KiB (1024)**. Plain
   * multiplication is NOT the rule — it would reject the committed entry-graph budget by about a
   * kilobyte, a gate failing on day one, which gets deleted rather than fixed. A budget raised on
   * purpose carries a `raisedBecause` and is exempt: the exemption is the written reason, so a
   * loosened number cannot arrive without one.
   */
  const ratio = budget.headroomRatio;
  const raised = typeof budget.raisedBecause === 'string' && budget.raisedBecause.trim() !== '';
  const PAIRS = [
    ['entryGraphGzipBytes', 'entryGraphGzipBytes'],
    ['maxNonEntryChunkGzipBytes', 'maxNonEntryChunkGzipBytes'],
    ['cssGzipBytes', 'cssGzipBytes'],
  ];
  if (typeof ratio !== 'number') {
    problems.push('bundle-budget.json has no numeric headroomRatio — the derivation is unstated.');
  } else if (!raised) {
    for (const [key, floorKey] of PAIRS) {
      const floor = budget.floor?.[floorKey];
      // The entry floor's absence is B5's finding; do not report one fault twice.
      if (typeof floor !== 'number') {
        if (key !== 'entryGraphGzipBytes') {
          problems.push(`bundle-budget.json has no floor.${floorKey} — ${key} cannot be derived.`);
        }
        continue;
      }
      const derived = Math.ceil((floor * ratio) / 1024) * 1024;
      if (budget[key] !== derived) {
        problems.push(
          `${key} is ${budget[key]}, but its floor ${floor} x ${ratio}, rounded up to a whole KiB, ` +
            `is ${derived}.\n` +
            '      Re-derive it from the floor, or record why it is higher in `raisedBecause`.',
        );
      }
    }
  }

  /**
   * B8b — the ratchet: a budget that has become loose says so.
   *
   * B8a alone cannot see this. A split changes the report and neither budget field, so a build
   * that sheds 280 kB passes every other assertion above against a budget now 280 kB too generous —
   * room for the whole of what was just removed to come back unnoticed. This compares the report to
   * the floor instead: if the entry graph plus its headroom is below the recorded floor, the floor
   * is stale, and the remedy is to re-floor at the head that shrank it (a deliberate exception to
   * `bundle-budget.json`'s "measured at origin/main" rule, for lowerings only —
   * `docs/specs/route-code-splitting/feature-spec.md` §4).
   */
  if (typeof ratio === 'number' && typeof budget.floor?.entryGraphGzipBytes === 'number') {
    const floor = budget.floor.entryGraphGzipBytes;
    if (entryGraph * ratio < floor) {
      problems.push(
        `the entry graph is ${kb(entryGraph)} gzip, but the recorded floor is ${kb(floor)}: even with ` +
          `${ratio}x headroom it is below the floor, so the budget now allows the whole of what was ` +
          'removed to return unnoticed.\n' +
          '      Re-floor: set `floor` to this build, re-derive the three budgets as floor x ' +
          'headroomRatio rounded up to a whole KiB, and update `measuredAt` and `measuredBy`.',
      );
    }
  }

  const spent = entryGraph - (budget.floor?.entryGraphGzipBytes ?? entryGraph);
  return finish(
    problems,
    report.chunks?.length ?? 0,
    `entry graph ${kb(entryGraph)} of ${kb(budget.entryGraphGzipBytes)} gzip ` +
      `(${spent >= 0 ? '+' : ''}${kb(spent)} since the floor was measured), ` +
      `${lazy.length} lazy chunk(s), largest ${kb(Math.max(0, ...lazy.map((c) => c.gzip)))}, ` +
      `CSS ${kb(report.css?.gzip ?? 0)} of ${kb(budget.cssGzipBytes)}.`,
  );
}

/**
 * The CLI. **A missing report is its own failure, before `runGate` is reached** — it means nobody
 * built, which is a different remedy from anything the assertions can say.
 */
if (process.argv[1] && process.argv[1].endsWith('check-bundle-size.mjs')) {
  const reportPath = new URL('bundle-report.json', root);
  if (!existsSync(reportPath)) {
    say(`  ✗ ${reportPath.pathname} is missing.`);
    say(`${NAME}: FAIL — build first: pnpm --filter @repo/web build`);
    process.exit(1);
  }
  const assets = new URL('dist/assets/', root);
  const chunkSources = existsSync(assets)
    ? Object.fromEntries(
        readdirSync(assets)
          .filter((f) => f.endsWith('.js'))
          .map((f) => [f, readFileSync(new URL(f, assets), 'utf8')]),
      )
    : {};
  process.exit(
    runGate({
      chunkSources,
      report: JSON.parse(readFileSync(reportPath, 'utf8')),
      budget: JSON.parse(readFileSync(new URL('bundle-budget.json', root), 'utf8')),
    }),
  );
}
