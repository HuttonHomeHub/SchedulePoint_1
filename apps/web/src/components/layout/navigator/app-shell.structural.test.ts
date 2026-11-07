import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **`squat:` has one consumer, and it lives inside the shell frame** (ADR-0213).
 *
 * `squat` is a container query on `.shell-frame`, so a `squat:` class on an element outside the
 * frame never matches and nothing says so: the rule silently does nothing. jsdom has no containers
 * to notice. A new consumer is therefore a conscious edit to this list, made by someone who has read
 * why the frame exists — not a class that quietly never fires.
 *
 * Comments are stripped first: the docblocks around the variant name it in prose, and a scan that
 * matches its own explanation is the failure ADR-0131 records. The "found nothing" guard is the
 * positive case, so a scan that stopped reading the tree cannot pass for "no stray consumer".
 */
const ALLOWED = ['components/layout/navigator/app-shell.tsx'];

/** `apps/web/src`, from this file's own location so the scan does not depend on the working directory. */
const SRC = join(import.meta.dirname, '..', '..', '..');

/** Every non-test `.ts`, `.tsx` and `.css` file under `src`: a `squat:` class can live in any of them. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('the `squat:` variant', () => {
  const files = sourceFiles(SRC);

  const consumers = files
    .filter((path) =>
      /(?:^|[\s'"`])(?:[\w-]+:)*squat:/.test(
        readFileSync(path, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, ''),
      ),
    )
    .map((path) => relative(SRC, path).split('\\').join('/'));

  it('reads the sources and finds the one consumer that exists', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(consumers, 'the scan found no `squat:` anywhere — it has stopped reading').not.toEqual(
      [],
    );
  });

  it('is used only by the shell, which wraps its grid in the frame', () => {
    expect(consumers).toEqual(ALLOWED);
  });
});
