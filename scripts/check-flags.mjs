#!/usr/bin/env node
/**
 * **Every feature flag has a recorded enablement date and a retirement batch** (ADR-0084).
 *
 * `apps/web/src/config/env.ts` declares 58 `VITE_` flags and `flagDefaultOff` is called zero
 * times: every one of them is default-**on**, i.e. a rollback contract left behind by the epic that
 * shipped it. That is right on the day a feature flips and wrong a month later, when the flag-off
 * branch has never been run by anybody and its parity suite is asserting that an unused
 * configuration still works.
 *
 * This is the ADR-0058 shape: the part that can be computed becomes a gate rather than a habit.
 * Fourteen flags reached this script with **no enablement date anywhere** — not in the docblock, not
 * in the ADR, not recoverable from git — which is exactly why the date is a machine-read tag now
 * and not prose.
 *
 * Assertions, and 3a/3b are the ones that now do the work (ADR-0088 superseded the schedule):
 *   1. Every flag in `env.ts` is in the register, and vice versa. A flag added without a register
 *      entry fails here rather than aging invisibly.
 *   2. Every flag carries an `@enabled YYYY-MM-DD` docblock tag matching its register entry — so
 *      the date is readable where the flag is, and cannot drift from the register.
 *   3. No batch is overdue. A flag past `horizonDays` is fine while its batch date is in the
 *      future; the failure a developer meets is a **batch date passing with the batch not done**,
 *      which is a schedule rather than a cliff (ADR-0084 D3).
 *   4. A flag that a Playwright config PINS is not retired. This one was written after CI caught
 *      the omission it exists to prevent: `VITE_TSLD_EDITING` and `VITE_PLAN_EDIT_LOCK` were retired
 *      in batch 1, and `playwright.config.ts` pins both OFF for the whole base journey — "the
 *      read-only TSLD surface and the role-only (no-pen) editing journeys stay covered", in its own
 *      words. Six editing specs then clicked controls the now-unconditional pen shades, and timed
 *      out. ADR-0084 D5 said a retirement deletes the flag-off PARITY SUITE; it did not say that a
 *      whole Playwright config can BE one, which is a distinction only a red run made visible.
 *   5. A derived flag never retires BEFORE its parent (D4, as corrected — this script caught the
 *      rule stated the other way round on its first run). Retiring a child while its parent
 *      survives is the contradiction: the child's retirement says the feature is now permanent,
 *      and the surviving parent can still switch it off. The other order is harmless — a retired
 *      parent simply drops its conjunct, and nobody can turn off what no longer exists.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV = join(ROOT, 'apps/web/src/config/env.ts');
const REGISTER = join(ROOT, 'scripts/flag-retirement.json');

const register = JSON.parse(readFileSync(REGISTER, 'utf8'));
const source = readFileSync(ENV, 'utf8');
const problems = [];

/** Today as a local calendar day, so a comparison against a `due` string is a plain string compare. */
const today = new Date().toISOString().slice(0, 10);

// Each declaration with its preceding docblock, so `@enabled` is read from the right one.
const blocks = source.split(/\n(?=\/\*\*)/);
const declared = new Map();
for (const block of blocks) {
  const constant = /export const ([A-Z0-9_]+_ENABLED)/.exec(block);
  const flag = /import\.meta\.env\.(VITE_[A-Z0-9_]+)/.exec(block);
  if (!constant || !flag) continue;
  declared.set(flag[1], {
    constant: constant[1],
    enabled: /@enabled (\d{4}-\d{2}-\d{2})/.exec(block)?.[1] ?? null,
  });
}

for (const flag of declared.keys()) {
  if (!register.flags[flag])
    problems.push(`${flag} is declared in env.ts but absent from the register`);
}
for (const flag of Object.keys(register.flags)) {
  if (!declared.has(flag)) {
    // Retired flags leave the register too — the `retired` list is the record, so a stale entry
    // here means a retirement that removed the code and forgot the schedule.
    problems.push(
      `${flag} is in the register but no longer declared in env.ts — move it to "retired"`,
    );
  }
}

