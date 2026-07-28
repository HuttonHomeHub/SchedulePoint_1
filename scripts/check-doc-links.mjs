#!/usr/bin/env node
/**
 * Relative-link checker for Markdown docs.
 *
 * Why this exists: the 2026-07-27 documentation reconcile found five broken
 * relative links by hand — including two created by that same pass when it
 * deleted a directory an ADR pointed at. Nothing would have caught the sixth.
 * A dead link in an ADR is worse than a typo: the decision record is the thing
 * you reach for when you no longer remember why, and it has to still resolve.
 *
 * Scope, deliberately narrow so it never produces noise:
 *   - Relative links to files inside the repo (`](./x.md)`, `](../y/z.png)`).
 *   - External URLs, `mailto:`, and bare anchors are NOT checked (network
 *     flakiness would make the gate untrustworthy, and an untrusted gate gets
 *     ignored).
 *   - Anchors on a relative link (`](x.md#section)`) are stripped: the file
 *     must exist, the heading is not verified.
 *
 * Exclusions live in EXCLUDED_FILES below and each needs a stated reason.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Directories never walked. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo']);

/**
 * Files whose relative links are intentionally unresolvable, with the reason.
 * A template's links resolve from where the FILLED copy lands, not from the
 * template's own directory.
 */
const EXCLUDED_FILES = new Map([
  [
    'docs/templates/project-brief.md',
    'Template: links resolve from docs/, where the filled copy lives.',
  ],
]);

/** `[text](target)` — target captured, anchors and titles handled by the caller. */
const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* markdownFiles(join(dir, entry.name));
    } else if (entry.name.endsWith('.md')) {
      yield join(dir, entry.name);
    }
  }
}

function isRelative(target) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return false; // http:, mailto:, data: …
  if (target.startsWith('//')) return false; // protocol-relative
  if (target.startsWith('#')) return false; // same-document anchor
  return true;
}

const broken = [];
let checked = 0;

for (const file of markdownFiles(ROOT)) {
  const repoPath = relative(ROOT, file).split('\\').join('/');
  if (EXCLUDED_FILES.has(repoPath)) continue;

  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(LINK)) {
    const target = match[1];
    if (!isRelative(target)) continue;

    const withoutAnchor = target.split('#')[0];
    if (withoutAnchor === '') continue; // pure anchor, e.g. `](#top)`

    checked += 1;
    const resolved = resolve(dirname(file), decodeURIComponent(withoutAnchor));
    try {
      statSync(resolved);
    } catch {
      broken.push(`${repoPath}: ${target}`);
    }
  }
}

if (broken.length > 0) {
  console.error(`Broken relative links (${broken.length} of ${checked} checked):\n`);
  for (const entry of broken) console.error(`  ${entry}`);
  console.error(
    '\nFix the path, or — if the target was deliberately deleted — unlink it to' +
      '\ninline code so the prose still reads as written without offering a 404.',
  );
  process.exit(1);
}

console.log(`Documentation links OK (${checked} relative links checked).`);
