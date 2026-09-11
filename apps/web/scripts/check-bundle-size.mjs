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
 * ## Why this is not a root `check:*`
 *
 * It needs a build. A root gate runs in `pnpm prepush` for everyone on every push, and making a
 * five-second push depend on a thirty-second production build is how a gate gets bypassed. It lives
 * in `apps/web`, is invoked by CI after the build step, and is therefore **deliberately outside
 * `check:ci-roster`'s population** — that gate's docblock says the same thing from the other side,
 * because a rule stated once is a rule one reader will not find.
 *
 * ## A blind spot with a trigger, named because it has not fired yet
 *
 * The report is written OUTSIDE `dist/` so it can never be served — which also puts it outside
 * `turbo.json`'s declared `build` outputs. On a Turbo cache HIT, `dist/**` is restored, `vite build`
 * never runs, and this file is neither written nor restored: the gate would then report "build
 * first" on a perfectly correct bundle. It cannot happen today — `ci.yml` caches nothing for Turbo
 * and configures no remote cache — so the fix is deliberately not pre-emptive. **Adding Turbo
 * caching to CI is the trigger**: declare `apps/web/bundle-report.json` in `turbo.json`'s outputs
 * in the same change. Found by the M5 devops review, and recorded rather than guessed at.
 *
 * ## What it does NOT check
 *
 * Whether the bundle is *fast*. Bytes are a proxy: parse and execute time, and the waterfall a
 * route actually triggers, are `docs/TECH_DEBT.md` #292's subject and not this gate's. A green run
 * means the payload has not grown past the line, never that the page is quick.
 */
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const NAME = 'check:bundle-size';

const say = (s) => process.stdout.write(`${s}\n`);
const kb = (n) => `${(n / 1024).toFixed(2)} kB`;

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
 * Run every assertion against a report and a budget, and return the exit code.
 *
 * **Exported, and the CLI below is a thin caller, so a suite drives the REAL assertions.** It was
 * top-level script code reading fixed paths until the M5 gate pass, where two independent reviews
 * blocked on the same thing: seven assertions "verified red" by hand against a live build, with
 * nothing committed that could ever verify them again. A future edit weakening B2 or B6 would have
 * shipped with every suite in the repository green — the exact failure this epic exists to remove,
 * in its own newest gate.
 */
export function runGate({ report, budget }) {
  const problems = [];

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
  process.exit(
    runGate({
      report: JSON.parse(readFileSync(reportPath, 'utf8')),
      budget: JSON.parse(readFileSync(new URL('bundle-budget.json', root), 'utf8')),
    }),
  );
}
