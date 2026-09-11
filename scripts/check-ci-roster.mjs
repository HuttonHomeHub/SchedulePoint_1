#!/usr/bin/env node
/**
 * **Every root `check:*` gate runs in CI, or is exempt with a written reason** (`docs/TECH_DEBT.md`
 * #244).
 *
 * The gates in this repository are its memory. A gate that exists, passes locally and is never run
 * by CI is worse than no gate: it reads as coverage on every PR that does not run `pnpm prepush`,
 * and the one thing nobody checks is the list of things that get checked.
 *
 * ## The trap this is built around, which is LIVE rather than hypothetical
 *
 * `#244`'s own recommended remedy was a one-liner grepping `ci.yml` for each gate's name. Run
 * today, that reports **`check:reconcile-due` as covered** — and its only occurrence in the whole
 * file is a comment at `:75-77` saying it is *deliberately absent*. So the naive check passes over
 * the single genuine absence in the roster, by reading the sentence that documents it.
 *
 * That is why **R6 is the load-bearing assertion and not a defensive extra**, and why comments are
 * stripped before anything is matched. Four gate names appear inside comments in `ci.yml` today.
 *
 * ## Why this parses text rather than YAML, reversing the spec's D3
 *
 * `docs/specs/delivery-gates/feature-spec.md` §4.1 D3 chose a real YAML parse, on the stated
 * ground that `yaml` is already in the lockfile and therefore free. It is in the lockfile — at a
 * single version, 2.9.0, resolved transitively through `@changesets/cli` — and it is **not
 * importable from the root**: `import('yaml')` from a root script throws `ERR_MODULE_NOT_FOUND`
 * under pnpm's strict layout. Measured, not assumed. So declaring it is a real new root dependency,
 * and §2 is clear that every dependency is a liability.
 *
 * The stronger reason is that **a YAML parse would not have removed the work**. It hands back a
 * `run:` block's body as a string, shell comments included — so a gate name mentioned in a shell
 * comment inside a `run:` step still has to be stripped by hand. The parser solves the half that is
 * easy and leaves the half that is the defect. Both approaches need comment-stripping; only one
 * needs a dependency.
 *
 * Its residual risk is named and made loud rather than accepted: a `#` inside a quoted string would
 * make naive stripping eat real content. There is none in `ci.yml` today (measured), and R8 below
 * **refuses to run** rather than misreading the file if one ever appears.
 *
 * ## What this deliberately does NOT check
 *
 * That the CI step is correct, that it runs in a job that actually executes, or that the workflow
 * is triggered at all. It checks that the two rosters name the same gates. A step that is present
 * and broken is a different failure with a different owner, and claiming otherwise would make this
 * gate's green mean more than it does.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { report } from './lib/doc-register.mjs';

const NAME = 'check:ci-roster';

/** The gate's own source, for the R5 self-scan. Exported so the suite reads what the CLI runs. */
export const SELF = 'scripts/check-ci-roster.mjs';

/**
 * Run the whole gate against a repository root, and return the exit code.
 *
 * Exported — and the CLI below is a two-line caller — so the suite drives the REAL wiring,
 * `report()` included. `stack-record.structural.test.ts` asserted against a private mirror of the
 * logic it was named for and would have stayed green through the regression its own docblock
 * described; the sibling gates in this directory take this shape for that reason.
 */
