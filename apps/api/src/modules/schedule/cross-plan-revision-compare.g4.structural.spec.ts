import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { allKeys, scanForCostKeys, stripComments } from '../../common/contracts/cost-key-scan';

/**
 * **No cost-shaped field in the cross-plan comparison, at any depth.**
 *
 * The ADR-0116 G4 rule applied to a second route, and for the same reason: this comparison is the
 * artefact a planner hands to somebody who was not in the room, so it must be **role-invariant** —
 * one URL producing one document whatever the reader may see. That holds today because no cost,
 * rate or budget field exists in the response, which makes `cost:read` irrelevant to it. Enforced
 * only by construction, the plausible failure is a well-meant later edit adding a `budgetVariance`
 * "for completeness", which no other test would notice and which would silently make a handover
 * artefact depend on who asked for it.
 *
 * **The scanner is IMPORTED, not re-implemented** (`common/contracts/cost-key-scan.ts`). A copy
 * would be a second place for a bypass to survive after it was fixed in the other, and the drift
 * would be invisible — each gate goes green on its own sources either way. The two bypasses the
 * ADR-0116 M5 security review found by running the mutations live are pinned there and re-pinned
 * below against THIS gate's own call, because a shared helper that a caller forgets to use is the
 * failure that replaces the one it removed.
 *
 * **Blind spot, restated rather than inherited silently:** a nested type imported from a file this
 * does not scan is invisible to a source scan. The response's own sub-shapes are covered because
 * the DTO declares them; a future `offenders: SomeImportedType[]` would not be.
 */
const HERE = join(__dirname);

/** Every file the response passes through on its way out. */
const SOURCES: Array<[string, string]> = [
  [
    'dto/cross-plan-revision-compare.dto.ts',
    join(HERE, 'dto', 'cross-plan-revision-compare.dto.ts'),
  ],
  [
    'dto/cross-plan-revision-compare-query.dto.ts',
    join(HERE, 'dto', 'cross-plan-revision-compare-query.dto.ts'),
  ],
  [
    'cross-plan-revision-compare.controller.ts',
    join(HERE, 'cross-plan-revision-compare.controller.ts'),
  ],
  // The pure modules the payload is assembled from. `revision-projections.ts` is here because it is
  // the one place a column could be added to BOTH sides at once and reach every consumer.
  ['baselines/revision-correlate.ts', join(HERE, '..', 'baselines', 'revision-correlate.ts')],
  ['baselines/revision-projections.ts', join(HERE, '..', 'baselines', 'revision-projections.ts')],
];

/**
 * The service is scanned by METHOD, not whole-file: `schedule.service.ts` legitimately hosts the
 * Earned Value read model (ADR-0042), so a whole-file scan would fire on correct code — and a gate
 * that cries wolf gets deleted rather than fixed (ADR-0058).
 */
function sliceMethod(text: string, marker: string): string {
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`This gate cannot find its scan target: ${marker}`);
  const rest = text.slice(start);
  const end = rest.slice(marker.length).search(/\n {2}[@a-zA-Z]/);
  return end === -1 ? rest : rest.slice(0, marker.length + end);
}

const readers: Array<[string, () => string]> = [
  ...SOURCES.map(([label, file]): [string, () => string] => [
    label,
    () => stripComments(readFileSync(file, 'utf8')),
  ]),
  [
    'schedule.service.ts crossPlanRevisionCompare',
    () =>
      stripComments(
        sliceMethod(
          readFileSync(join(HERE, 'schedule.service.ts'), 'utf8'),
          'async crossPlanRevisionCompare(',
        ),
      ),
  ],
];

describe('the cross-plan comparison carries no cost-shaped field', () => {
  it('walked a non-zero number of keys — a gate that traverses nothing passes perfectly', () => {
    const keys = readers.flatMap(([, read]) => allKeys(read()));
    expect(keys.length).toBeGreaterThan(50);
  });

  it.each(readers)('%s declares no cost-shaped key', (_label, read) => {
    const offending = scanForCostKeys(read());
    expect(offending, `cost-shaped keys: ${offending.join(', ')}`).toEqual([]);
  });

  describe('the scan this gate actually calls', () => {
    // Re-pinned here rather than trusted from the shared module's own suite. A shared helper a
    // caller forgets to use is the failure mode that replaces the one extraction removed, and
    // these three assertions are what say this gate is calling it.
    it('catches a cost key in a SINGLE-LINE object literal — ADR-0116 M5 bypass 1', () => {
      expect(scanForCostKeys('  return build({ matched: 1, cost: 0 });')).toEqual(['cost']);
    });

    it('catches a banned-named SHORTHAND property — ADR-0116 M5 bypass 2', () => {
      expect(scanForCostKeys('  return build({ matched, budgetImpact });')).toEqual([
        'budgetImpact',
      ]);
    });

    it('catches a QUOTED key — the fourth bypass, found by the M4 security review', () => {
      // The easiest of the four to introduce by accident: bypasses 1-3 each needed a particular
      // formatting, and this one needs only string-literal key syntax. Demonstrated returning `[]`
      // before the pattern existed.
      expect(scanForCostKeys('return build({ matched: 1, "budgetImpact": 500 });')).toEqual([
        'budgetImpact',
      ]);
      expect(scanForCostKeys("return build({ matched: 1, 'costRate': 500 });")).toEqual([
        'costRate',
      ]);
    });

    it('does NOT claim to catch a computed key, and says so rather than implying otherwise', () => {
      // A name check structurally cannot see a name that is not in the source. Pinned as a KNOWN
      // limit so a reader does not infer coverage this gate cannot have — the runtime payload walk
      // in the API e2e is the backstop, not a duplicate of this.
      expect(scanForCostKeys('const k = "cost" + "Impact"; return build({ [k]: 500 });')).toEqual(
        [],
      );
    });

    it('catches a declared class property, the form a DTO edit takes', () => {
      expect(scanForCostKeys('  @ApiProperty() budgetVariance!: number;')).toEqual([
        'budgetVariance',
      ]);
    });
  });
});
