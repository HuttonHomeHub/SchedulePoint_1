#!/usr/bin/env node
/**
 * **Every feature flag has a recorded enablement date and a retirement batch** (ADR-0084).
 *
 * `apps/web/src/config/env.ts` declares 56 `VITE_` flags and `flagDefaultOff` is called zero
 * times: every one of them is default-**on**, i.e. a rollback contract left behind by the epic that
 * shipped it. (This said 58 until 2026-08-10 — a wrong count in the docblock of the gate that
 * enforces counts, which is the ADR-0076 Class 1 shape. The live figure is printed on success and
 * derived from the register, so only this sentence could rot.) That is right on the day a feature flips and wrong a month later, when the flag-off
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
 *   4a. A **retired** flag leaves no declaration behind, in `env.ts` or `vite-env.d.ts`. Matches
 *      declaration forms only and word-bounded, because a naive scan fires on correct history notes
 *      and on live prefix siblings — see the assertion for both named fixtures.
 *   4b. **Every derivation edge in `env.ts` is recorded, and no recorded edge is imaginary.**
 *      `derivedFrom` was hand-maintained, so assertion 5 was enforcing on 3 of the 9 edges that
 *      exist — and the 6 it could not see included a real ordering inversion, found the moment this
 *      landed.
 *
 *   **The retirement checklist** — what a retirement must clear, learnt one file class at a time
 *   because each was found by somebody grepping after the fact: `env.ts`, `vite-env.d.ts`,
 *   `.env.example`, `apps/web/playwright*.config.ts`, this register, `CLAUDE.md`'s banner +
 *   `README.md`'s counts, and **`.github/workflows/ci.yml` — both the step comment blocks and the
 *   report-upload paths**. Assertions 4/4a cover the first two mechanically; the rest are prose.
 *
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
if (classAcount !== register.classACap) {
  problems.push(
    `${classAcount} alternative surfaces against a cap of ${register.classACap}. Retire one, raise ` +
      `the cap in an ADR with the reason, or ratchet it down — a cap ABOVE the measured count is ` +
      `stale, and silently hands the estate headroom it never earned. An alternative surface is a ` +
      `second implementation of one screen, and drift between two of them is what ADR-0080 shipped.`,
  );
}

// A retired flag has no business in `classA`. The converse is already checked above (a class-A flag
// must carry a reason); nothing checked this direction, so a retirement that removed the flag and
// left its reason behind was green. M1 and M2 each delete one, so this fires the day it is needed.
for (const flag of Object.keys(register.classA ?? {})) {
  if (register.retired.some((r) => r.flag === flag)) {
    problems.push(`${flag} is retired but still carries a classA reason — delete the entry.`);
  }
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

// 4a — a RETIRED flag leaves no declaration behind.
//
// Retirement removes the code; nothing checked that it removed the *declarations*, and three file
// classes were carrying residue when this was written. `VITE_NAV_TREE_CRUD` retired 2026-08-09 and
// `vite-env.d.ts` still typed it — with an operator-facing sentence promising a rollback that no
// longer existed. The previous retirement's `ci.yml` report-upload path outlived its suite by a day.
// Each was found by somebody grepping; the one before it was not found at all.
//
// **Two negative fixtures, because a naive scan here is worse than no scan:**
//
//  - A PROSE MENTION IS NOT A DECLARATION. `env.ts` carries a correct, load-bearing history note
//    naming the retired `VITE_CANVAS_TOOLBAR`, and `.env.example` carries a deliberate tombstone.
//    A text scan fires on both, and the obvious remedy is to delete accurate history. So this
//    matches DECLARATION FORMS only. (This is the sibling of assertion 4b's anchoring guard, in the
//    same milestone — the same mistake, one file along.)
//  - PREFIXES COLLIDE. `VITE_NAV_TREE`/`VITE_NAV_TREE_CRUD` and
//    `VITE_CANVAS_AUTHORING`/`VITE_CANVAS_AUTHORING_FLOW` are live pairs. A substring test reports a
//    LIVE flag as residue the day its prefix-sibling retires, so the match is word-bounded.
const VITE_ENV_D_TS = join(WEB, 'src/vite-env.d.ts');
for (const { flag } of register.retired) {
  const declarations = [
    [ENV, source, new RegExp(`import\\.meta\\.env\\.${flag}\\b`)],
    [
      VITE_ENV_D_TS,
      readFileSync(VITE_ENV_D_TS, 'utf8'),
      new RegExp(`readonly\\s+${flag}\\b\\s*\\??:`),
    ],
  ];
  for (const [path, source, pattern] of declarations) {
    if (pattern.test(source)) {
      problems.push(
        `${flag} is retired but still DECLARED in ${path.replace(`${ROOT}/`, '')} — the code went ` +
          `and the declaration stayed. (A prose mention is fine and deliberate; this matches ` +
          `declaration forms only.)`,
      );
    }
  }
}

// 4b — EVERY derivation edge in env.ts is recorded, and nothing is recorded that env.ts does not have.
//
// Assertion 5 below stops a derived child retiring before its parent. It read `derivedFrom`, which is
// hand-maintained with nothing asserting completeness — so it was enforcing on 3 of the 9 edges
// `env.ts` actually contains, i.e. passing on a third of its subject. This derives the truth.
//
// **Four guards, each a blocking review finding rather than defensive coding:**
//
//  1. `&&` IS COMMUTATIVE. `env.ts` writes the parent on the left 6 times and on the right 3 times,
//     and those three are EXACTLY the three the register already recorded correctly. A parser
//     assuming one order reports the only correct entries as stale, and the obvious remedy deletes
//     them — a gate that destroys working coverage on its first run. So the parent is whichever
//     operand is a known `*_ENABLED` constant; the self-flag is the `flagDefault*` operand.
//  2. A DOCBLOCK IS NOT AN INITIALISER. `env.ts` contains the sentence "**Not derived.** Unlike
//     {@link CANVAS_MULTI_SELECT_ENABLED}…" — a block-scoped scan yields an edge from prose DENYING
//     one. `detect-alternative-surfaces.mjs` records three prior versions of this same anchoring
//     failure; this would have been the fourth. Anchored strictly between `=` and `;`.
//  3. SILENT UNDER-MATCH IS THE FAILURE MODE. A scan matching 2 of 56 looks identical to a green
//     build (ADR-0088 D2's lesson). So the declaration count must agree with the `export const`
//     count, and any initialiser holding `&&`/`||`/`?` that cannot be FULLY decomposed fails loud
//     rather than being skipped.
//  4. A FLAG CAN HAVE TWO PARENTS. `CANVAS_AUTHORING` had two until 2026-08-10, so `derivedFrom`
//     accepts a string or an array; a single-string assumption would fail with no representable fix
//     the day a second conjunct returns — which is how a gate gets deleted rather than fixed.
const DECL = /export const ([A-Z0-9_]+_ENABLED)\s*=\s*([^;]*);/g;
const SELF = /^flagDefault(?:On|Off)\(\s*import\.meta\.env\.(VITE_[A-Z0-9_]+)\s*,?\s*\)$/;

function derivationEdges(source) {
  const declared = (source.match(/export const [A-Z0-9_]+_ENABLED\s*=/g) ?? []).length;
  const parsed = [...source.matchAll(DECL)];
  const edges = new Map();
  const failures = [];

  if (parsed.length !== declared) {
    failures.push(
      `parsed ${parsed.length} flag declarations but env.ts has ${declared} — the parser is ` +
        `under-matching, which looks identical to a green build. Fix the parser, not this count.`,
    );
  }

  for (const [, constant, rawInit] of parsed) {
    const init = rawInit.replace(/\s+/g, ' ').trim();
    const operands = init.split('&&').map((o) => o.trim());
    const parents = [];
    let selves = 0;
    let undecomposable = operands.length === 0;

    for (const operand of operands) {
      if (/^[A-Z0-9_]+_ENABLED$/.test(operand))
        parents.push(operand); // guard 1: either side
      else if (SELF.test(operand)) selves += 1;
      else undecomposable = true;
    }

    if (undecomposable || selves !== 1) {
      failures.push(
        `${constant}'s initialiser could not be fully decomposed: \`${init}\`. A parser that ` +
          `skips what it cannot read is the silent under-match this assertion exists to prevent.`,
      );
      continue;
    }
    if (parents.length > 0) edges.set(constant, parents);
  }
  return { edges, failures };
}

const { edges: actualEdges, failures: parseFailures } = derivationEdges(source);
problems.push(...parseFailures);

/** `derivedFrom` as an array, whichever form the register uses (guard 4). */
const parentsOf = (entry) =>
  entry.derivedFrom === undefined
    ? []
    : Array.isArray(entry.derivedFrom)
      ? entry.derivedFrom
      : [entry.derivedFrom];

