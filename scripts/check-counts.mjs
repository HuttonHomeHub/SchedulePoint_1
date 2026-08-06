#!/usr/bin/env node
/**
 * Re-derives the six figures in `CLAUDE.md`'s stage banner and fails if the prose disagrees
 * (ADR-0076).
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

const banner = read('CLAUDE.md');
// The banner sentence, read as claims rather than as a paragraph. Each entry is the number the
// prose states and the label it states it under.
const claimed = {
  'API modules': /(\d+) API modules/,
  'Prisma models': /(\d+) Prisma models/,
  migrations: /across (\d+) migrations/,
  'web source files': /(\d+) web\s*>?\s*source files/,
  'flag-scoped Playwright suites': /(\d+) flag-scoped Playwright suites/,
  ADRs: /(\d+) ADRs/,
};

const problems = [];
for (const [label, pattern] of Object.entries(claimed)) {
  const match = banner.match(pattern);
  if (!match) {
    problems.push(`${label}: the banner no longer states this figure (pattern ${pattern} found nothing).
    If the sentence was reworded, update this script — do not delete the claim.`);
    continue;
  }
  const stated = Number(match[1]);
  if (stated !== actual[label]) {
    problems.push(`${label}: CLAUDE.md says ${stated}, the repository has ${actual[label]}`);
  }
}

if (problems.length > 0) {
  console.error('CLAUDE.md stage banner is out of date:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '\nFix the banner, not this script — the numbers above were re-derived from the tree just now.',
  );
  process.exit(1);
}

console.log(
  `CLAUDE.md stage banner OK (${Object.entries(actual)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')}).`,
);