for (const [flag, entry] of Object.entries(register.flags)) {
  const found = declared.get(flag);
  if (!found) continue;
  if (found.enabled === null) {
    problems.push(
      `${flag} has no \`@enabled YYYY-MM-DD\` tag in its docblock (register says ${entry.enabled})`,
    );
  } else if (found.enabled !== entry.enabled) {
    problems.push(
      `${flag}: docblock says @enabled ${found.enabled}, register says ${entry.enabled}`,
    );
  }
  if (found.constant !== entry.constant) {
    problems.push(`${flag}: register names ${entry.constant}, env.ts exports ${found.constant}`);
  }
  if (entry.keep === undefined && !register.batches[entry.batch]) {
    problems.push(`${flag}: unknown batch "${entry.batch}"`);
  }
}

// 3 — overdue batches. SUPERSEDED by ADR-0088 D2: age is not the risk, branch shape is, and every
// Class B flag now carries `keep`, so this loop finds nothing by construction. It is left in place
// rather than deleted because a flag can still be batched deliberately (a Class A retirement in
// flight), and on that day the date should still be honoured.
for (const [batch, { due }] of Object.entries(register.batches)) {
  const flags = Object.entries(register.flags)
    .filter(([, entry]) => entry.batch === batch && entry.keep === undefined)
    .map(([flag]) => flag);
  if (flags.length > 0 && due < today) {
    problems.push(
      `${batch} was due ${due} and still holds ${flags.length} flags: ${flags.join(', ')}`,
    );
  }
}

// 3a — the classification is TOTAL, and Class A is capped at the measured count (ADR-0088 D2/D3).
//
// Total because an unclassified residue is a queue rather than a decision — the reason ADR-0073 C3.4
// deleted `PENDING_COVERAGE`. Every flag carries `class: 'A' | 'B'`, the two partition the register,
// and every Class B carries the `keep` reason ADR-0084 D6 built and never used.
//
// The cap is the MEASURED Class A count and ratchets DOWN after each retirement. It is not an
// aspirational number: ADR-0088's own drafts proposed three and then two, both chosen before the
// detector existed and both BELOW the real five, so either would have failed on day one — which is
// how a gate gets deleted rather than fixed (ADR-0058).
for (const [flag, entry] of Object.entries(register.flags)) {
  if (entry.class !== 'A' && entry.class !== 'B') {
    problems.push(`${flag} has no class — every flag is A (alternative surface) or B (guard).`);
  }
  if (entry.class === 'A' && register.classA?.[flag] === undefined) {
    problems.push(`${flag} is class A but carries no reason in the register's classA map.`);
  }
  if (entry.class === 'B' && entry.keep === undefined) {
    problems.push(`${flag} is class B but has no \`keep\` reason (ADR-0084 D6, ADR-0088 D4).`);
  }
}
const classAcount = Object.values(register.flags).filter((e) => e.class === 'A').length;
if (classAcount > register.classACap) {
  problems.push(
    `${classAcount} alternative surfaces against a cap of ${register.classACap}. Retire one, or ` +
      `raise the cap in an ADR with the reason — an alternative surface is a second implementation ` +
      `of one screen, and drift between two of them is what ADR-0080 shipped.`,
  );
}

// 3b — the tripwire: anything the detector finds must already be classified A (ADR-0088 D2).
//
// `detected ⊆ classA`, and NEVER the converse. The detector can only under-detect — a flag branching
// by early return, by `const Body = FLAG ? X : Y`, or through an indirection is invisible to it — so
// a curated Class A flag it cannot see is legitimate, and asserting the converse would fail it.
// This is `check:claims`'s shape (ADR-0076): a curated register, and a script that fails loud on
// anything unregistered.
//
// **The weak clause, labelled as one** (ADR-0076 §19.10): this catches a Class B flag that GROWS an
// alternative surface. It cannot catch someone classifying a genuine Class A flag as B — that needs
// a written false statement in a reviewed file rather than an oversight, and no gate closes it.
const { detectAlternativeSurfaces } = await import('./detect-alternative-surfaces.mjs');
for (const [flag, sites] of detectAlternativeSurfaces()) {
  if (register.flags[flag]?.class === 'A') continue;
  const where = sites.map((s) => `${s.file}:${s.line} <${s.left}> vs <${s.right}>`).join('; ');
  problems.push(
    `${flag} selects between two components but is not class A: ${where}. Classify it — it is a ` +
      `second implementation of one surface, which is what the cap exists to bound.`,
  );
}

