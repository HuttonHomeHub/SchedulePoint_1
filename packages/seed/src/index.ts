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
// The fixture tier. It lived in `apps/seed-cli` until 2026-09-05, which made it the only tier of
// the four unreachable from anything but that CLI — an API e2e harness cannot import from an app.
// Its siblings were already here; this is the odd one out coming home, not a new capability.
export * from './fixture/index.js';
export * from './pairwise/index.js';
export * from './scale/index.js';
export * from './negative/index.js';
