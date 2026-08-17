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
 * **It is opt-in, not a blanket ban**, because most work legitimately touches the API. The opt-in is
 * `scripts/frontend-only.json` — `active: true` declares an epic in flight and names why, and the
 * epic's own gate pass removes it. `FRONTEND_ONLY=1` in the environment forces the same thing, which
 * is how it is probed locally.
 *
 * **Why a repository file rather than a branch name.** It shipped on 2026-08-17 opting in from CI
 * with `contains(github.head_ref, 'gantt')`, and that predicate **could never be true**: this
 * repository has one long-lived agent branch, `claude/schedulepoint-project-setup-naacjj`, so the
 * gate written to protect this epic was inert for the whole of it — a gate that cannot fail, which
 * is ADR-0088's 135 no-op flag pins in a second costume, written the same week by the same hand that
 * recorded them. The file cannot drift that way: it is in the diff, a reviewer sees it, and it is
 * read rather than pattern-matched. The docblock it replaces also offered a
 * `frontend-only-branches.json` opt-in that **did not exist and was read by nothing** — an ADR-0076
 * Class 3 claim inside the gate's own explanation of itself. Both corrected here rather than
 * stepped over (the ADR-0071 lesson).
 *
 * Tripping it is not a bug to route around: it is the signal that a milestone has drifted out of the
 * shape its parity argument assumed, and the answer is to say so deliberately — reopening the parity
 * question — rather than to discover it at the gate pass.
 *
 * Usage:  node scripts/check-frontend-only.mjs [baseRef]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] ?? 'origin/main';
const HERE = dirname(fileURLToPath(import.meta.url));
const DECLARATION = join(HERE, 'frontend-only.json');
const DEFAULT_GUARDED = ['apps/api/'];

/**
 * Read the declaration. A **missing** file means no epic is in flight, which is the ordinary state
 * and not a failure. A file that is present and unparseable IS a failure: it is the only thing
 * standing between this gate and silence, so "we could not read the opt-in" must never be the reason
 * the check passes.
 */
function readDeclaration() {
  let raw;
  try {
    raw = readFileSync(DECLARATION, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(
      `check:frontend-only — ${DECLARATION} is present but unreadable: ${error.message}`,
    );
    process.exit(1);
  }
}

const declaration = readDeclaration();
const forced = Boolean(process.env.FRONTEND_ONLY);
const active = forced || declaration?.active === true;

if (!active) {
  console.log(
    'check:frontend-only — skipped: no frontend-only epic is declared ' +
      '(scripts/frontend-only.json is absent or inactive, and FRONTEND_ONLY is unset).',
  );
  process.exit(0);
}

const guarded = Array.isArray(declaration?.guarded) ? declaration.guarded : DEFAULT_GUARDED;
const epic = declaration?.epic ?? 'FRONTEND_ONLY (forced from the environment)';

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

const offenders = changed.filter((path) => guarded.some((prefix) => path.startsWith(prefix)));

if (offenders.length > 0) {
  console.error(
    `check:frontend-only — "${epic}" is declared frontend-only and this branch touches guarded code:\n` +
      offenders.map((path) => `  ${path}`).join('\n') +
      `\n\nThat is the signal, not the problem. A frontend-only epic's recalculation-parity argument\n` +
      `(ADR-0034) rests on the engine's INPUT being unchanged; a change under ${guarded.join(', ')}\n` +
      `can widen it. Either the change belongs on a different branch, or the parity argument needs\n` +
      `reopening and saying so. Do not deactivate the declaration to get past this.`,
  );
  process.exit(1);
}

console.log(
  `check:frontend-only — OK for "${epic}": ${changed.length} changed files, ` +
    `none under ${guarded.join(', ')}.`,
);
