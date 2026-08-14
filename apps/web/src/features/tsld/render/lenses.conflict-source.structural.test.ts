import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONFLICT_FLAGS } from './conflicts';
import { matchesActivityFilter, type FilterAttr, type MatchableActivity } from './lenses';

const SOURCE = readFileSync(join(__dirname, 'lenses.ts'), 'utf8');

/**
 * **One word, one meaning** (ADR-0094 D2 / D-e).
 *
 * The Filter menu's "Has conflict" matched `visualConflict` **alone** while the Next-conflict
 * control, in the same `find` group one item away, counted the whole `CONFLICT_FLAGS` set. Nothing
 * was wrong in either file — the wrongness lived only in the relationship, which is why this is a
 * computed gate and not a paragraph (the ADR-0093 pattern, applied to the defect that
 * investigation would have found next).
 *
 * It was invisible in the shipped product because the count only appeared once a planner was
 * already cycling and the button lived in the `⋯`. Putting the count on the bar is what would have
 * exposed it: filter to "Has conflict", see fewer bars than the number promised, conclude the
 * product is broken.
 *
 * **Two assertions, not one, and the second is the load-bearing half.** The general check would
 * pass equally if `CONFLICT_FLAGS` were emptied — both sides would then agree on nothing, which is
 * agreement of the useless kind. The pinned positive case makes a degenerate state fail. That
 * shape is `selection-duplication.structural.test.ts`'s, and the reason is ADR-0081's: a green
 * suite must not be able to mean "the capability is gone".
 *
 * **Blind spot, stated rather than discovered.** These assertions prove the *rule* is sourced once.
 * They cannot prove the filter and the cycle read an equally **fresh** activity list — they are
 * wired through different hooks (`TsldPanel`'s `activities` prop against
 * `useConflictNavigation`'s argument), and only a real recalculation can show the two agreeing on a
 * live plan. That half belongs to the flag-on journey, and the two are the two halves of one proof.
 */
describe('the canvas filter has no second opinion about what a conflict is', () => {
  it('sources the predicate from CONFLICT_FLAGS rather than re-deriving it', () => {
    expect(SOURCE).toMatch(/import \{[^}]*CONFLICT_FLAGS[^}]*\} from '\.\/conflicts'/s);
  });

  it('never reads a conflict engine-flag field inside the attribute matcher', () => {
    // **Scoped to `matchesAttr`'s body, and that narrowing is a finding rather than a concession.**
    // The first version banned these strings file-wide and went red immediately — on `lenses.ts:415`,
    // where the UNRELATED over-allocation lens legitimately reads `levelingWindowExceeded` for its
    // own purpose. A file-wide ban would have forced that honest reader to work around this gate, or
    // (worse) got this gate deleted. The rule was only ever about the filter's predicate, so that is
    // what it now reads.
    const body = /function matchesAttr\([\s\S]*?\n\}/.exec(SOURCE)?.[0];
    expect(body, 'matchesAttr not found — this gate is reading the wrong thing').toBeTruthy();

    // The four fields a hand-rolled version would reach for: the one it used to read, and the three
    // a well-meaning "just add the others here" edit would add.
    for (const field of [
      'activity.visualConflict',
      'activity.constraintViolated',
      'activity.levelingWindowExceeded',
      'activity.totalFloat',
    ]) {
      expect(body).not.toContain(field);
    }
  });

  it('matches an activity carrying a NON-visual conflict — the case it used to miss', () => {
    // The pinned positive. Without it, emptying CONFLICT_FLAGS would satisfy every assertion above
    // by making the filter match nothing and the count count nothing.
    const base: MatchableActivity = {
      code: 'A100',
      name: 'Pour concrete',
      isCritical: false,
      constraintType: null,
      constraintViolated: true,
      visualConflict: false,
      levelingWindowExceeded: false,
    };
    const conflict = new Set<FilterAttr>(['conflict']);

    expect(matchesActivityFilter(base, '', conflict)).toBe(true);
    expect(CONFLICT_FLAGS.length).toBeGreaterThan(0);
  });
});
