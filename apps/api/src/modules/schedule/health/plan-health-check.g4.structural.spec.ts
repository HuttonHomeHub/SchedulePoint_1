import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allKeys, scanForCostKeys, stripComments } from '../../../common/contracts/cost-key-scan';

/**
 * **G4 — the no-cost-egress gate (spec §3.2, security review S1).**
 *
 * The health report's role-invariance rests on one fact: no cost, rate or budget field exists in
 * the response at any depth, so `cost:read` changes nothing and one URL produces one document.
 * Until this gate existed that was enforced only *by construction* — by nobody having added such a
 * field — and the plausible failure is a well-meant later edit adding `budgetedExpenseTotal` to
 * metric 10 "for completeness", which no other test would notice and which would silently make a
 * handover artefact role-dependent.
 *
 * It is a NAME check over the health sources, the service/controller seam and the response DTO.
 * **The scan is whole-file, not per-line**: the first version anchored its key pattern to
 * line-start, which is how Prettier formats a MULTI-line object literal and not a single-line one
 * — so `{ narrowing: RESOURCES_NARROWING, cost: 0 }` (95 chars, Prettier-clean) sailed through,
 * as did a shorthand property (`{ narrowing, budgetImpact }`), which has no `:` at all. Both
 * bypasses were found by the M5 security review, which ran the mutations live against this gate
 * and watched it stay green; both are pinned as fixtures below, and the fixed scanner was
 * verified RED against each before the mutation was reverted (ADR-0110 D5).
 *
 * **A THIRD bypass was found later, and this gate was green against it by luck.** A key preceded by
 * a decorator on the same line (`@ApiProperty() budgetVariance!: number;`) is at neither line start
 * nor after a `{`/`,`, so neither pattern could see it — and `plan-health-check.dto.ts` simply
 * happens not to use that form, while its sibling `revision-compare.dto.ts` uses it twenty times.
 * A one-line Prettier reflow of a two-line property here would have hidden a cost field from the
 * gate written to catch it, with nothing going red. It was found by giving the scanner a SECOND
 * consumer rather than by anything failing, which is the argument for having extracted it: the fix
 * lands once. The scanner and its fixture live in `common/contracts/cost-key-scan.ts` and
 * `cross-plan-revision-compare.g4.structural.spec.ts`.
 *
 * Blind spots, stated: a nested type imported from OUTSIDE these files (e.g. a future
 * `offenders: ActivitySummary[]`) is invisible to a source scan of this directory, and a value
 * smuggled through a variable whose NAME is innocent (`const x = plan.costTotal` in a file not
 * scanned) is invisible to any name check. The M5 security pass reads the response shape end to
 * end; this pins the local temptation.
 */

/**
 * One method's body, for the two files that legitimately carry cost keys elsewhere:
 * `schedule.service.ts` hosts the Earned Value read model (ADR-0042) whole-file, so G4 scans only
 * the `getHealthCheck` seam the report crosses on its way out — from the marker to the next
 * class-member boundary (2-space-indented decorator or identifier).
 */
function sliceMethod(text: string, marker: string): string {
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`G4 cannot find its scan target: ${marker}`);
  const rest = text.slice(start);
  const end = rest.slice(marker.length).search(/\n {2}[@a-zA-Z]/);
  return end === -1 ? rest : rest.slice(0, marker.length + end);
}

describe('G4 — no cost-shaped field in the health report', () => {
  const wholeFiles = [
    ...readdirSync(join(__dirname))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((f) => join(__dirname, f)),
    join(__dirname, '..', 'dto', 'plan-health-check.dto.ts'),
    // The M6 what-if computes the metric-12 row the report merges — the same role-invariance
    // story, so the same gate.
    join(__dirname, '..', 'critical-path-test.ts'),
  ];

  // The seam the report crosses on its way out: a future enrichment here (an `Object.assign`
  // onto the report before the DTO) would be invisible to a scan of the health directory alone,
  // and nothing serialization-side strips extraneous fields (no ClassSerializerInterceptor).
  // Method-scoped, not whole-file — the service legitimately serves the EV cost read model.
  const methodSlices: Array<[string, string, string]> = [
    [
      'schedule.service.ts getHealthCheck',
      join(__dirname, '..', 'schedule.service.ts'),
      'async getHealthCheck(',
    ],
    [
      'schedule.service.ts getCriticalPathTest',
      join(__dirname, '..', 'schedule.service.ts'),
      'async getCriticalPathTest(',
    ],
    [
      'schedule.controller.ts healthCheck',
      join(__dirname, '..', 'schedule.controller.ts'),
      'async healthCheck(',
    ],
    [
      'schedule.controller.ts criticalPathTest',
      join(__dirname, '..', 'schedule.controller.ts'),
      'async criticalPathTest(',
    ],
  ];

  const sources: Array<[string, () => string]> = [
    ...wholeFiles.map((f): [string, () => string] => [
      f.split('/').slice(-2).join('/'),
      () => stripComments(readFileSync(f, 'utf8')),
    ]),
    ...methodSlices.map(([label, file, marker]): [string, () => string] => [
      label,
      () => stripComments(sliceMethod(readFileSync(file, 'utf8'), marker)),
    ]),
  ];

  it('walked a non-zero number of keys (the gate cannot pass by traversing nothing)', () => {
    const keys = sources.flatMap(([, read]) => allKeys(read()));
    expect(keys.length).toBeGreaterThan(50);
  });

  it.each(sources)('%s declares no cost-shaped key', (_, read) => {
    const offending = scanForCostKeys(read());
    expect(offending, `cost-shaped keys: ${offending.join(', ')}`).toEqual([]);
  });

  // The two M5 security-review bypasses, pinned verbatim. Each was demonstrated GREEN under the
  // old line-anchored regex (`/^\s+([A-Za-z_][A-Za-z0-9_]*)[!?]?\s*:/` per line) by running the
  // real mutation through the old gate, and each goes RED here.
  it('catches a cost key in a SINGLE-LINE object literal (bypass 1)', () => {
    expect(
      scanForCostKeys('  return informational({ narrowing: RESOURCES_NARROWING, cost: 0 });'),
    ).toEqual(['cost']);
  });

  it('catches a banned-named SHORTHAND property (bypass 2)', () => {
    expect(
      scanForCostKeys(
        'const budgetImpact = 0;\n  return informational({ narrowing: RESOURCES_NARROWING, budgetImpact });',
      ),
    ).toEqual(['budgetImpact']);
  });

  it('still catches the original declaration form the gate was verified red against', () => {
    expect(scanForCostKeys('  budgetedExpenseTotal!: number;')).toEqual(['budgetedExpenseTotal']);
  });
});
