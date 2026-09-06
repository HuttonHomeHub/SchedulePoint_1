#!/usr/bin/env node
/**
 * **A package barrel may not force a Node-only module on browser consumers**
 * (`docs/specs/seed-browser-safe/`, closing `docs/TECH_DEBT.md` #252).
 *
 * ## Why this gate exists, and what it is really guarding
 *
 * On 2026-09-05 `@repo/seed`'s barrel began re-exporting a tier that reads the P6 fixture off disk
 * with `node:fs`. Nothing in the shipped application imported that package, so no user was ever
 * affected and no test went red — but `pnpm measure:draw`, the hand-run benchmark this repository
 * quotes for every canvas performance claim, **stopped bundling entirely** and nobody noticed for a
 * day. That script is deliberately not in CI, for the good reason that a container's absolute
 * timings are noise; the accepted cost is that it can rot silently, and it did.
 *
 * So this gate does not run the benchmark and makes no claim about speed. It asks one cheap
 * question — **can each browser-side entry point still be bundled for a browser at all?** — which
 * is the half that CAN be checked deterministically, and it is the half that broke.
 *
 * It is written to catch the NEXT barrel widening rather than this one. Verified red against the
 * pre-fix tree (both entries failed on `Could not resolve "node:fs"`).
 *
 * ## Why esbuild and not a bundler run
 *
 * `--bundle` with no `--outfile` resolves the whole module graph and writes nothing. That is
 * exactly the question being asked, it needs no browser, and it takes under a second — the
 * properties that decide whether a gate survives (ADR-0058: a gate that is slow or flaky gets
 * deleted rather than fixed).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Browser-side entry points that import a workspace package.
 *
 * **A hand-maintained list, and the reason is honest rather than lazy**: the population is "files
 * that will be bundled for a browser by something other than Vite", which no glob expresses — the
 * app's own `src/` is covered by the real build, and these are the hand-run instruments that are
 * not. It is short, and a pinned count below fails if it silently empties (the ADR-0093 shape: a
 * green sweep that found nothing must not read as a pass).
 */
const ENTRIES = [
  'apps/web/scripts/revision-diff-bench.ts',
  'apps/web/scripts/link-routing-bench.ts',
  'apps/web/scripts/scale-scene.ts',
  'apps/web/scripts/strip-stack-bench.ts',
];

/**
 * **Each entry is bundled from its OWN workspace, not from the repo root**, and the reason is a
 * defect this gate had on its first run: `esbuild` is a transitive dependency of Vite rather than a
 * direct one, so `pnpm exec esbuild` resolves inside `apps/web` and **not** at the root, where it
 * exits 254 with `Command "esbuild" not found`. The first version ran from the root and therefore
 * failed every entry — while printing a confident message about a widened barrel. A gate that
 * always fails, for a reason it misreports, is worse than no gate: it trains a reader to ignore it.
 */
function workspaceOf(entry) {
  const parts = entry.split('/');
  return { cwd: join(root, parts[0], parts[1]), rel: parts.slice(2).join('/') };
}

const failures = [];
let checked = 0;

for (const entry of ENTRIES) {
  const abs = join(root, entry);
  if (!existsSync(abs)) {
    failures.push(`${entry}: listed here but does not exist — remove it or fix the path.`);
    continue;
  }
  checked += 1;
  const { cwd, rel } = workspaceOf(entry);
  try {
    execFileSync(
      'pnpm',
      [
        'exec',
        'esbuild',
        rel,
        '--bundle',
        '--platform=browser',
        '--format=iife',
        '--target=chrome120',
        // Resolve the whole graph and write nothing. The question is "does it resolve", not
        // "what does it produce".
        '--outfile=/dev/null',
        '--log-level=error',
      ],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    // **Both streams.** pnpm reports its own failures (a missing binary, a bad workspace) on
    // stdout while esbuild reports resolution errors on stderr, so reading one alone produces an
    // empty diagnosis — which is exactly how this gate's own first failure looked.
    const streams = [String(error.stdout ?? ''), String(error.stderr ?? '')]
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');
    failures.push(
      `${entry}:\n${(streams || '(no output — check the entry path and the workspace)')
        .split('\n')
        .slice(0, 8)
        .join('\n')}`,
    );
  }
}

// **The pinned positive case.** "Every entry resolved" is satisfied perfectly by a list that has
// been emptied, so the population is asserted before the result is trusted.
if (checked < ENTRIES.length || checked === 0) {
  console.error(
    `check:browser-safe: the entry list is not intact — checked ${String(checked)} of ` +
      `${String(ENTRIES.length)}. A gate that examines nothing is not a passing gate.`,
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error('check:browser-safe: a browser-side entry point cannot be bundled for a browser.');
  console.error('');
  for (const f of failures) console.error(`  ${f}\n`);
  console.error(
    'A workspace barrel has probably widened to re-export something that reads the filesystem.\n' +
      'Import the tier by subpath instead of from the barrel — see docs/specs/seed-browser-safe/.',
  );
  process.exit(1);
}

console.log(
  `check:browser-safe: OK. ${String(checked)} browser-side entry points resolve for a browser.`,
);
