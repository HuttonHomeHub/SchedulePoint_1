import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
const ALLOWED = ['src/components/layout/navigator/app-shell.tsx'];

describe('the `squat:` variant', () => {
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: process.cwd(), encoding: 'utf8' })
    .split('\n')
    .filter((path) => /\.tsx$/.test(path) && !/\.test\.tsx$/.test(path));

  const consumers = files.filter((path) =>
    /(?:^|[\s'"`])(?:[\w-]+:)*squat:/.test(
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    ),
  );

  it('reads the components and finds the one consumer that exists', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(consumers, 'the scan found no `squat:` anywhere — it has stopped reading').not.toEqual(
      [],
    );
  });

  it('is used only by the shell, which wraps its grid in the frame', () => {
    expect(consumers).toEqual(ALLOWED);
  });
});
