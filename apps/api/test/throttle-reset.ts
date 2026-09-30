import type { ThrottlerStorage } from '@nestjs/throttler';

/**
 * Empty the in-memory throttler between e2e tests.
 *
 * Per-handler throttle counters are shared mutable state across tests in one 60 s window, which
 * `docs/TESTING.md` forbids. Clearing them is isolation, not a weakened bound: every test still
 * runs its own requests under the real limit, and nothing in `apps/api/test` asserts a 429.
 *
 * **Why `storage.clear()` alone stopped being enough.** From `@nestjs/throttler@6.7.1` the service
 * keeps each hit's expiry in a private `hitExpirations` map and, on every increment, rewrites
 * `totalHits` from it (`pruneExpiredHits`, `dist/throttler.service.js:73-77`). A cleared `storage`
 * is therefore refilled with the previous test's count on the next request, and the staff suites
 * failed with 429s the day the bump landed. `hitExpirations` is private in the typings, hence the
 * structural cast; the registered claim in `scripts/dependency-claims.json` is what notices the
 * next time the library moves it.
 */
export function resetThrottleCounters(throttlerStorage: ThrottlerStorage): void {
  const service = throttlerStorage as unknown as {
    storage: Map<string, unknown>;
    hitExpirations?: Map<string, unknown>;
  };
  service.storage.clear();
  service.hitExpirations?.clear();
}
