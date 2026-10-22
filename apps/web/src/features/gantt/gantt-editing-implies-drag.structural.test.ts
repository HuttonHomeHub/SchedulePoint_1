import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **A refused F2 is announced through `drag.announce`** (#538): `GanttGridEditing` carries no live
 * region of its own, and `drag` is the bundle that does. So the announcement exists only if every
 * host that supplies `editing` supplies `drag` too. Asserted on the source because the failure is a
 * silent one: F2 would still show the tip, and only a screen-reader user would be told nothing.
 */

const SRC = join(import.meta.dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx$/.test(entry) || /\.test\.tsx$/.test(entry)) return [];
    return [path];
  });
}

describe('a host that gives the Gantt an editing bundle also gives it the live region', () => {
  const hosts = sourceFiles(SRC).filter((path) => /<GanttPanel\b/.test(readFileSync(path, 'utf8')));

  it('finds the hosts it is about (an empty population would pass vacuously)', () => {
    expect(hosts.length).toBeGreaterThan(0);
  });

  it.each(hosts.map((path) => [path.slice(SRC.length + 1), path]))(
    '%s passes drag wherever it passes editing',
    (_name, path) => {
      const source = readFileSync(path, 'utf8');
      const withEditing = /<GanttPanel\b[^>]*\bediting=/s.test(source);
      const withDrag = /<GanttPanel\b[^>]*\bdrag=/s.test(source);
      if (withEditing) expect(withDrag).toBe(true);
    },
  );
});
