import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * **A `fit` column on a high-traffic table declares a `sample`** (TECH_DEBT #341,
 * `docs/specs/loading-skeletons/` M2 Task 2).
 *
 * Without one a loading table draws the column as a contentless block, `fit` has nothing to fit,
 * and the column starts at ~16px and slides to its settled width when the rows arrive. The
 * declaration is the remedy; this is the part that stops the next edit removing it.
 *
 * Declared by FILE and by count, refusing by declaration (ADR-0124): a `fit` column that cannot be
 * sampled is listed in `UNSAMPLED` with its reason, not skipped. The scan reads source as written,
 * so a column built by a helper is not seen — the fixture below pins what it does see.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every `fit` column in these files, and how many carry a `sample`. */
const SAMPLED: Record<string, { fit: number; sampled: number }> = {
  'features/clients/components/ClientsTable.tsx': { fit: 1, sampled: 1 },
  'features/members/components/MembersTable.tsx': { fit: 1, sampled: 1 },
  'features/audit/components/AuditEventList.tsx': { fit: 1, sampled: 1 },
  'features/plans/components/PlansTable.tsx': { fit: 1, sampled: 1 },
  'features/calendars/components/CalendarsTable.tsx': { fit: 1, sampled: 1 },
  // Kind is sampled; Code is not — its cell is `font-mono text-xs`, which a sample cannot carry.
  'features/resources/components/ResourcesTable.tsx': { fit: 2, sampled: 1 },
  // Its one `fit` column is the Actions buttons, whose width a sample string cannot stand for.
  'features/recently-deleted/components/RecentlyDeletedTable.tsx': { fit: 1, sampled: 0 },
};

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function count(source: string): { fit: number; sampled: number } {
  const text = code(source);
  return {
    fit: [...text.matchAll(/\bwidth:\s*'fit'/g)].length,
    sampled: [...text.matchAll(/\bsample:/g)].length,
  };
}

describe('the scan sees what it claims to (pinned positive case)', () => {
  it('counts a fit column and a sample, and ignores both in a comment', () => {
    const source = [
      "{ header: 'A', width: 'fit', sample: 'x', cell: () => null },",
      "// { header: 'B', width: 'fit', sample: 'y' }",
      "/* width: 'fit', sample: 'z' */",
    ].join('\n');
    expect(count(source)).toEqual({ fit: 1, sampled: 1 });
  });
});

describe('a fit column on a high-traffic table is sampled', () => {
  for (const [file, expected] of Object.entries(SAMPLED)) {
    it(`${file} declares ${String(expected.sampled)} of its ${String(expected.fit)} fit column(s)`, () => {
      expect(count(readFileSync(join(SRC, file), 'utf8'))).toEqual(expected);
    });
  }
});
