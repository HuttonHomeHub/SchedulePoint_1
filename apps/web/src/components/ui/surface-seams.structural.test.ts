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

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles()
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file).split('\\').join('/'))
    .sort();
}

describe('surface scope seams (structural)', () => {
  it('only the allowlisted files name --chrome-*, --panel-* or --brand-*', () => {
    // The protection is HERE, in the regex — not in `ALLOWED`. Adding a family without adding it
    // to these three patterns leaves it entirely unguarded: any component could write
    // `var(--brand-primary)` and no test would notice (ADR-0077 §1).
    expect(filesMatching(/--(chrome|panel|brand|auth)\b/)).toEqual([...ALLOWED].sort());
  });

  it('only the allowlisted files write a data-surface attribute', () => {
    // `Surface` renders it; everything else must go through `Surface`. A hand-written
    // `data-surface` would paint correctly today and drift the moment the rebind list changes.
    expect(filesMatching(/data-surface/)).toEqual([...ALLOWED].sort());
  });

  it('no component reaches for a surface family through var()', () => {
    const offenders = filesMatching(/var\(--(chrome|panel|brand|auth)-/).filter(
      (file) => !ALLOWED.includes(file),
    );
    expect(offenders).toEqual([]);
  });
});
