import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Total float is what the ANALYSES measure, and it stays that way** (one-planning-surface
 * M-E-T7).
 *
 * M-E-T7 moves the three planner-facing read-outs — the canvas bar sentence, the Gantt grid, the
 * activities table — from `totalFloat` to `remainingFloat`, the slack left from where the bar is
 * actually drawn. That is right for a read-out somebody acts on and **wrong for an analysis**:
 *
 * - **DCMA** metric 4/5 grade a programme's structure. High float and negative float are
 *   statements about the NETWORK, and a programme does not become well-built because nobody has
 *   placed its bars yet, or badly built because somebody has.
 * - **Float paths** rank activities by their network slack to walk the near-critical chains. A
 *   ranking that mixed in placement drift would order the paths by where a planner happened to
 *   drop things.
 * - **Baseline float variance** compares today's float against a captured one. `remainingFloat`
 *   was not frozen by any baseline captured before M-C, so half such a comparison would be
 *   unavailable and the other half would silently change basis at the capture boundary.
 *
 * **The failure this pins is a global swap, and it is the likely one.** Somebody reads M-E-T7,
 * sees `totalFloat` still in the tree, and finishes the job — every match replaced, every test
 * still green, because the two are equal on every plan nobody has placed a bar on (FC-1 predicts
 * that is all of them today). The defect would surface months later on the first placed programme,
 * as a DCMA grade that moved when no logic changed.
 *
 * A **grep, deliberately** — not a type. The two fields have the same type, so nothing a compiler
 * can see distinguishes them; what distinguishes them is which question the module is answering,
 * which is exactly the kind of claim only a structural test can hold.
 */

const SRC = join(__dirname, '..', '..');

/**
 * Each guarded file, with the positive case that stops this gate passing for the wrong reason.
 *
 * **Both halves matter.** The ban alone is satisfied by a file that stopped reading float at all —
 * or by a path that no longer exists, since `readFileSync` would throw and a lazier version of
 * this gate would have caught nothing. So every entry also asserts the module still reads
 * `totalFloat`, which is the ADR-0093 pinned-positive shape.
 */
const GUARDED: ReadonlyArray<{ readonly path: string; readonly why: string }> = [
  {
    path: 'modules/schedule/health/compute-health.ts',
    why: 'DCMA grades the network, not where somebody parked the bars',
  },
  {
    path: 'modules/schedule/engine/float-paths.ts',
    why: 'float paths rank by network slack; drift would reorder the chains',
  },
];

describe('the float basis of the analyses', () => {
  for (const { path, why } of GUARDED) {
    it(`${path} reads total float and never remaining float — ${why}`, () => {
      const text = readFileSync(join(SRC, path), 'utf8');
      expect(text).toContain('totalFloat');
      expect(text).not.toContain('remainingFloat');
    });
  }
});
