#!/usr/bin/env node
/**
 * **The advisory allow-list agrees with the code, in both directions** (`docs/TECH_DEBT.md` #235).
 *
 * `scripts/prepush.sh` declares `ADVISORY_GATES` — the gates permitted to exit 2 and be reported as
 * a warning rather than a failure. A list of names beside a set of behaviours drifts the moment
 * either side moves, and it drifts silently: a gate wrongly listed is one whose real failures are
 * downgraded to a warning nobody reads, and a gate wrongly omitted is one whose advisory finding
 * blocks a push it was never meant to block.
 *
 * So this asserts the two sets are equal:
 *
 * - **declared** — parsed out of `prepush.sh`, never restated here. Restating it would create the
 *   second copy this check exists to prevent, which is the mistake `check:claims` avoids by reading
 *   the SQL out of the migration rather than quoting it.
 * - **capable** — the `check:*` scripts that can actually produce exit 2, derived by following each
 *   script's command line to its `.mjs` files and looking for a `report({ advisory })` call.
 *   `report()` in `scripts/lib/doc-register.mjs` is the only thing in this repository that lowers a
 *   blocking exit to 2 (`:225`), so "can exit 2" is decidable statically.
 *
 * What it deliberately does NOT check: that a gate's advisory *judgement* is right. Whether a missed
 * reconciliation pass should warn rather than block is a decision, recorded in `prepush.sh` and in
 * ADR-0120. This only checks that the decision and the code say the same thing.
 */
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

/**
 * Read a repository-relative path, **refusing one that escapes the repository**.
 *
 * The paths below are taken out of `package.json`'s script strings by regex, and the character class
 * that matches them admits `.` — so `scripts/../../etc/foo.mjs` would resolve outside the tree and be
 * read. That is not a privilege boundary (anyone who can edit `package.json` can edit this file), and
 * it is still wrong: a gate should read what it says it reads, and fail closed when it cannot.
 */
const read = (p) => {
  const full = resolve(root, p);
  const rel = relative(resolve(root), full);
  if (rel.startsWith('..')) {
    console.error(
      `check:advisory-agreement: refusing to read ${p} — it resolves outside the repository.`,
    );
    process.exit(1);
  }
  return readFileSync(join(root, p), 'utf8');
};

const prepush = read('scripts/prepush.sh');
const block = /^ADVISORY_GATES=\(([^)]*)\)/m.exec(prepush);
if (!block) {
  console.error(
    'check:advisory-agreement: no ADVISORY_GATES=( … ) array found in scripts/prepush.sh.\n' +
      '    If the advisory mechanism was redesigned, update this check — do not delete it.',
  );
  process.exit(1);
}
const declared = new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));

const scripts = JSON.parse(read('package.json')).scripts ?? {};
const gates = Object.keys(scripts).filter((k) => k.startsWith('check:'));
if (gates.length === 0) {
  console.error(
    'check:advisory-agreement: no check:* scripts found — refusing to pass on nothing.',
  );
  process.exit(1);
}

// **A gate can exit 2 only via `report({ advisory })`.** Following the command line to its files
// keeps this true of a gate that runs two scripts (`check:claims`, `check:doc-register` both do).
//
// **A `*.test.mjs` is excluded, and that is a measurement rather than an assumption.** The first
// version of this check scanned every named file and reported `check:doc-register` as capable —
// because `doc-register.test.mjs` names `advisory` eleven times while TESTING `report()`, capturing
// its return value through a `quiet()` helper rather than exiting on it. Forcing a failure in that
// file and reading the code gives **1**, never 2. So a test runner exercises the mechanism as a
// subject; it does not use it as its own exit path.
//
// That false positive is worth leaving recorded: it is a scan matching something that discusses its
// subject rather than something that is its subject — the exact class `check:counts`' inline-code
// escape and `check:claims`' self-exclusion both exist for, arriving in the check written about it.
const capable = new Set();
for (const gate of gates) {
  const files = [...scripts[gate].matchAll(/(scripts\/[\w./-]+\.mjs)/g)].map((m) => m[1]);
  for (const file of files) {
    if (file.endsWith('.test.mjs')) continue;
    let src;
    try {
      src = read(file);
    } catch {
      console.error(`check:advisory-agreement: ${gate} names ${file}, which does not exist.`);
      process.exit(1);
    }
    if (/advisory:\s*true/.test(src) || /^\s*advisory,\s*$/m.test(src)) capable.add(gate);
  }
}
if (capable.size === 0) {
  console.error(
    'check:advisory-agreement: no gate was found capable of exiting 2, which cannot be right ' +
      'while ADVISORY_GATES has members. The detection is broken, not the estate.',
  );
  process.exit(1);
}

const problems = [];
for (const g of declared) {
  if (!capable.has(g)) {
    problems.push(
      `${g} is in ADVISORY_GATES but nothing in it calls report({ advisory }). Either it never ` +
        'warns — in which case remove it, because listing it downgrades its REAL failures to a ' +
        'warning nobody reads — or the mechanism changed and this check needs updating.',
    );
  }
}
for (const g of capable) {
  if (!declared.has(g)) {
    problems.push(
      `${g} can exit 2 (it calls report({ advisory })) but is not in ADVISORY_GATES, so prepush ` +
        'will report its advisory finding as a blocking FAIL.',
    );
  }
}

if (problems.length > 0) {
  console.error('The advisory allow-list disagrees with the code:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `check:advisory-agreement: OK. ${declared.size} declared advisory gate(s) ` +
    `(${[...declared].join(', ')}), and exactly those can exit 2.`,
);
