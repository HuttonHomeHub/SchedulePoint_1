/**
 * `@repo/seed` — the pure, engine-free seed-plan substrate (ADR-0066).
 *
 * It knows how to **describe** a plan and never how to create one: no HTTP, no Prisma, no DTOs. That
 * split is what lets one spec feed both the HTTP seeder (`apps/seed-cli`) and the differential that
 * runs `computeSchedule` on the same inputs — the two halves whose disagreement is the whole point.
 *
 * See `docs/specs/seed-catalogue/feature-spec.md`.
 */
export * from './spec.js';
export * from './pairwise/index.js';
export * from './scale/index.js';
