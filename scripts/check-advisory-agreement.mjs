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
const block = /^ADVISORY_GATES=\(([\s\S]*?)\)\s*$/m.exec(prepush);
if (!block) {
  console.error(
    'check:advisory-agreement: no ADVISORY_GATES=( … ) array found in scripts/prepush.sh.\n' +
      '    If the advisory mechanism was redesigned, update this check — do not delete it.',
  );
  process.exit(1);
}
// **Comments are stripped and BOTH quote styles are accepted.** The first version matched
// double-quoted entries only, so rewriting the array with single quotes — a cosmetic edit that
// changes nothing in bash — produced an EMPTY declared set and the gate then accused
// `check:reconcile-due` of being unlisted. It also ended the array at the first `)`, so a `)` inside
// an in-array comment truncated the capture and silently dropped every gate named on a later line.
// Both reproduced by the ADR-0124 devops review; both are the shape this gate exists to catch.
const arrayBody = block[1].replace(/#[^\n]*/g, '');
const declared = new Set([...arrayBody.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]));
if (declared.size === 0) {
  console.error(
    'check:advisory-agreement: ADVISORY_GATES parsed to an EMPTY list.\n' +
      '    An empty list is indistinguishable from a parse failure, and every assertion below is\n' +
      '    over a list. If no gate is advisory any more, delete this check and the mechanism with it.',
  );
  process.exit(1);
}

const SELF = 'scripts/check-advisory-agreement.mjs';
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
// because `doc-register.test.mjs` names `advisory` five times while TESTING `report()`, capturing
// its return value through a `quiet()` helper rather than exiting on it. Forcing a failure in that
// file and reading the code gives **1**, never 2. So a test runner exercises the mechanism as a
// subject; it does not use it as its own exit path.
//
// That false positive is worth leaving recorded: it is a scan matching something that discusses its
// subject rather than something that is its subject — the exact class `check:counts`' inline-code
// escape and `check:claims`' self-exclusion both exist for, arriving in the check written about it.
const capable = new Map();
for (const gate of gates) {
  const files = [...scripts[gate].matchAll(/(scripts\/[\w./-]+\.mjs)/g)].map((m) => m[1]);
  for (const file of files) {
    // **This file excludes itself, for the reason `check-claims.mjs` does.** Its comments and its
    // failure messages necessarily quote the shapes it searches for — `report({ advisory })` is in
    // the sentence it prints when it finds one — so scanning itself makes it report itself as an
    // advisory gate. It did, on the first run after the detection was widened. A gate that reads its
    // own documentation as input is a gate nobody can write about.
    if (file === SELF) continue;
    let src;
    try {
      src = read(file);
    } catch {
      console.error(`check:advisory-agreement: ${gate} names ${file}, which does not exist.`);
      process.exit(1);
    }
    // **Two ways a gate can exit 2, not one.** The `advisory` flag is the declared way. The other
    // is `report()`'s warnings path, which hard-codes a 2 REGARDLESS of `advisory` — so a gate that
    // never writes the word can still exit 2 by pushing a warning. The first version of this check
    // matched only the flag and its docblock asserted that "can exit 2" was decidable from it,
    // which was **false**: the ADR-0124 devops review demonstrated a passing `OK` over a gate that
    // exits 2 at runtime. That claim is corrected on `report()` and the detection now covers both.
    // **A file is a gate ENTRY POINT if `report()`'s value reaches the process exit — a
    // behavioural test, not a name.** The first version excluded `*.test.mjs` by suffix, justified
    // only by the two files where that happens to be harmless. The ADR-0124 test-engineer review
    // broke it by construction: a `.test.mjs` file that genuinely calls
    // `process.exit(report({ advisory: true, … }))`, wired into `package.json` as a real gate,
    // exits 2 and was invisible here — and this repository already runs two gates whose entry point
    // IS a `.test.mjs` (`check:doc-register`, `check:claims`), so the shape is not hypothetical.
    //
    // `doc-register.test.mjs` calls `report()` many times and has no `process.exit(` at all (it
    // sets `process.exitCode`), so it is excluded for what it does rather than what it is called.
    const routesReportToExit = /process\.exit\(/.test(src) && /\breport\s*\(/.test(src);
    if (!routesReportToExit) continue;
    const declaresAdvisory = /advisory:\s*true/.test(src) || /(^|[\s{,])advisory\s*[,}]/m.test(src);
    const pushesWarnings = /\bwarnings\.push\s*\(/.test(src);
    if (declaresAdvisory || pushesWarnings) {
      // The message names WHICH of the two routes was found: they have different remedies.
      capable.set(gate, declaresAdvisory ? 'report({ advisory })' : "report()'s warnings path");
    }
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
for (const [g, via] of capable) {
  if (!declared.has(g)) {
    problems.push(
      `${g} can exit 2 (via ${via}) but is not in ADVISORY_GATES, so prepush will report its ` +
        'advisory finding as a blocking FAIL. If it should block, remove the advisory route ' +
        'instead of listing it — listing it downgrades its real findings too.',
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
