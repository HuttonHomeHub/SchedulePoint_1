import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every Prisma `contains:` search under `apps/api/src/modules` is escaped.
 *
 * **Why this is a gate and not a comment.** `contains` + `mode: 'insensitive'` compiles to
 * `column ILIKE '%' || term || '%'` with the term passed through **unescaped** — `%` and `_` in
 * a searched-for value are read as wildcards wherever they appear, not just at the two edges this
 * concatenation adds (`docs/TECH_DEBT.md` #337, closed 2026-09-28). A search for the literal `50%`
 * matched `Acme 5000 Ltd`, and a search for `a_b` matched `aXb`. The fix is one helper
 * (`escapeLikePattern`); this gate is what stops the next `?q=` search reaching for a bare
 * `contains: search` instead, which reads correctly, passes every other test, and reintroduces
 * exactly the defect this row closed.
 *
 * **Its blind spot, stated rather than left to be discovered.** It reads source text, so it
 * cannot see a term escaped by a differently-named helper (there is deliberately only one), and
 * it cannot prove the escaped value reaches Postgres unchanged — the API e2e specs prove that,
 * against a real database. What it catches is the shape every one of today's three sites had
 * before this row was fixed, and the shape a new site would most plausibly copy from an older,
 * unescaped example if this test did not exist. `contains:` scanned raw (comments stripped) has
 * bitten four other gates in this repository matching their own prose (`docs/TECH_DEBT.md` #222);
 * this docblock's own uses of `contains:`/`escapeLikePattern(` live outside `apps/api/src/modules`,
 * so the scan below never reads this file.
 */

const MODULES_ROOT = join(__dirname, '../../modules');

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.e2e-spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

/** Everything passed as the value of a `contains:` key, up to the next `,` or `}`. */
function containsArguments(text: string): string[] {
  return [...text.matchAll(/\bcontains:\s*([^,}]+)/g)]
    .map((match) => match[1]?.trim())
    .filter((arg): arg is string => arg !== undefined);
}

/** Local identifiers assigned `const <name> = escapeLikePattern(...)` earlier in the file — the
 * shape `resource.repository.ts` uses to share one escaped term across an OR of two `contains`. */
function escapedIdentifiersIn(text: string): Set<string> {
  const names = [...text.matchAll(/\bconst\s+(\w+)\s*=\s*escapeLikePattern\(/g)]
    .map((match) => match[1])
    .filter((name): name is string => name !== undefined);
  return new Set(names);
}

function isEscaped(argument: string, escapedIdentifiers: Set<string>): boolean {
  if (/^escapeLikePattern\(.*\)$/.test(argument)) return true;
  return escapedIdentifiers.has(argument);
}

const files = listTsFiles(MODULES_ROOT);
const relativeToModules = (file: string): string => file.slice(MODULES_ROOT.length + 1);
const filesWithContains = files.filter(
  (file) => containsArguments(stripComments(readFileSync(file, 'utf8'))).length > 0,
);

describe('every `contains:` search under apps/api/src/modules is escaped', () => {
  it('found at least one `contains:` site to check — the pinned positive case (ADR-0093)', () => {
    // Without this, deleting every search site (or renaming `contains`, or moving the modules
    // directory) satisfies the assertion below perfectly, and a green run could not tell "every
    // site is escaped" from "there is nothing left to check".
    expect(filesWithContains.length).toBeGreaterThan(0);
    expect(filesWithContains.map(relativeToModules)).toEqual(
      expect.arrayContaining([
        'calendars/calendar.repository.ts',
        'clients/client.repository.ts',
        'resources/resource.repository.ts',
      ]),
    );
  });

  it.each(filesWithContains.map((file) => [relativeToModules(file)] as const))(
    '%s wraps every `contains:` value in escapeLikePattern',
    (relative) => {
      const text = stripComments(readFileSync(join(MODULES_ROOT, relative), 'utf8'));
      const escapedIdentifiers = escapedIdentifiersIn(text);
      for (const argument of containsArguments(text)) {
        expect(
          isEscaped(argument, escapedIdentifiers),
          `${relative}: \`contains: ${argument}\` is not wrapped by escapeLikePattern — a raw ` +
            'term lets % and _ in a searched value act as wildcards (docs/TECH_DEBT.md #337)',
        ).toBe(true);
      }
    },
  );
});
