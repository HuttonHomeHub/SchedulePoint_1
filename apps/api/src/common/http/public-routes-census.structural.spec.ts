import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ORG_SCOPED_PATH_PREFIX } from './body-limits';

/**
 * **No `@Public()` handler resolves under the org-scoped prefix** (TECH_DEBT #407).
 *
 * `app-setup.ts` reads bodies up to 512 KB under `/api/v1/organizations`, and it may only do that
 * because every route there sits behind the session guard. The parser runs BEFORE any guard, so
 * nothing at runtime notices a public handler added under that prefix later — it would simply
 * inherit the large cap and be reachable by a stranger. This is the observer.
 *
 * A source scan rather than a request: it is conservative on purpose. A controller whose path
 * starts `organizations` that mentions `@Public()` anywhere — on the class or on one method — fails,
 * without trying to work out which handler the decorator sits on, because the safe answer to "is
 * this public route under the prefix?" is to make somebody look.
 */
const SRC = join(__dirname, '..', '..');
const ORG_SEGMENT = ORG_SCOPED_PATH_PREFIX.split('/').pop() ?? '';

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return controllerFiles(path);
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

/** Comments stripped: this repo's docblocks quote the decorator they discuss. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/** The first path the file's `@Controller(...)` declares, as a string or `{ path }`. */
function controllerPath(source: string): string | null {
  const match = /@Controller\(\s*(?:\{[^}]*?path:\s*)?'([^']*)'/.exec(source);
  return match?.[1] ?? null;
}

const controllers = controllerFiles(SRC).map((path) => {
  const source = code(path);
  return {
    file: relative(SRC, path),
    path: controllerPath(source),
    isPublic: source.includes('@Public()'),
  };
});

describe('the org-scoped body-cap prefix (TECH_DEBT #407)', () => {
  it('names the segment the controllers are scanned for', () => {
    expect(ORG_SEGMENT).toBe('organizations');
  });

  it('is not vacuous: the scan finds the public controllers and the org-scoped ones', () => {
    const publicFiles = controllers.filter((c) => c.isPublic).map((c) => c.file);
    for (const expected of [
      'health/health.controller.ts',
      'version/version.controller.ts',
      'modules/csp/csp-report.controller.ts',
      'modules/invitations/invitations.controller.ts',
      'modules/share/share-guest.controller.ts',
    ]) {
      expect(publicFiles).toContain(expected);
    }
    expect(controllers.filter((c) => c.path?.startsWith(ORG_SEGMENT)).length).toBeGreaterThan(20);
    expect(controllers.every((c) => c.path !== null)).toBe(true);
  });

  it('has no @Public() handler in a controller that resolves under /api/v1/organizations', () => {
    const offenders = controllers
      .filter((c) => c.isPublic && c.path !== null && c.path.split('/')[0] === ORG_SEGMENT)
      .map((c) => c.file);
    expect(offenders).toEqual([]);
  });
});