// 4 — a Playwright config pinning a flag OFF is a flag-off harness, so the flag is not retirable.
// Read from the config's `env:` block rather than from a list, so a NEW pin is covered the day it
// is written and nobody has to remember this rule exists.
//
// **`'false'` and `'true'` are different facts, and this matched them identically until ADR-0088.**
// Every flag is default-on, so a `'true'` pin asserts nothing — it re-states the default. There are
// 135 of them across 39 flags, against 10 flags with a real `'false'` harness, and 31 flags whose
// ONLY pins are no-op `'true'`s. Conflated, the gate blocked a retirement on the cheapest possible
// cause: verified red before this fix, marking a `'true'`-only flag retired produced three
// "that config IS a flag-off harness" failures, which is the opposite of what a `'true'` pin is.
// ADR-0084 D4a's `weight = files + 3 × pins` inherited the same error and inverted the cost.
//
// Both still stop a retirement — a config referencing a flag that no longer exists is dead config —
// but the remedy differs by an order of magnitude, so the message has to say which one you are
// looking at: a `'false'` pin is a spec conversion, a `'true'` pin is a line deletion.
const WEB = join(ROOT, 'apps/web');
const retired = new Set(register.retired.map((r) => r.flag));
for (const file of readdirSync(WEB).filter((n) => /^playwright.*\.config\.ts$/.test(n))) {
  const config = readFileSync(join(WEB, file), 'utf8');
  for (const [, flag, value] of config.matchAll(/(VITE_[A-Z0-9_]+)\s*:\s*'(true|false)'/g)) {
    if (!retired.has(flag)) continue;
    problems.push(
      value === 'false'
        ? `${flag} is retired, but apps/web/${file} pins it OFF — that config IS a flag-off harness, and its specs are written against the pinned world. Convert them first, or put the flag back.`
        : `${flag} is retired, but apps/web/${file} still pins it 'true' — a no-op re-stating the default, so this is dead config rather than a harness. Delete the line in the retirement commit (ADR-0084 D5).`,
    );
  }
}

// 5 — a child may not retire before its parent.
const byConstant = new Map(
  Object.entries(register.flags).map(([flag, e]) => [e.constant, { flag, ...e }]),
);
for (const [flag, entry] of Object.entries(register.flags)) {
  if (!entry.derivedFrom) continue;
  const parent = byConstant.get(entry.derivedFrom);
  if (!parent) {
    problems.push(`${flag} is derived from ${entry.derivedFrom}, which is not a registered flag`);
    continue;
  }
  const parentDue = register.batches[parent.batch]?.due ?? '2100-01-01';
  const childDue = register.batches[entry.batch]?.due ?? '2100-01-01';
  if (childDue < parentDue) {
    problems.push(
      `${flag} (${entry.batch}, due ${childDue}) retires BEFORE its parent ${parent.flag} (${parent.batch}, due ${parentDue}) — the child would be declared permanent while the parent can still switch it off`,
    );
  }
}

if (problems.length > 0) {
  console.error('Feature-flag retirement register is out of date:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    '\nSee docs/adr/0088-flag-classification.md, which supersedes the ADR-0084 schedule. Fix the register or the flag, not this script.',
  );
  process.exit(1);
}

const live = Object.keys(register.flags).length;
const kept = Object.values(register.flags).filter((e) => e.keep !== undefined).length;
console.log(
  `Feature flags OK — ${live} live (${kept} kept by written reason, ${register.retired.length} retired), every one dated and batched.`,
);