export function runGate(root) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const problems = [];

  const pkg = JSON.parse(read('package.json'));
  const declared = Object.keys(pkg.scripts ?? {}).filter((k) => k.startsWith('check:'));

  /**
   * **A `check:*` in CI is not necessarily a ROOT script, and this gate assumed it was.**
   *
   * Found by `docs/specs/delivery-gates/` M3: `check:bundle-size` lives in `apps/web` because it
   * needs a production build, and making a five-second `pnpm prepush` wait for one is how a gate
   * gets bypassed. It is invoked as `pnpm --filter @repo/web check:bundle-size`, and R2 reported it
   * as a CI step for a script that does not exist — true of the root manifest and false of the
   * repository.
   *
   * Exempting it would have been the quick answer and the wrong one: the gate would then be blind
   * to a workspace step naming a script that really had been renamed. So workspace scripts are
   * resolved where they live, and R2 keeps its teeth in both places.
   */
  const workspaceScripts = new Map();
  for (const dir of ['apps', 'packages']) {
    let entries = [];
    try {
      entries = readdirSync(join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = JSON.parse(read(join(dir, entry.name, 'package.json')));
        if (typeof manifest.name === 'string') {
          workspaceScripts.set(manifest.name, new Set(Object.keys(manifest.scripts ?? {})));
        }
      } catch {
        // A directory without a manifest is not a workspace package.
      }
    }
  }

  let workflow;
  try {
    workflow = read('.github/workflows/ci.yml');
  } catch {
    // Fail closed and say so. A missing workflow would otherwise make `inCi` empty and every
    // declared gate look unwired — a true-sounding flood of findings with one real cause.
    problems.push(
      '.github/workflows/ci.yml could not be read, so nothing below is a statement about CI.',
    );
    return report({ name: NAME, problems, population: declared.length });
  }

  /**
   * **R8 — refuse rather than misread.** Naive `#`-to-end-of-line stripping is correct only while
   * no `#` sits inside a quoted string. That holds in `ci.yml` today and is not a property anybody
   * maintains, so the gate checks it and stops. A gate that quietly starts reading its subject
   * wrong is the failure this whole file is about.
   */
  const lines = workflow.split('\n');
  const quoted = lines.findIndex((line) => /(['"])[^'"]*#[^'"]*\1/.test(line));
  if (quoted >= 0) {
    problems.push(
      `.github/workflows/ci.yml line ${quoted + 1} has a '#' inside a quoted string, so stripping ` +
        'comments by line would eat real content. This gate refuses to guess: quote it ' +
        'differently, or teach this check to parse YAML properly.',
    );
    return report({ name: NAME, problems, population: declared.length });
  }

  /** Comments gone — YAML's and the shell's alike, which is the same rule and the same defect. */
  const stripped = workflow.replace(/#[^\n]*/g, '');

  // Workspace invocations first, so their gate names are not then counted as root ones.
  const workspaceCalls = [...stripped.matchAll(/--filter\s+(\S+)\s+(check:[a-z][a-z0-9-]*)/g)].map(
    (m) => ({ workspace: m[1], gate: m[2] }),
  );

  for (const { workspace, gate } of workspaceCalls) {
    const scripts = workspaceScripts.get(workspace);
    if (scripts === undefined) {
      problems.push(
        `.github/workflows/ci.yml runs ${gate} in workspace ${workspace}, which is not a package ` +
          'in apps/ or packages/.',
      );
    } else if (!scripts.has(gate)) {
      problems.push(
        `.github/workflows/ci.yml runs ${gate} in ${workspace}, which declares no such script. ` +
          'A renamed or deleted gate leaves a CI step that fails for a reason nobody expects.',
      );
    }
  }

  const workspaceGateNames = new Set(workspaceCalls.map((c) => c.gate));
  const inCi = new Set(
    [...stripped.matchAll(/\bcheck:[a-z][a-z0-9-]*/g)]
      .map((m) => m[0])
      .filter((name) => !workspaceGateNames.has(name)),
  );

  let exempt = {};
  try {
    exempt = JSON.parse(read('scripts/ci-roster.json')).exempt ?? {};
  } catch {
    problems.push(
      'scripts/ci-roster.json is missing or unreadable. It is where an exemption lives; without ' +
        'it a deliberate absence is indistinguishable from a forgotten one.',
    );
  }

  // R1 — every declared gate is in CI, or exempt with a reason.
  for (const gate of declared) {
    if (inCi.has(gate)) continue;
    const reason = exempt[gate];
    if (typeof reason === 'string' && reason.trim() !== '') continue;
    problems.push(
      `${gate} is a root check:* script and runs in no CI step.\n` +
        '      Two remedies, and they are not interchangeable: add the step to ' +
        '.github/workflows/ci.yml, or — if it is deliberately not a CI gate — add it to ' +
        'scripts/ci-roster.json with the reason. "Not yet" is not a reason.',
    );
  }

  // R2 — CI does not run a gate that no longer exists.
  for (const gate of inCi) {
    if (declared.includes(gate)) continue;
    problems.push(
      `.github/workflows/ci.yml runs ${gate}, which is not a check:* script in package.json.\n` +
        '      A renamed or deleted gate leaves a CI step that fails for a reason nobody expects.',
    );
  }

  // R3 — an exemption for a gate that does not exist is stale.
  for (const gate of Object.keys(exempt)) {
    if (declared.includes(gate)) continue;
    problems.push(
      `scripts/ci-roster.json exempts ${gate}, which is not a check:* script any more. Delete the ` +
        'entry: a stale exemption is an exemption nobody is reading.',
    );
  }

  // R4 — an exemption for a gate that IS in CI is a contradiction.
  for (const gate of Object.keys(exempt)) {
    if (!inCi.has(gate)) continue;
    problems.push(
      `scripts/ci-roster.json says ${gate} need not run in CI, and .github/workflows/ci.yml runs ` +
        'it. One of the two is wrong, and the file with the reason in it is the one to read first.',
    );
  }

  return report({
    name: NAME,
    problems,
    // R7 — the population. An empty roster satisfies every loop above perfectly, and a green run
    // could not then tell "every gate is wired" from "there are no gates" (ADR-0093).
    population: declared.length,
    summary:
      `${declared.length} check:* gates, ${declared.filter((g) => inCi.has(g)).length} in CI, ` +
      `${Object.keys(exempt).length} exempt by written reason.`,
  });
}

// The CLI. Guarded so importing this module for the suite does not exit the process.
if (
  resolve(process.argv[1] ?? '') === resolve(new URL(SELF, new URL('..', import.meta.url)).pathname)
) {
  process.exit(runGate(new URL('..', import.meta.url).pathname));
}
