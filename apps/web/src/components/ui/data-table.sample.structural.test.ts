import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * **A `fit` column declares a `sample`, or says why it cannot** (TECH_DEBT #341,
 * `docs/specs/loading-skeletons/` M2 Task 2).
 *
 * Without a `sample` a loading table draws the column as a contentless block, `fit` has nothing to
 * fit, and the column starts at ~16px and slides to its settled width when the rows arrive. The
 * declaration is the remedy; this is the part that stops the next edit removing it, and the part
 * that stops a new `fit` column arriving without anyone deciding.
 *
 * **The tree is walked, not a list trusted** (ADR-0124: find by structure, refuse by declaration).
 * Every file that holds a column object — an object literal with a `header` and `width: 'fit'` — must
 * be in `DECLARED`, with how many `fit` columns it has and how many carry a `sample`. A file with
 * fewer samples than `fit` columns must give the reason. The count is per COLUMN OBJECT, so a
 * `sample` written on a neighbouring column does not satisfy this one.
 *
 * **Its blind spot, stated.** The scan reads object literals as written: a column built by a helper
 * or spread from another object is not seen, and `width` computed from a variable is not either.
 * The fixtures below pin what it does see; they cannot prove nothing else exists.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Declared {
  /** How many column objects declare `width: 'fit'` in the file. */
  fit: number;
  /** How many of them also carry `sample`. */
  sampled: number;
  /** Required whenever `sampled < fit`, and for a table with no `fit` column. */
  reason?: string;
}

const NOT_SC3 =
  'not one of the eight SC-3 tables, where a sample is graded; other call sites may follow at will (spec §4.6)';

const DECLARED: Record<string, Declared> = {
  // The eight SC-3 tables (Clients, Projects, Plans, Calendars, Resources, Members, Audit log,
  // Recently deleted).
  'features/clients/components/ClientsTable.tsx': { fit: 1, sampled: 1 },
  'features/members/components/MembersTable.tsx': { fit: 1, sampled: 1 },
  'features/audit/components/AuditEventList.tsx': { fit: 1, sampled: 1 },
  'features/plans/components/PlansTable.tsx': { fit: 1, sampled: 1 },
  'features/calendars/components/CalendarsTable.tsx': { fit: 1, sampled: 1 },
  'features/resources/components/ResourcesTable.tsx': {
    fit: 2,
    sampled: 1,
    reason:
      'Kind is sampled; Code is not — its cell is `font-mono text-xs`, which a sample cannot carry',
  },
  'features/recently-deleted/components/RecentlyDeletedTable.tsx': {
    fit: 1,
    sampled: 0,
    reason:
      'its one `fit` column is the Actions buttons, whose width a sample string cannot stand for',
  },
  'features/projects/components/ProjectsTable.tsx': {
    fit: 0,
    sampled: 0,
    reason: 'no `fit` column (Name and Actions are undeclared), so there is nothing to sample',
  },
  // Tables outside the SC-3 set.
  'features/members/components/InvitationsSection.tsx': { fit: 1, sampled: 0, reason: NOT_SC3 },
  'features/calendars/components/ProjectCalendarsSection.tsx': {
    fit: 1,
    sampled: 0,
    reason: NOT_SC3,
  },
  'features/schedule/components/ApplyLevellingDialog.tsx': { fit: 3, sampled: 0, reason: NOT_SC3 },
  'features/placement-migration/components/PlacementMigrationNotice.tsx': {
    fit: 1,
    sampled: 0,
    reason: NOT_SC3,
  },
  'features/staff/ui/accounts-panel.tsx': { fit: 1, sampled: 1 },
  'features/staff/ui/activity-panel.tsx': { fit: 1, sampled: 1 },
  'features/staff/ui/mail-panel.tsx': {
    fit: 2,
    sampled: 1,
    reason:
      'the timestamp is sampled; the Email kind is a label from a closed set no one sample can stand for',
  },
  'features/staff/ui/retention-panel.tsx': { fit: 3, sampled: 0, reason: NOT_SC3 },
  'features/staff/ui/security-panel.tsx': {
    fit: 3,
    sampled: 1,
    reason:
      'the timestamp is sampled; Action is a label from a closed set and Times is a count, neither worth a sample',
  },
};

function sourceFiles(dir = SRC, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec|structural\.test)\.tsx?$/.test(entry.name)
    ) {
      out.push(path);
    }
  }
  return out;
}

/** Counts column objects (`header` + `width: 'fit'`) and those that also carry `sample`. */
function count(source: string): { fit: number; sampled: number } {
  const file = ts.createSourceFile(
    'x.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let fit = 0;
  let sampled = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isObjectLiteralExpression(node)) {
      const names = new Map<string, ts.Expression>();
      for (const prop of node.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
        ) {
          names.set(prop.name.text, prop.initializer);
        }
      }
      const width = names.get('width');
      if (names.has('header') && width && ts.isStringLiteral(width) && width.text === 'fit') {
        fit += 1;
        if (names.has('sample')) sampled += 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { fit, sampled };
}

describe('the scan sees what it claims to (pinned positive cases)', () => {
  it('counts a fit column and its sample, and ignores both in a comment', () => {
    const source = [
      "const c = [{ header: 'A', width: 'fit', sample: 'x', cell: () => null }];",
      "// { header: 'B', width: 'fit', sample: 'y' }",
      "/* { header: 'C', width: 'fit', sample: 'z' } */",
    ].join('\n');
    expect(count(source)).toEqual({ fit: 1, sampled: 1 });
  });

  it('counts the sample per column, not per file', () => {
    const source = [
      'const c = [',
      "  { header: 'A', width: 'fit', sample: 'x' },",
      "  { header: 'B', width: 'fit' },",
      "  { header: 'C', width: 'auto', sample: 'y' },",
      '];',
    ].join('\n');
    expect(count(source)).toEqual({ fit: 2, sampled: 1 });
  });

  it('ignores a width: fit that is not a column (no header)', () => {
    expect(count("const x = { width: 'fit' };")).toEqual({ fit: 0, sampled: 0 });
  });
});

describe('every fit column is sampled or declared unsampled', () => {
  const found = new Map<string, { fit: number; sampled: number }>();
  for (const file of sourceFiles()) {
    const result = count(readFileSync(file, 'utf8'));
    if (result.fit > 0) found.set(relative(SRC, file), result);
  }

  it('walks a non-trivial number of columns, so a broken walker cannot pass silently', () => {
    expect([...found.values()].reduce((sum, c) => sum + c.fit, 0)).toBeGreaterThan(15);
  });

  it('finds no file with a fit column that is not declared', () => {
    const undeclared = [...found.keys()].filter((file) => !(file in DECLARED));
    expect(
      undeclared,
      `Add a sample to each fit column, or declare the file in DECLARED with a reason:\n${undeclared.join('\n')}`,
    ).toEqual([]);
  });

  for (const [file, declared] of Object.entries(DECLARED)) {
    it(`${file} matches its declaration`, () => {
      const actual = found.get(file) ?? { fit: 0, sampled: 0 };
      expect(actual).toEqual({ fit: declared.fit, sampled: declared.sampled });
      if (declared.sampled < declared.fit || declared.fit === 0) {
        expect(declared.reason, 'an unsampled declaration needs its reason').toBeTruthy();
      }
    });
  }
});
