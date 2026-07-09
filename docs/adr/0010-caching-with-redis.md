# ADR-0010: Caching strategy with Redis

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Backend architecture

## Context

Some reads will be hot and comparatively expensive (aggregations, reference
data, session/permission lookups). We want a caching approach that improves
latency and load without risking stale or incorrect sensitive data.

## Decision

Adopt a **cache-aside** strategy backed by **Redis**, behind a `CacheService`
abstraction (NestJS `CacheModule` with the Redis store).

- **Cache-aside:** read from cache; on miss, load from source, populate, return.
  Writes **invalidate** (not update) affected keys to avoid stale data.
- **Correctness first:** only cache data that tolerates its TTL's staleness.
  Authoritative computed results are computed from the database or cached
  with short TTLs and explicit invalidation on write.
- **Key discipline:** namespaced, versioned keys (e.g.
  `v1:organisation:{id}:summary`) via a key helper, so invalidation is precise and
  a schema change can bump the namespace.
- **TTLs are explicit** per use-case; no unbounded caches. Guard against
  stampedes on very hot keys (jittered TTLs / single-flight) where needed.
- **Layering:** caching lives in the service layer (or a decorator), never in
  controllers; the abstraction lets us fake it in tests and swap the store.

## Alternatives considered

- **In-memory (per-instance) cache only** — simple but inconsistent across
  instances and lost on restart; fine as an L1 in front of Redis later, not as
  the primary. Partially adopted (short-lived L1) only where safe.
- **Write-through/write-behind** — more moving parts and stale-write risk for
  little benefit at our scale. Rejected in favour of invalidate-on-write.
- **No caching** — acceptable until a measured hot path appears; we define the
  strategy now but **cache only when profiling justifies it** (see
  `docs/PERFORMANCE.md`). Measurement precedes caching.

## Consequences

- **Positive:** a consistent, correctness-preserving caching pattern ready when
  needed; lower latency/load on hot reads; testable behind an interface.
- **Negative / risks:** cache invalidation is hard — keep cached surfaces small
  and invalidation explicit; never cache authorization decisions longer than a
  session's freshness allows. Reuses the Redis introduced in ADR-0009.

## References

- `docs/PERFORMANCE.md`, `docs/BACKEND_ARCHITECTURE.md` (Caching), ADR-0009
