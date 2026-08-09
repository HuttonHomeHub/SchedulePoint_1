#!/usr/bin/env node
/**
 * Re-derives the counts stated in `CLAUDE.md`'s stage banner **and in the front-door `README.md`**,
 * and fails if either disagrees with the tree (ADR-0076).
 *
 * **Why this is a script and not a habit.** The banner has drifted at every reconciliation pass,
 * and the last time it was corrected the replacement text told the reader to re-run `ls | wc -l`
 * if the recount date was not today's — advice that is both correct and useless, because a reader
 * who trusts the number never checks the date and a reader who checks the date has already been
 * misled once. It was wrong again one day later. ADR-0058's rule is that what can be computed
 * should be, and a count is the most computable claim in the repository.
 *
 * Deliberately narrow: it checks **counts**, not prose. "Substantially built" is a judgement and
 * stays a judgement. What this forbids is a number that nobody re-derived.
 *
 * **`README.md` was added on 2026-08-09**, at a reconciliation pass that found the same figures
 * duplicated in FOUR documents with only this one gated — and the front door, which is the first
 * thing any reader meets, five days stale and **twelve ADRs out** (73 against 85). Gating the
 * banner and leaving three ungated copies is not drift control; it is drift control aimed at one
 * of four targets. Two of the copies (`apps/web/README.md`, `docs/FRONTEND_ARCHITECTURE.md`) were
 * DELETED rather than gated, because an internal document restating a number it does not own has
 * no reason to hold it at all. The front door keeps its numbers and gets the gate, because the
 * status paragraph is what it is for.
 *
 * A document may state a subset — `README.md` does not mention web source files — so a figure a
 * document does not claim is skipped rather than demanded. What is forbidden is stating one and
 * being wrong.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const dirs = (p) =>
  readdirSync(join(root, p)).filter((n) => statSync(join(root, p, n)).isDirectory());

/** Every `.ts`/`.tsx` under a directory, recursively. Matches how the banner's figure was derived. */
function countSourceFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (entry.isDirectory()) total += countSourceFiles(join(dir, entry.name));
    else if (/\.tsx?$/.test(entry.name)) total += 1;
  }
  return total;
}

const actual = {
  'API modules': dirs('apps/api/src/modules').length,
  'Prisma models': (read('apps/api/prisma/schema.prisma').match(/^model /gm) ?? []).length,
  migrations: dirs('apps/api/prisma/migrations').length,
  'web source files': countSourceFiles('apps/web/src'),
  'flag-scoped Playwright suites': readdirSync(join(root, 'apps/web')).filter((n) =>
    n.startsWith('e2e-'),
  ).length,
  ADRs: readdirSync(join(root, 'docs/adr')).filter((n) => /^\d{4}-.*\.md$/.test(n)).length,
};

/**
 * A phrase, made tolerant of markdown line-wrapping: every space becomes "whitespace, optionally a
 * blockquote marker, whitespace".
 *
 * **This is why the front door's stale suite count slipped through on the first run of the widened
 * gate.** `README.md` wraps as `23 flag-scoped\n> Playwright suites`, and a pattern with a literal
 * space cannot see it. The `web source files` pattern already carried a hand-written `\s*>?\s*` —
 * so somebody hit this exact problem once, patched the one pattern in front of them, and left the
 * other five to be discovered by a wrong number surviving a green check. Doing it for all six by
 * construction is the difference between a fix and a fixed instance.
 */
const phrase = (text) => new RegExp(text.replace(/ /g, '\\s*>?\\s*'));

/**
 * Each entry is a figure and **every wording the prose uses for it**.
 *
 * Aliases exist because the same number is written differently in different places — the stage
 * banner says "22 API modules" and both `CLAUDE.md`'s repository-layout tree and
 * `docs/ARCHITECTURE.md` say "22 feature modules under `src/modules/`". A gate that knew only the
 * banner's phrasing reported OK while the architecture document said 20, which is how that file
 * drifted and no other did (found 2026-08-09, by reading it rather than by this script).
 */
const claimed = {
  'API modules': [phrase('(\\d+) API modules'), phrase('(\\d+) feature modules')],
  'Prisma models': [phrase('(\\d+) Prisma models')],
  migrations: [phrase('across (\\d+) migrations'), phrase('\\+ (\\d+) migrations')],
  'web source files': [phrase('(\\d+) web source files')],
  'flag-scoped Playwright suites': [phrase('(\\d+) flag-scoped Playwright suites')],
  ADRs: [phrase('(\\d+) ADRs')],
};

/**
 * Which figures each document must state. `required` is the load-bearing part: CLAUDE.md's banner
 * is the canonical six and a MISSING one there means the sentence was reworded and this script
 * needs updating — never that the claim may quietly go. The front door states a subset by design,
 * so an absent figure there is simply not claimed.
 */
const documents = [
  { path: 'CLAUDE.md', label: 'CLAUDE.md', required: true },
  { path: 'README.md', label: "README.md's status paragraph", required: false },
  { path: 'docs/ARCHITECTURE.md', label: 'docs/ARCHITECTURE.md', required: false },
];

const problems = [];
for (const { path, label: where, required } of documents) {
  const text = read(path);
  for (const [label, patterns] of Object.entries(claimed)) {
    // **Every occurrence, not the first.** A document states a figure more than once — CLAUDE.md
    // carries the module count in its stage banner AND in its repository-layout tree — and checking
    // only the first match leaves the second free to rot while the gate reports OK. That is the
    // shape of failure this whole script exists to remove, so it must not have it internally.
    let found = false;
    for (const pattern of patterns) {
      for (const match of text.matchAll(new RegExp(pattern.source, 'g'))) {
        found = true;
        const stated = Number(match[1]);
        if (stated !== actual[label]) {
          problems.push(`${where} — ${label}: says ${stated}, the repository has ${actual[label]}`);
        }
      }
    }
    if (!found && required) {
      problems.push(`${where} — ${label}: no longer states this figure (patterns ${patterns.join(', ')} found nothing).
    If the sentence was reworded, update this script — do not delete the claim.`);
    }
  }
}

if (problems.length > 0) {
  console.error('A stated count disagrees with the tree:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '\nFix the banner, not this script — the numbers above were re-derived from the tree just now.',
  );
  process.exit(1);
}

console.log(
  `Stated counts OK in ${documents.map((d) => d.path).join(', ')} (${Object.entries(actual)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')}).`,
);