const byConstantName = new Map(
  Object.entries(register.flags).map(([flag, e]) => [e.constant, flag]),
);
for (const [constant, parents] of actualEdges) {
  const flag = byConstantName.get(constant);
  if (!flag) continue; // assertion 1 already reports a declaration missing from the register
  const recorded = parentsOf(register.flags[flag]);
  const missing = parents.filter((p) => !recorded.includes(p));
  if (missing.length > 0) {
    problems.push(
      `${flag} is derived from ${missing.join(' and ')} in env.ts, but the register does not record ` +
        `that — assertion 5 cannot protect an edge it cannot see.`,
    );
  }
}
for (const [flag, entry] of Object.entries(register.flags)) {
  const recorded = parentsOf(entry);
  if (recorded.length === 0) continue;
  const actual = actualEdges.get(entry.constant) ?? [];
  const phantom = recorded.filter((p) => !actual.includes(p));
  if (phantom.length > 0) {
    problems.push(
      `${flag}'s register entry claims derivation from ${phantom.join(' and ')}, which env.ts does ` +
        `not contain — a stale edge outlives the code that justified it.`,
    );
  }
}

// 5 — a child may not retire before its parent.
const byConstant = new Map(
  Object.entries(register.flags).map(([flag, e]) => [e.constant, { flag, ...e }]),
);
for (const [flag, entry] of Object.entries(register.flags)) {
  for (const derivedFrom of parentsOf(entry)) {
    const parent = byConstant.get(derivedFrom);
    if (!parent) {
      problems.push(`${flag} is derived from ${derivedFrom}, which is not a registered flag`);
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
