import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The surface scope is a SEAM (the ADR-0053 `calendar-seams.structural.spec.ts` precedent).
 *
 * `<Surface>` is the only sanctioned way to enter a surface scope. That claim is what lets
 * every other component stay surface-agnostic — but nothing in TypeScript stops someone
 * hand-writing `data-surface="chrome"` on a div, or reading `var(--chrome-primary)` in an
 * inline style, and both would work well enough to survive review while quietly reintroducing
 * exactly the class of defect this epic removed.
 *
 * So the set of files allowed to name the mechanism is pinned here. Adding one is a
 * deliberate, reviewed act rather than an accident.
 */

const SRC = join(__dirname, '..', '..');
const TEST_DIR = join(SRC, 'test');

/**
 * The only PRODUCTION files allowed to name the mechanism: the stylesheet that declares it and
 * the one component that applies it. Tests are excluded from the scan deliberately — a suite
 * that asserts the invariant has to be able to say its name, and failing a seam test because a
 * comment mentions `--chrome` teaches people to widen allowlists rather than respect them.
 */
const ALLOWED = ['components/ui/surface.tsx', 'styles/globals.css'];

/**
 * The narrower list for the token-naming assertions, and the split is a finding rather than a
 * convenience. Once comments stopped counting (see `code()` below), `surface.tsx` dropped out of
 * this set: it names the families **only in its own docblock**, and in code it writes
 * `data-surface={tone}` and nothing else. That is the component working exactly as designed — it
 * applies a scope without knowing what is in one — so the honest invariant is that the STYLESHEET
 * is the sole place a family token is named. Pinning it here rather than reusing `ALLOWED` makes
 * the gate strictly tighter: a component that started naming `--chrome-primary` would now fail
 * even though `surface.tsx` used to provide cover for it.
 */
const ALLOWED_TO_NAME_A_FAMILY = ['styles/globals.css'];

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path !== TEST_DIR) sourceFiles(path, out);
    } else if (/\.(ts|tsx|css)$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name))
      out.push(path);
  }
  return out;
}

/**
 * Comments are stripped before matching, for the reason this file's own `ALLOWED` docblock gives
 * two paragraphs up — "failing a seam test because a comment mentions `--chrome` teaches people to
 * widen allowlists rather than respect them". That reasoning was applied to the `test/` directory
 * and not to comments in production files, so a docblock explaining the seam still tripped it: a
 * gate that scans raw text cannot tell a mechanism being USED from one being EXPLAINED, and the
 * only way out it left was to widen the allowlist, which is the outcome it warns against.
 *
 * The same idiom as `token-alias-reads.structural.test.ts` and the two `token-architecture.test.ts`
 * ratchets. `//` is stripped only from TS, never from CSS, where it would eat a `https://` in a
 * url().
 */
function code(file: string): string {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  return file.endsWith('.css') ? text : text.replace(/^\s*\/\/.*$/gm, '');
}

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles()
    .filter((file) => pattern.test(code(file)))
    .map((file) => relative(SRC, file).split('\\').join('/'))
    .sort();
}

describe('surface scope seams (structural)', () => {
  it('only the allowlisted files name --chrome-*, --panel-* or --brand-*', () => {
    // The protection is HERE, in the regex — not in `ALLOWED`. Adding a family without adding it
    // to these three patterns leaves it entirely unguarded: any component could write
    // `var(--brand-primary)` and no test would notice (ADR-0077 §1).
    expect(filesMatching(/--(chrome|panel|brand|auth)\b/)).toEqual(
      [...ALLOWED_TO_NAME_A_FAMILY].sort(),
    );
  });

  it('only the allowlisted files write a data-surface attribute', () => {
    // `Surface` renders it; everything else must go through `Surface`. A hand-written
    // `data-surface` would paint correctly today and drift the moment the rebind list changes.
    expect(filesMatching(/data-surface/)).toEqual([...ALLOWED].sort());
  });

  it('no component reaches for a surface family through var()', () => {
    const offenders = filesMatching(/var\(--(chrome|panel|brand|auth)-/).filter(
      (file) => !ALLOWED_TO_NAME_A_FAMILY.includes(file),
    );
    expect(offenders).toEqual([]);
  });
});
