import {
  SwimlaneLaneBasis as PrismaSwimlaneLaneBasis,
  SwimlaneSource as PrismaSwimlaneSource,
} from '@prisma/client';
import type { SwimlaneLaneBasis, SwimlaneSource } from '@repo/types';
import { describe, expect, it } from 'vitest';

/**
 * Lock-step between Prisma's generated enums and `@repo/types`'s unions, in both directions: a
 * member added to one side only fails the type check here, and the runtime assertion pins the
 * values themselves (the `PlacementSnapshotLevel` check in `baseline-response.dto.ts` is the
 * precedent).
 */
type MutuallyAssignable<A, B> = A extends B ? (B extends A ? true : false) : false;
const sourceLockStep: MutuallyAssignable<
  (typeof PrismaSwimlaneSource)[keyof typeof PrismaSwimlaneSource],
  SwimlaneSource
> = true;
const basisLockStep: MutuallyAssignable<
  (typeof PrismaSwimlaneLaneBasis)[keyof typeof PrismaSwimlaneLaneBasis],
  SwimlaneLaneBasis
> = true;

describe('swimlane enums', () => {
  it('match @repo/types member for member', () => {
    expect(sourceLockStep).toBe(true);
    expect(basisLockStep).toBe(true);
    expect(Object.values(PrismaSwimlaneSource).sort()).toEqual(['MANUAL', 'NONE', 'WBS']);
    expect(Object.values(PrismaSwimlaneLaneBasis).sort()).toEqual([
      'NO_SWIMLANE',
      'NO_WBS_SUMMARY',
      'SWIMLANE',
      'WBS_SUMMARY',
    ]);
  });
});
