import { describe, expect, it, vi } from 'vitest';

import { levelSchedule as legacyLevelSchedule } from '../../../../test/legacy-levelling/level-legacy';
import { digest, levelled, randomPlan } from '../../../../test/legacy-levelling/random-plan';

import { levelSchedule } from './level';

/**
 * **The shipped levelling pass against the one it replaced, plan by plan** (`docs/TECH_DEBT.md` #84).
 *
 * `level.contended.parity.spec.ts` freezes 60 hashes; this runs the legacy engine itself
 * (`test/legacy-levelling/`, the pass as it stood at 2a7f213a, outside the production build) beside the
 * shipped one on 300 further seeded random plans and compares every field of every result. Plans with
 * links run Pass C, which lifts a moved follower out of the profile and re-places it — the remove/re-add
 * sequence the block bookkeeping has to survive.
 *
 * It runs twice: at the profile's default block size, where only the larger plans fill more than one
 * block, and at a block size of 2, where every plan is split into many blocks and block boundaries land
 * on equal instants constantly. The size is overridden by wrapping the profile class in a mock, which is
 * the only way to reach it without a test-only parameter on `levelSchedule`.
 */

const blockSize = vi.hoisted(() => ({ value: undefined as number | undefined }));

vi.mock('./level-profile', async (importOriginal) => {
  const original = await importOriginal<typeof import('./level-profile')>();
  return {
    ...original,
    ResourceProfile: class extends original.ResourceProfile {
      constructor() {
        super(blockSize.value);
      }
    },
  };
});

const SEEDS = Array.from({ length: 300 }, (_, k) => 1001 + k);

for (const [label, size] of [
  ['the default block size', undefined],
  ['a block size of 2', 2],
] as const) {
  describe(`levelSchedule matches the legacy engine at ${label}`, () => {
    it('agrees on every field of every result for 300 seeded plans', () => {
      blockSize.value = size;
      const mismatched: number[] = [];
      for (const seed of SEEDS) {
        const plan = randomPlan(seed);
        if (digest(levelled(plan, levelSchedule)) !== digest(levelled(plan, legacyLevelSchedule))) {
          mismatched.push(seed);
        }
      }
      expect(mismatched).toEqual([]);
    }, 120_000);
  });
}
