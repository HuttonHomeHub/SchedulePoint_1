#!/usr/bin/env node
/**
 * **A frontend-only epic touches no server code, checked rather than asserted.**
 *
 * The Gantt-editing epic's recalculation-parity argument (ADR-0034) rests on `computeSchedule`'s
 * input being unchanged. `engine-import.structural.test.ts` closes one channel — the web client
 * importing the engine — but the *real* risk was never that: it is an `apps/api` change quietly
 * widening the engine's input, and the plan guarded that with a sentence saying "no task in this
 * epic touches `apps/api`". A sentence is exactly what CLAUDE.md §19.10 and ADR-0058 exist to
 * replace, so this is the gate.
 *
 * **It is opt-in per branch, not a blanket ban**, because most branches legitimately touch the API.
 * Set `FRONTEND_ONLY=1` (or add the branch to `frontend-only-branches.json`) and the check fails on
 * any diff under `apps/api/`. Tripping it is not a bug to route around: it is the signal that a
 * milestone has drifted out of the shape its parity argument assumed, and the answer is to say so
 * deliberately — reopening the parity question — rather than to discover it at the gate pass.
 *
 * Usage:  node scripts/check-frontend-only.mjs [baseRef]
 */
import { execFileSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'origin/main';
const GUARDED = ['apps/api/'];

if (!process.env.FRONTEND_ONLY) {
  console.log('check:frontend-only — skipped (FRONTEND_ONLY is not set).');
  process.exit(0);
}

let changed = [];
try {
  const out = execFileSync('git', ['diff', '--name-only', `${BASE}...HEAD`], { encoding: 'utf8' });
  changed = out.split('\n').filter(Boolean);
} catch (error) {
  // A missing base ref is a CI configuration problem, not a passing check. Fail loudly: a gate that
  // silently passes when it cannot run is worse than no gate (ADR-0088's `check:flags` lesson, where
  // 135 no-op pins looked like 135 real ones).
  console.error(`check:frontend-only — could not diff against ${BASE}: ${error.message}`);
  process.exit(1);
}

const offenders = changed.filter((path) => GUARDED.some((prefix) => path.startsWith(prefix)));

if (offenders.length > 0) {
  console.error(
    `check:frontend-only — this branch is declared frontend-only and touches server code:\n` +
      offenders.map((path) => `  ${path}`).join('\n') +
      `\n\nThat is the signal, not the problem. A frontend-only epic's recalculation-parity argument\n` +
      `(ADR-0034) rests on the engine's INPUT being unchanged; a change under apps/api/ can widen it.\n` +
      `Either the change belongs on a different branch, or the parity argument needs reopening and\n` +
      `saying so. Do not unset FRONTEND_ONLY to get past this.`,
  );
  process.exit(1);
}

console.log(`check:frontend-only — OK (${changed.length} changed files, none under apps/api/).`);
