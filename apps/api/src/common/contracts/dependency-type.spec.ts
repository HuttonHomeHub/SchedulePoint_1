import { DependencyType as PrismaDependencyType } from '@prisma/client';
import { DEPENDENCY_TYPES } from '@repo/types';
import { describe, expect, it } from 'vitest';

/**
 * Lock-step guard: the cross-boundary `DEPENDENCY_TYPES` const in `@repo/types`
 * must stay identical to the API's Prisma `DependencyType` enum. If a value is
 * added/removed/renamed on one side only, this fails — the two are the single
 * contract the web and the DB agree on (see @repo/types and ADR-0021).
 */
describe('DependencyType contract', () => {
  it('the shared DEPENDENCY_TYPES equals the Prisma DependencyType enum', () => {
    expect([...DEPENDENCY_TYPES].sort()).toEqual(Object.values(PrismaDependencyType).sort());
  });
});
