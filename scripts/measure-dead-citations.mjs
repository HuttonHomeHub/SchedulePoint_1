#!/usr/bin/env node
/**
 * **Which backticked identifiers in comments resolve to nothing in the tree?**
 * (`docs/TECH_DEBT.md` #277.) Run by hand — `node scripts/measure-dead-citations.mjs` —
 * never from CI and never from `prepush.sh`, whose gate list is derived from the `check:*`
 * prefix precisely so a measurement cannot be mistaken for a gate.
 *
 * #277 found ten citations of `autoLabelsFit`, a symbol ADR-0109 D1 deleted, which `#193`'s sweep
 * could not have found: that sweep grepped for the names it remembered deleting, and nobody
 * remembered this one existed. **A grep for remembered names is bounded by memory; the tree is
 * not.** This is the instrument that is not — it resolves every backticked identifier in a comment
 * against the identifiers the code actually contains.
 *
 * **It is deliberately not a gate, and the measurement is the reason** (2026-09-11). The naive
 * predicate reports **731 citations across 306 names**; widening the corpus to the API and the
 * packages and requiring a camelCase/PascalCase shape gets it to 245/117, and keeping string
 * contents in the corpus (so a discriminant like `'lagAnchor'` resolves) to **179 citations across
 * 93 names**. A spot-check of ~20 of those found **three** genuine stale citations. A gate firing
 * 179 times to surface three is ADR-0058's fails-on-day-one shape — it gets silenced rather than
 * fixed.
 *
 * **What it cannot see, stated plainly** (ADR-0081's rule for a measurement harness):
 *
 * - **It cannot tell a defect from its own remedy.** A comment reading "`X` was deleted at
 *   ADR-0109 D1" is correct prose and reports identically to one asserting `X` is live. Proved:
 *   correcting `legendContent` here left the corrected file reporting at the same rank, because the
 *   correction names the dead field in order to say it is gone.
 * - **Every external vocabulary reads as undefined** — platform APIs (`sendBeacon`,
 *   `OffscreenCanvas`), library internals cited under ADR-0076 Class 2, tsconfig keys, Prisma model
 *   names (they live in `schema.prisma`, not in a `.ts`), MSPDI/XER element names, ARIA roles and
 *   `KeyboardEvent.key` values. These are the bulk of the noise and cannot be enumerated cheaply.
 * - **The comment/string split is a scanner, not a parser.** It is adequate for this question and
 *   would not be for anything that had to be exactly right.
 *
 * So: run it during a reconciliation pass (`docs/RECONCILE.md`), read the list with judgement, and
 * expect most of it to be legitimate.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const roots = process.argv.slice(2);
const scanned = roots.length > 0 ? roots : ['apps/web/src', 'apps/api/src', 'packages'];

const files = execSync(`git ls-files ${scanned.map((r) => `'${r}'`).join(' ')}`, {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter((f) => /\.(ts|tsx)$/.test(f));

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** camelCase or PascalCase with an internal capital — the shape a symbol has and prose does not. */
const CAMEL = /^(?:[a-z][A-Za-z0-9]*[A-Z]|[A-Z][a-z][A-Za-z0-9]*[A-Z])[A-Za-z0-9]*$/;
const MIN_LENGTH = 5;

/**
 * Split a source file into its code and its comments. String CONTENTS stay in the code, so a
 * discriminant that exists only as `'lagAnchor'` in a union resolves rather than reporting.
 */
function split(src) {
  let code = '';
  const comments = [];
  let i = 0;
  let inString = null;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (inString) {
      if (c === '\\') {
        code += '  ';
        i += 2;
        continue;
      }
      if (c === inString) inString = null;
      code += c;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      code += ' ';
      i++;
      continue;
    }
    if (c === '/' && next === '/') {
      let end = src.indexOf('\n', i);
      if (end === -1) end = src.length;
      comments.push([i, src.slice(i, end)]);
      code += ' '.repeat(end - i);
      i = end;
      continue;
    }
    if (c === '/' && next === '*') {
      let end = src.indexOf('*/', i + 2);
      end = end === -1 ? src.length : end + 2;
      comments.push([i, src.slice(i, end)]);
      code += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
      continue;
    }
    code += c;
    i++;
  }
  return { code, comments };
}

const defined = new Set();
const parsed = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const { code, comments } = split(src);
  for (const m of code.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) defined.add(m[0]);
  parsed.push({ file, src, comments });
}
// A tracked file's own basename is a definition: `` `toolbar-ladder` `` cites a file, not a symbol.
for (const path of execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n')) {
  defined.add((path.split('/').pop() ?? '').replace(/\.[^.]+$/, ''));
}

const findings = new Map();
for (const { file, src, comments } of parsed) {
  for (const [offset, block] of comments) {
    for (const m of block.matchAll(/`([^`\n]+)`/g)) {
      const token = m[1].trim();
      if (!IDENT.test(token) || token.length < MIN_LENGTH || !CAMEL.test(token)) continue;
      if (defined.has(token)) continue;
      const line = src.slice(0, offset).split('\n').length;
      if (!findings.has(token)) findings.set(token, []);
      findings.get(token).push(`${file}:${line}`);
    }
  }
}

const rows = [...findings.entries()].sort(
  (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
);
const total = rows.reduce((sum, [, where]) => sum + where.length, 0);

if (files.length === 0) {
  // The ADR-0093 rule: a sweep that found no population must not read as a clean sweep.
  console.error('No TypeScript files matched — refusing to report a clean result on nothing.');
  process.exit(2);
}

console.log(`scanned      ${files.length} files under ${scanned.join(', ')}`);
console.log(`unresolved   ${total} citations across ${rows.length} names`);
console.log('');
console.log(
  "Most are legitimate — see this file's docblock for the four categories that dominate.",
);
console.log('');
for (const [token, where] of rows) {
  console.log(`${String(where.length).padStart(3)}  ${token.padEnd(32)} ${where[0]}`);
}
