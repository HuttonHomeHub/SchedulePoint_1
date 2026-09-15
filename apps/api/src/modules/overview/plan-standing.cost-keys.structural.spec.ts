import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allKeys, scanForCostKeys, stripComments } from '../../common/contracts/cost-key-scan';

/**
 * **No cost-shaped field reaches the landing** (plan M3-F1's D6 risk).
 *
 * The organisation landing is the first screen after sign-in and every member sees it. Its standing
 * section is derived from the plan's persisted engine columns, all of which are schedule facts —
 * and `cost:read` is a SEPARATE permission (ADR-0042), held by fewer people than `schedule:read`,
 * which every member role holds (`common/auth/org-permissions.spec.ts:108`). So the section is
 * role-invariant today only *by construction*: by nobody having added such a field.
 *
 * The plausible failure is not malice but completeness — a later edit adding `budgetedExpenseTotal`
 * or `costVariance` beside the movement, because the row is about how a programme is doing and
 * money is part of that. Nothing else in this repository would notice, and the result would be the
 * coldest path in the product silently disclosing cost to every member of the organisation.
 *
 * **The scanner is IMPORTED, never re-implemented** (`common/contracts/cost-key-scan.ts`). Its
 * three known bypasses — a single-line object literal, a banned-named shorthand property, and a key
 * preceded by a same-line decorator — were each found against a copy that had drifted, and the
 * third was found only because that scanner was given a second consumer. This is its third; if a
 * fourth bypass appears, the fix lands once.
 *
 * **Blind spots, stated rather than implied.** A nested type imported from outside these files is
 * invisible to a source scan, and a value smuggled through an innocently-named variable is
 * invisible to any name check. What this pins is the local temptation, which is the one that has
 * actually occurred.
 */
const HERE = __dirname;

/**
 * Pinned rather than globbed. A glob that stops matching passes perfectly, and the whole point of
 * this gate is that it is watching a specific screen's payload (ADR-0093).
 */
const SOURCES: Array<[string, string]> = [
  ['plan-standing.ts', join(HERE, 'plan-standing.ts')],
  ['overview.repository.ts', join(HERE, 'overview.repository.ts')],
  ['dto/overview-response.dto.ts', join(HERE, 'dto', 'overview-response.dto.ts')],
  // The seam: the service composes the DTO, so an `Object.assign` enriching a row on its way out
  // would be invisible to a scan of the read and the DTO alone. Nothing strips extraneous fields
  // on serialization — there is no `ClassSerializerInterceptor` on this route.
  ['overview.service.ts', join(HERE, 'overview.service.ts')],
];

describe('no cost-shaped key reaches the organisation landing', () => {
  const read = (path: string): string => stripComments(readFileSync(path, 'utf8'));

  it('walked a non-zero number of keys (it cannot pass by traversing nothing)', () => {
    // The non-vacuity control. Without it, a renamed file or a scanner that returns `[]` for
    // everything leaves every assertion below green while reading nothing at all.
    const keys = SOURCES.flatMap(([, path]) => allKeys(read(path)));
    expect(keys.length).toBeGreaterThan(50);
  });

  it.each(SOURCES)('%s declares no cost-shaped key', (_label, path) => {
    const offending = scanForCostKeys(read(path));
    expect(offending, `cost-shaped keys: ${offending.join(', ')}`).toEqual([]);
  });

  it('would catch one (verified against the shape most likely to be added here)', () => {
    // A positive case in the gate's own terms, using the exact temptation the docblock names —
    // so a reader can see it discriminates without running a mutation themselves.
    expect(
      scanForCostKeys('    return { planId: row.planId, budgetedExpenseTotal: row.expense };'),
    ).toEqual(['budgetedExpenseTotal']);
  });
});
