import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Total float is what the ANALYSES measure on this side too** (one-planning-surface M-E-T7).
 *
 * The API half of this rule lives in `apps/api/src/modules/schedule/float-basis.structural.spec.ts`
 * and guards DCMA and the float-path engine. This is the web half, and it guards the two places
 * where a web module decides for itself which float to read:
 *
 * - the **float-paths row model**, which projects each activity into a path row. It carries the
 *   number the server ranked by, so reading anything else here would make the table disagree with
 *   the ordering it is displaying.
 * - **baseline float variance**, which compares today's float against a captured one.
 *   `remainingFloat` is not in any baseline captured before M-C, so half such a comparison would be
 *   unavailable and the other half would silently change basis at the capture boundary.
 *
 * **What it pins is a global swap**, which is the likely failure rather than a fanciful one:
 * somebody reads M-E-T7, sees `totalFloat` still in the tree, and finishes the job. Every test
 * stays green, because the two fields are equal on every plan nobody has placed a bar on — which
 * FC-1 predicts is all of them today. It would surface months later, on the first placed
 * programme, as a float-path ordering that moved when no logic changed.
 *
 * A **grep, deliberately**: the two fields have the same type, so nothing a compiler can see
 * distinguishes them. What distinguishes them is the question the module is answering.
 */

const SRC = join(__dirname, '..', '..');

const GUARDED: ReadonlyArray<{ readonly path: string; readonly why: string }> = [
  {
    path: 'features/float-paths/model/float-path-rows.ts',
    why: 'the rows must carry the number the server ranked the paths by',
  },
  {
    path: 'lib/schedule-format.ts',
    why: 'a baseline captured before M-C froze total float and nothing else',
  },
];

describe('the float basis of the web analyses', () => {
  for (const { path, why } of GUARDED) {
    it(`${path} reads total float where it analyses — ${why}`, () => {
      const text = readFileSync(join(SRC, path), 'utf8');
      // The pinned positive case (ADR-0093): the ban alone passes against a module that stopped
      // reading float, or against a path that no longer exists.
      expect(text).toContain('totalFloat');
    });
  }

  it('the float-path row model never reaches for remaining float', () => {
    const text = readFileSync(join(SRC, 'features/float-paths/model/float-path-rows.ts'), 'utf8');
    expect(text).not.toContain('remainingFloat');
  });

  /**
   * `schedule-format.ts` is the ONE module that legitimately holds both, because it is where the
   * split is declared: `formatFloat` for total, `formatRemainingFloat` for the placed basis. So it
   * cannot take the blanket ban its neighbour does — what is asserted instead is that the variance
   * formatter, specifically, still reads the baseline's own field.
   */
  it('baseline float variance still compares the field a baseline actually froze', () => {
    const text = readFileSync(join(SRC, 'lib/schedule-format.ts'), 'utf8');
    expect(text).toContain('row.floatVarianceDays');
    expect(text).not.toContain('row.remainingFloat');
  });
});
