# Performance & Scalability Standards

> Backend and system performance standards. Frontend performance lives in
> [`FRONTEND_QUALITY.md`](FRONTEND_QUALITY.md). Guiding rule: **measure before
> optimising; no un-measured claims.**

## Targets

- **API p95 < 200ms** for typical reads under expected load; p99 bounded.
- **Paginate every list endpoint**; cap page size server-side.
- Core Web Vitals (frontend) in the "good" band (see frontend docs).
- Concrete SLOs are set from real data once deployed (see `docs/TECH_DEBT.md`).

## Query optimisation (the first place to look)

- **Index for real query patterns** (`WHERE`/`JOIN`/`ORDER BY`/FK); verify with
  `EXPLAIN ANALYZE` (see [`DATABASE.md`](DATABASE.md)).
- **Kill N+1 queries:** use Prisma `select`/`include` deliberately; fetch what a
  use-case needs, no more. Batch where possible.
- **Never return unbounded result sets** — cursor pagination everywhere.
- Keep transactions short; do no network I/O inside them.
- Select only needed columns; avoid over-fetching wide rows.

## Caching (ADR-0010)

- **Cache-aside via Redis** for hot, expensive, staleness-tolerant reads;
  **invalidate on write**; explicit TTLs; namespaced/versioned keys.
- **Cache only when profiling shows a hot path** — premature caching adds
  correctness risk. Never cache authoritative computed results beyond safe
  bounds. Guard very hot keys against stampedes.

## Async processing & queueing (ADR-0009)

- **Move slow / retriable / scheduled work off the request path** into BullMQ
  jobs (notifications, exports, recurring generation). Requests stay fast.
- Jobs are **idempotent**, retried with backoff, concurrency-limited, and
  observable (queue depth, failure rate). The worker scales independently of the
  API.

## CPM recalculation (M6, ADR-0022)

The synchronous schedule recalculation is designed to hit the brief's targets
(< 500ms at 500 activities, < 2s at 2,000) with a fixed, predictable cost:

- **Two indexed loads, one batched write.** Under the plan-scoped lock it reads
  the plan's active activities and edges (both served by the `(plan_id, …)`
  indexes) and writes the whole plan's results in a **single raw `UPDATE … FROM
unnest($1::uuid[], …)`** — no per-row round trip, no N+1.
- **`O(V + E)` compute.** The pure engine (Kahn topo order + one forward + one
  backward pass) is linear in the graph size; the work is dominated by the two
  round trips, not the maths.
- **The write touches only the seven engine columns**, never `version` /
  `updated_at`, so it neither conflicts with nor invalidates cached user edits.
- **Working-day calendar: one more indexed load, near-log cost per call (M5,
  ADR-0024).** When the plan has a calendar, the recalc snapshot adds **one Prisma
  load** for its `working_weekdays` + active exceptions (two short indexed reads under
  Prisma's default relation strategy, served by `uq_calendar_exceptions_cal_date` —
  never a query-per-exception), and the calendar is **built once** and reused for
  every engine port call. `workingDaysBetween` is a single **O(log H)** count (`H` =
  exception count); `addWorkingDays` is a monotonic binary search over that primitive,
  **O(log(n + H) · log H)** — never a day-by-day scan, and sub-millisecond at realistic
  `n`/`H`, so a real calendar keeps the recalc inside the same budget even over
  multi-year spans. A **null calendar** skips the load entirely and schedules exactly
  as M6 (all-days-work). The engine's pass code is unchanged.
- **Scale ceiling:** when a plan outgrows the synchronous budget (or progress-
  aware re-forecasting lands), move to the queued path (ADR-0009) — the endpoint
  and service stay the same. A CI **structural** smoke at 500 activities (all-days
  **and** a real calendar) proves the whole plan computes and persists in one batched
  write; the wall-clock targets (< 500ms @ 500, < 2s @ 2,000) are measured
  **out-of-band**, not asserted on a shared CI runner where timing is too noisy to
  gate on.

## Profiling & measurement

- Use OpenTelemetry traces/metrics (see [`OBSERVABILITY.md`](OBSERVABILITY.md))
  to find real hot spots; profile the database with `EXPLAIN ANALYZE` and slow-
  query logs.
- **Establish a baseline, change one thing, measure again.** Optimisations land
  with before/after numbers in the PR. No speculative micro-optimisation.
- Load-test critical endpoints before claiming a capacity number.

## Scalability expectations

- **Stateless API:** no in-process session/state, so instances scale
  horizontally behind a load balancer. Shared state lives in Postgres/Redis.
- **Connection management:** a bounded Prisma/DB connection pool sized to the
  DB; a pooler (e.g. PgBouncer) in front when instance count grows.
- **Read scaling:** read replicas for read-heavy load when needed (routed
  explicitly); **write scaling** via careful indexing, batching, and async
  offload before considering partitioning.
- **Backpressure:** enforce timeouts, payload caps, pagination limits, and rate
  limits so load sheds gracefully rather than collapsing.
- **Graceful degradation:** a slow/absent cache or queue degrades performance,
  not correctness.

## Anti-patterns (flagged in review)

- Fetching-then-filtering in app code what the DB should filter/paginate.
- N+1 queries; missing indexes on filtered/sorted columns.
- Unbounded lists / missing pagination.
- Caching without an invalidation story, or caching authoritative/sensitive data.
- Doing slow/external work synchronously in a request.
- Optimising without a measurement.

## Definition of done (performance)

- [ ] List endpoints paginated; queries indexed and N+1-free
- [ ] Slow/retriable work offloaded to jobs where appropriate
- [ ] Any caching has explicit TTL + invalidation and is justified by profiling
- [ ] Perf-sensitive changes include before/after measurements
- [ ] No unbounded queries or payloads
