#!/usr/bin/env node
// @ts-check
/**
 * **The CPM engine does not change during an epic that says it will not — checked, not asserted.**
 *
 * `docs/specs/zero-duration-task/feature-spec.md` D10 (FC-1). Several epics have rested on "the
 * engine is not modified" and every one of them enforced it with a sentence in a PR description.
 * A sentence is what ADR-0058 and CLAUDE.md §19.11 exist to replace; this is the gate.
 *
 * ## The three limbs (while the declaration is active)
 *
 * 1. **A non-test engine file differs from the merge base.** Any path under
 *    `apps/api/src/modules/schedule/engine/` that does not end `.spec.ts` — source, constants, and
 *    the golden `__snapshots__` alike — added, deleted or modified.
 * 2. **An existing engine spec changes anything but its comments.** A `*.spec.ts` that exists at
 *    the merge base is compared at `HEAD` after both sides go through `stripComments`, with each
 *    line trimmed and blank lines dropped (so a docblock growing by a line is not a finding). A new
 *    spec file is exempt: new characterisation cases belong in a new file, which is the rule. A
 *    deleted one is a finding.
 * 3. **The declaration has outlived its epic.** The declared `debtRow` is no longer an OPEN
 *    detailed row in `docs/TECH_DEBT.md`, read through `openDetailedRow`, the lookup
 *    `check:debt-status` shares. **Both heading levels, deliberately**: #384 is a `###` row, and a
 *    one-level lookup would have called this declaration stale on the commit that introduced it.
 *
 * **Limbs 1–2 read `BASE...HEAD`; limb 3 does not.** On `main`, or on any branch with no engine
 * change, limbs 1–2 find nothing. Limb 3 reads the working tree's register and fails EVERY push,
 * on every branch, once the declaration is active and its row is not open. That is the design: the
 * one precedent opt-in gate, `check:frontend-only`, went stale twice and then blocked a different
 * epic with a message about somebody else's argument (`docs/TECH_DEBT.md` #194). Here the stale
 * state is a failure that names itself, and the epic's closing commit deactivates the declaration
 * in the same commit that closes the row.
 *
 * **Committed work only.** Like `check:frontend-only`, limbs 1–2 compare commits, not the working
 * tree, so an uncommitted engine edit is invisible until it is committed. CI's tree is clean, so
 * this matters only locally.
 *
 * ## Blind spots, stated rather than discovered
 *
 * - `stripComments` does not know what a string is: an edit made only after a `//`, or between a
 *   `/*` and a `*\/`, inside a string or template literal, is invisible to limb 2
 *   (`scripts/lib/strip-comments.mjs`; pinned as a known pass-through by the suite).
 * - Line trimming hides a change to the leading or trailing whitespace of a line inside a multi-line
 *   template literal. Nothing in the engine's specs depends on that today.
 * - It guards one directory. An engine behaviour change made from outside `engine/` (a caller that
 *   feeds the engine different input) is not this gate's subject; the epic's own API e2e is.
 *
 * Usage:  node scripts/check-engine-parity.mjs [baseRef]    (default origin/main)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDetailedRow, REPO_ROOT, report } from './lib/doc-register.mjs';
import { stripComments } from './lib/strip-comments.mjs';

const NAME = 'check:engine-parity';
export const ENGINE_DIR = 'apps/api/src/modules/schedule/engine/';
export const DECLARATION = 'scripts/engine-parity.json';
const REGISTER = 'docs/TECH_DEBT.md';

/** Comment-stripped, each line trimmed, blank lines dropped: what limb 2 compares. */
export function normaliseSpec(text) {
  return stripComments(text)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

/**
 * Run the whole gate against a repository `root` and a `base` ref; returns the exit code.
 *
 * Exported so the suite drives the real wiring, `report()` included (the `check-ci-roster`
 * precedent), against throwaway git repositories rather than a mirror of the rules.
 */
export function runGate({ root, base }) {
  const git = (/** @type {string[]} */ args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  let raw;
  try {
    raw = readFileSync(join(root, DECLARATION), 'utf8');
  } catch {
    process.stdout.write(`${NAME} — skipped: ${DECLARATION} is absent, so no epic is declared.\n`);
    return 0;
  }
  let declaration;
  try {
    declaration = JSON.parse(raw);
  } catch (error) {
    // Present and unreadable is a failure: the declaration is the only thing between this gate and
    // silence, so "we could not read it" must never be the reason the check passes.
    return report({
      name: NAME,
      problems: [
        `${DECLARATION} is present but not valid JSON: ${/** @type {Error} */ (error).message}`,
      ],
      population: 1,
    });
  }
  if (declaration?.active !== true) {
    process.stdout.write(
      `${NAME} — skipped: ${DECLARATION} declares no active epic (active is not true).\n`,
    );
    return 0;
  }

  const epic = String(declaration.epic ?? '(unnamed epic)');
  const debtRow = declaration.debtRow;
  const problems = [];

  // ── The diff. A base that cannot be diffed fails loudly, as `check:frontend-only` does. ────────
  let mergeBase;
  let changed;
  try {
    mergeBase = git(['merge-base', base, 'HEAD']).trim();
    changed = git(['diff', '--name-only', `${base}...HEAD`, '--', ENGINE_DIR])
      .split('\n')
      .filter(Boolean);
  } catch (error) {
    const e = /** @type {Error & { stderr?: string }} */ (error);
    return report({
      name: NAME,
      problems: [
        `could not diff against ${base}: ${(e.stderr ?? e.message).trim()}. A gate that cannot ` +
          'run must not pass; fetch the base (CI does: "Fetch the base branch for diff-based checks").',
      ],
      population: 1,
    });
  }

  // The population is the guarded tree itself, at both ends. If it is empty the path is wrong and
  // every limb below would pass over nothing, so `report()` refuses (the empty-population rule).
  const listed = (/** @type {string} */ ref) =>
    git(['ls-tree', '-r', '--name-only', ref, '--', ENGINE_DIR]).split('\n').filter(Boolean);
  const population = new Set([...listed(mergeBase), ...listed('HEAD')]);

  const existsAt = (/** @type {string} */ ref, /** @type {string} */ path) => {
    try {
      git(['cat-file', '-e', `${ref}:${path}`]);
      return true;
    } catch {
      return false;
    }
  };
  const show = (/** @type {string} */ ref, /** @type {string} */ path) =>
    git(['show', `${ref}:${path}`]);

  let specsCompared = 0;
  for (const path of changed) {
    if (!path.endsWith('.spec.ts')) {
      // ── Limb 1 ──
      const how = !existsAt(mergeBase, path)
        ? 'is added'
        : !existsAt('HEAD', path)
          ? 'is deleted'
          : 'differs';
      problems.push(
        `limb 1: ${path} ${how} against the merge base. "${epic}" declares that no non-test engine ` +
          'file changes (FC-1). Reopen the parity argument deliberately, or move the change out.',
      );
      continue;
    }
    // ── Limb 2 ──
    if (!existsAt(mergeBase, path)) continue; // a new spec file is exempt
    if (!existsAt('HEAD', path)) {
      problems.push(`limb 2: ${path} existed at the merge base and is deleted.`);
      continue;
    }
    specsCompared += 1;
    if (normaliseSpec(show(mergeBase, path)) !== normaliseSpec(show('HEAD', path))) {
      problems.push(
        `limb 2: ${path} changes more than its comments. Existing engine specs may change only ` +
          'their comments while "' +
          epic +
          '" is declared; put new cases in a new spec file.',
      );
    }
  }

  // ── Limb 3 — unconditional on the diff ──────────────────────────────────────────────────────────
  let register = '';
  try {
    register = readFileSync(join(root, REGISTER), 'utf8');
  } catch {
    problems.push(`limb 3: ${REGISTER} could not be read, so the declaration cannot be checked.`);
  }
  if (register && openDetailedRow(register, debtRow) === null) {
    problems.push(
      `limb 3: ${DECLARATION} declares "${epic}" active against ${REGISTER} #${debtRow}, and ` +
        `#${debtRow} is not an open detailed row. The declaration has outlived its epic: set ` +
        '"active": false in the commit that closes the row (a stale declaration blocks every push).',
    );
  }

  const summary =
    `checked ${population.size} engine files for "${epic}" (#${debtRow}): ` +
    `${changed.length} changed since ${base}, ${specsCompared} existing spec(s) compared.`;
  return report({ name: NAME, problems, population: population.size, summary });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(runGate({ root: REPO_ROOT, base: process.argv[2] ?? 'origin/main' }));
}
