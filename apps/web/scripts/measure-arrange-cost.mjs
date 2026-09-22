#!/usr/bin/env node
/**
 * **M-C0-T3b — what does deriving the `Arrange` offer cost on plan load?** (FC-C8's third limb)
 *
 *   node scripts/measure-arrange-cost.mjs
 *
 * ## Why this is back, having been withdrawn
 *
 * M-C0-T3 withdrew the derived WBS-band default, and this task was withdrawn with it on the ground
 * that "there is nothing to cost". **That was wrong, and it was wrong within the hour.** M-C2's
 * dock strip has to know whether a press of `Arrange` would move anything before a planner asks —
 * that is what makes it an offer rather than a button — so it runs the SAME `packLanes` derivation
 * on every plan load. Only the consumer changed. Recorded here rather than quietly re-measured,
 * because a withdrawal whose reason has lapsed reads exactly like one whose reason still holds
 * (ADR-0114's finding about `docs/TECH_DEBT.md` #124).
 *
 * ## The bar, and where it comes from
 *
 * **16 ms — one frame** at `scale-2000`, FC-C8's own figure, unchanged. The derivation runs inside
 * a React render, so anything over a frame is a visible stall on the surface this epic exists to
 * make more legible.
 *
 * **Withdrawal clause, named in advance:** over budget, the strip's predicate moves behind the
 * existing on-demand path — the offer appears only once a planner has pressed `Arrange` and been
 * told there is something to move, which is strictly today's behaviour plus nothing. That is a
 * worse product and a safe landing, and naming it before the measurement is what stops the number
 * being argued with afterwards.
 *
 * The scene is the ADR-0066 scale generator's, for the reason `scale-scene.ts` gives at length: a
 * uniform grid measures a picture the product never draws. What it does NOT do is schedule — the
 * dates are a plausible layout, not a CPM result — and that is exactly what this measurement needs,
 * because `packLanes` reads spans and lanes and has never seen a critical path.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** FC-C8's third limb. One frame. */
const BUDGET_MS = 16;
const SIZES = [500, 2000];
const REPEATS = 9;

const out = mkdtempSync(join(tmpdir(), 'sp-arrange-'));
const entry = join(out, 'entry.ts');
writeFileSync(
  entry,
  `export { scaleScene } from ${JSON.stringify(process.cwd() + '/src/features/perf-probe/scenes/scale-scene.ts')};
export { summariseLaneArrangement } from ${JSON.stringify(process.cwd() + '/src/features/tsld/model/arrange-lanes.ts')};
`,
);
const bundle = join(out, 'bench.mjs');
execFileSync(
  'pnpm',
  [
    'exec',
    'esbuild',
    entry,
    '--bundle',
    '--format=esm',
    '--platform=node',
    `--outfile=${bundle}`,
    '--log-level=warning',
  ],
  { stdio: 'inherit' },
);
const { scaleScene, summariseLaneArrangement } = await import(pathToFileURL(bundle).href);

const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
console.log(
  `\n[diagram-legibility Part C M-C0-T3b / FC-C8 cost] node, ${new Date().toISOString()}`,
);
console.log(`  commit ${commit}`);
console.log(`  budget ${String(BUDGET_MS)} ms — one frame, at scale-2000\n`);

let worst = 0;
for (const size of SIZES) {
  const scene = scaleScene(size);
  // `computeLaneArrangement` reads id / laneIndex / earlyStart / earlyFinish off an activity and
  // `predecessor.id` / `successor.id` off a dependency. Nothing else, so nothing else is invented.
  const activities = scene.activities.map((a) => ({
    id: a.id,
    laneIndex: a.laneIndex,
    earlyStart: a.earlyStart,
    earlyFinish: a.earlyFinish,
  }));
  const dependencies = scene.edges.map((e) => ({
    predecessor: { id: e.predecessorId },
    successor: { id: e.successorId },
  }));
  const input = { activities, sceneActivities: activities, dependencies, dataDate: '2026-01-01' };

  // The control FIRST: a run that derived nothing would be the fastest number this script can
  // produce and would say nothing at all (ADR-0130).
  const probe = summariseLaneArrangement(input);
  if (probe.changes.length === 0) {
    throw new Error(
      `M-C0-T3b INDETERMINATE: the derivation moved nothing at ${String(size)}, so this measures ` +
        `an early return rather than a pack. Refusing to report a number.`,
    );
  }

  const samples = [];
  for (let i = 0; i < REPEATS; i += 1) {
    const started = performance.now();
    summariseLaneArrangement(input);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.min(samples.length - 1, Math.ceil(samples.length * 0.95) - 1)];
  const max = samples[samples.length - 1];
  if (max > worst) worst = max;
  console.log(
    `  scale-${String(size).padEnd(5)} ${scene.summary}\n` +
      `    ${String(probe.changes.length).padStart(5)} moves · ${String(probe.currentRows)} rows → ` +
      `${String(probe.arrangedRows)}\n` +
      `    p50 ${p50.toFixed(2)} ms · p95 ${p95.toFixed(2)} ms · max ${max.toFixed(2)} ms ` +
      `over ${String(REPEATS)} runs`,
  );
}

console.log('');
if (worst <= BUDGET_MS) {
  console.log(
    `  FC-C8 cost limb PASSES — worst single run ${worst.toFixed(2)} ms against ${String(BUDGET_MS)} ms.`,
  );
} else {
  console.log(
    `  FC-C8 cost limb FAILS — worst single run ${worst.toFixed(2)} ms against ${String(BUDGET_MS)} ms.\n` +
      `  The withdrawal clause fires: the strip's predicate moves behind the on-demand path and the\n` +
      `  offer appears only after a press. Do not tune the bar.`,
  );
  process.exitCode = 1;
}
