import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The forward cross-plan bound reads PLACED dates; the backward one reads LATE dates, and the
 * asymmetry is deliberate** (one-planning-surface M-H).
 *
 * Forward: an interface is about where the upstream work is **planned to happen**, which since the
 * collapse is `visualEffective*` — the answer a downstream planner would give if asked when the
 * handover is.
 *
 * Backward: `successorLate*` is Pass 1's backward answer, the latest the network tolerates. **There
 * is no such thing as a placed late finish.** A placement is a statement about where work is planned
 * to START; it is not an input to the backward pass at all, so a "placed late" basis names nothing.
 *
 * A reader tidying the forward rename into a matching pair would invent exactly that — plausibly,
 * in one commit, with every test still green, because both halves would be internally consistent.
 * So the negative is asserted rather than left to a comment.
 *
 * **There are TWO producers of the forward bound** and they must move together: the repository
 * (production) and the conformance adapter. If only one switched, the harness would measure a rule
 * the product does not run and say nothing about it, because each side is internally consistent —
 * which is the ADR-0065 drift argument, and the reason FC-9 clause 3 asks for this.
 */

const read = (path: string): string => readFileSync(join(__dirname, path), 'utf8');

const REPOSITORY = '../cross-plan-dependencies/cross-plan-dependency.repository.ts';
const DERIVATION = './cross-plan-derivation.ts';
const ADAPTER = './conformance/cross-plan-adapter.ts';

describe('the cross-plan forward bound reads placed dates', () => {
  /**
   * **Both producers, asserted together.** The repository selects the columns; the adapter projects
   * the engine result. Splitting these into two cases would let one pass while the other regressed,
   * which is the state this file exists to refuse.
   */
  it('the repository selects visualEffective*, never early*', () => {
    const src = read(REPOSITORY);
    expect(src).toMatch(/visualEffectiveStart:\s*true/);
    expect(src).toMatch(/visualEffectiveFinish:\s*true/);
    // The backward load legitimately selects late dates, so the negative names the FORWARD
    // predecessor include precisely rather than banning `earlyStart` from the file.
    expect(src).not.toMatch(/predecessor:\s*\{\s*select:\s*\{\s*earlyStart/);
  });

  it('the conformance adapter projects the placed span, never the early one', () => {
    const src = read(ADAPTER);
    expect(src).toMatch(/placedStart:\s*result\.visualEffectiveStart/);
    expect(src).toMatch(/placedFinish:\s*result\.visualEffectiveFinish/);
    expect(src).not.toMatch(/predecessorPlacedStart:\s*pred\?\.earlyStart/);
  });

  it('the forward edge names its fields for what they hold', () => {
    for (const path of [REPOSITORY, DERIVATION, ADAPTER]) {
      const src = read(path);
      expect(src, `${path} still names the forward bound "early"`).not.toMatch(
        /predecessorEarly(Start|Finish)\s*[:,)]/,
      );
    }
  });
});

describe('the backward cross-plan bound is NOT renamed', () => {
  /**
   * **The negative guard, and it is the reason this file exists rather than a comment.** Verified
   * red by renaming `successorLateStart` → `successorPlacedStart` in `cross-plan-derivation.ts`:
   * typecheck stays clean once the three call sites follow, every existing suite passes, and the
   * product silently claims a basis that has no meaning.
   */
  it('the outgoing edge still reads successorLate*', () => {
    const src = read(DERIVATION);
    expect(src).toMatch(/successorLateStart/);
    expect(src).toMatch(/successorLateFinish/);
  });

  it('no "placed" spelling reaches the backward side', () => {
    for (const path of [REPOSITORY, DERIVATION]) {
      const src = read(path);
      expect(src, `${path} invents a placed LATE basis`).not.toMatch(/successorPlaced/);
    }
  });

  /**
   * The pinned positive: every assertion above is satisfied by a repository in which cross-plan
   * derivation does not exist at all (ADR-0093's shape). This is the one case that fails if the
   * forward bound is deleted rather than merely renamed.
   */
  it('both bounds exist', () => {
    const src = read(DERIVATION);
    expect(src).toMatch(/predecessorPlacedFinish/);
    expect(src).toMatch(/successorLateStart/);
  });
});
