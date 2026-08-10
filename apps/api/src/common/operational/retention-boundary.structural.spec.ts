import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RETENTION_TABLES } from './retention-policy';

/**
 * **The one thing this feature must never be able to do.**
 *
 * ADR-0087 D3: the sweep may never delete from `audit_events`. That table refuses `UPDATE` and
 * `DELETE` in the database — `BEFORE` triggers declared `ENABLE ALWAYS`, so the application role
 * cannot bypass them — and ADR-0085 D1 refused to relax them, because doing so converts a
 * **structural** guarantee into a **procedural** one: the answer to "could these rows have been
 * altered?" changes from "not by the application role" to "only by the retention path, which we
 * believe was used correctly".
 *
 * A feature whose entire job is deleting rows on a timer is exactly the one that will eventually be
 * asked to "just add one more table". So the boundary is a test rather than a paragraph, and it
 * asserts by **equality** — a third table fails here and forces the decision to be made
 * deliberately, which is the whole intent.
 *
 * The source scan strips comments first. That is not fastidiousness: `staff-boundary.structural.spec.ts`
 * learnt it the hard way, where a docblock *explaining* the rule tripped the scan that enforced it.
 * This file's own docblocks say `audit_events` repeatedly, and would fail its own scan otherwise.
 */
const OPERATIONAL_DIR = join(__dirname);

/** Source with comments removed, so prose about a forbidden name is not mistaken for a use of it. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function operationalSources(): string[] {
  return readdirSync(OPERATIONAL_DIR)
    .filter((entry) => entry.endsWith('.ts') && !entry.endsWith('.spec.ts'))
    .map((entry) => join(OPERATIONAL_DIR, entry));
}

describe('the retention sweep cannot reach what it must not', () => {
  it('names exactly two tables — by equality, so a third forces a decision', () => {
    expect(new Set(RETENTION_TABLES)).toEqual(new Set(['csp_reports', 'mail_events']));
  });

  it('never references the append-only audit log, or any customer entity', () => {
    // `audit_events` first, because it is the one with a database guarantee behind it. The customer
    // entities follow the `staff-boundary` precedent: `PrismaService` is global, so an import rule
    // would not catch the shortcut a developer actually reaches for.
    const forbidden = [
      'audit_events',
      'auditEvent',
      'prisma.plan',
      'prisma.activity',
      'prisma.user',
      'prisma.note',
      'prisma.client',
      'prisma.project',
      'prisma.calendar',
      'prisma.resource',
      'prisma.baseline',
    ];

    const offenders: string[] = [];
    for (const file of operationalSources()) {
      const source = code(file);
      for (const name of forbidden) {
        if (source.includes(name)) offenders.push(`${file} → ${name}`);
      }
    }

    expect(offenders, 'the retention sweep must not reach the audit log or customer data').toEqual(
      [],
    );
  });

  it('builds no DELETE whose table name came from a variable', () => {
    // The statement per policy is a tagged template with literal identifiers. A `${...}` sitting
    // between DELETE FROM and its table would mean an identifier reached SQL from the data path —
    // which Prisma's tagged template cannot parameterise, so it would be string-built SQL in
    // everything but name (§14: never string-build SQL).
    const offenders: string[] = [];
    for (const file of operationalSources()) {
      for (const [match] of code(file).matchAll(/DELETE\s+FROM\s+\S+/gi)) {
        if (match.includes('$')) offenders.push(`${file} → ${match}`);
      }
    }

    expect(offenders, 'a DELETE must name its table as a literal').toEqual([]);
  });
});
