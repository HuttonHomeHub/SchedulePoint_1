# Performance & Scalability Standards

> Backend and system performance standards. Frontend performance lives in
> [`FRONTEND_QUALITY.md`](FRONTEND_QUALITY.md). Guiding rule: **measure before
> optimising; no un-measured claims.**
>
> Sections marked **_not yet built_** describe how we will do something when we
> need it. There is no cache, queue or tracing in the running system
> ([`ARCHITECTURE.md`](ARCHITECTURE.md) §10) — do not cite them as available.

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

## Caching (ADR-0010) — _not yet built_

No cache layer exists; every read goes to Postgres. **This has not been a
problem**, which is the point of the second bullet: the standard for when we do
add one is —

- **Cache-aside via Redis** for hot, expensive, staleness-tolerant reads;
  **invalidate on write**; explicit TTLs; namespaced/versioned keys.
- **Cache only when profiling shows a hot path** — premature caching adds
  correctness risk. Never cache authoritative computed results beyond safe
  bounds. Guard very hot keys against stampedes.

## Async processing & queueing (ADR-0009) — _not yet built_

**There is no queue and no worker. That is not the same as "all work is
synchronous", and this section said so until the 2026-08-25 reconciliation
pass** — the identical sentence was corrected in `ARCHITECTURE.md` §10 on
2026-08-18 and left standing here, which is the "patch the gate in front of you
and leave its siblings" failure this repository's runbook warns about.

Since ADR-0087 the API runs **scheduled work**: a retention sweep on one
`setInterval`, `.unref()`'d, with no timer when disabled and no Redis, queue or
new dependency. Its costs are stated rather than hidden — **per replica,
non-durable, no retry** — and each is accepted _because of what that job is_:
idempotent and time-predicated, so a second run finds nothing and a restart is
repaired by the next tick. ADR-0009 is **narrowed, not superseded**; ADR-0087 D2
names the triggers that reopen it (durability, retries, exactly-once, fan-out,
enqueue-from-a-request, visible progress) so "we have a scheduler" does not
become the answer to every future background need.

The candidate first consumer for a real queue is schedule-interchange import.
The standard for when it lands:

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
- **The write touches only the eleven engine columns** (the seven CPM columns plus
  the four ADR-0033 effective-Visual outputs — `visual_effective_start/finish`,
  `visual_conflict`, `visual_drift_days`), never `version` / `updated_at`, so it
  neither conflicts with nor invalidates cached user edits. The engine's second,
  forward-only effective-Visual pass adds an O(V+E) traversal (~+8.5 ms measured at
  2,000 activities — well within budget); it currently runs on every recalc, and is a
  candidate to mode-gate to `VISUAL` plans once the mode is settable (ADR-0033 M3).
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
- **Per-relationship lag calendar: zero cost on the default path, near-log per
  overridden edge (M3, ADR-0036 §6).** Each edge's lag is measured on its lag
  calendar. For the default (`PROJECT_DEFAULT`/`PREDECESSOR`/`SUCCESSOR`, which all
  coincide with the plan calendar today), `applyLag` short-circuits to the literal
  `anchor + lag` arithmetic — **no calendar round-trip**, so a plan with no `24-hour`
  lag pays exactly what it did before M3. A `TWENTY_FOUR_HOUR` edge measures the lag as
  elapsed time on the shared 24/7 `allMinutesWorkCalendar` **singleton** (never a
  per-edge allocation): a bounded handful of **O(log)** calendar-port calls
  (`addWorkingTime` + `workingTimeBetween`, both binary-search — never a per-minute
  scan), horizon-capped (ADR-0036 §5) so even a ±14-year lag terminates. `loadEdges`
  adds `lag_calendar` to its existing single `select` — a plain enum column, no join,
  no extra query.
- **Scale ceiling:** when a plan outgrows the synchronous budget (or progress-
  aware re-forecasting lands), move to the queued path (ADR-0009) — the endpoint
  and service stay the same. A CI **structural** smoke at 500 activities (all-days
  **and** a real calendar) proves the whole plan computes and persists in one batched
  write; the wall-clock targets (< 500ms @ 500, < 2s @ 2,000) are measured
  **out-of-band**, not asserted on a shared CI runner where timing is too noisy to
  gate on.

## Baselines: capture & variance (M7, ADR-0025)

- **Capture** freezes the plan's currently-persisted computed activities in one
  **batched `createMany`** under the plan write-lock — no per-row round trips, so a
  2,000-activity plan is a single bulk insert (target: capture < 5s p95 at 2,000).
- **Variance** (`GET …/baselines/variance`) is a **bounded, plan-scoped read**, not
  cursor-paginated: three indexed loads (the active baseline, its snapshot rows, the
  plan's live activities) plus **one** working-day calendar build (reused for every
  row, O(1)/O(log H) per call, ADR-0024), then an **O(n) in-memory join** on
  `source_activity_id` (the `(baseline_id, source_activity_id)` index serves the
  snapshot side). No N+1, no per-activity calendar rebuild (target: variance < 300ms
  p95 at 2,000). A CI structural smoke at 500 activities proves the whole plan's
  variance serves in one read; wall-clock is measured out-of-band as above.

## Profiling & measurement

- Profile the database with `EXPLAIN ANALYZE` and slow-query logs — this is the
  tool that is actually available, and it is the one that has found every
  measured win so far (e.g. the GROUP-delete advisory-lock loop, ~830 ms → ~13 ms
  by batching into one `unnest`).
- OpenTelemetry traces/metrics (see [`OBSERVABILITY.md`](OBSERVABILITY.md)) are
  **not wired**, so there is no production hot-spot data. Until they are,
  measure locally against realistic row counts and put the numbers in the PR.
- **Establish a baseline, change one thing, measure again.** Optimisations land
  with before/after numbers in the PR. No speculative micro-optimisation.
- Load-test critical endpoints before claiming a capacity number.

## Scalability expectations

- **Stateless API:** no in-process session/state, so instances scale
  horizontally behind a load balancer. Shared state lives in Postgres today.
  **One caveat:** Better Auth's rate-limit store is in-process memory, so it
  becomes per-replica the moment a second instance runs (TECH_DEBT #14) — back
  it with Redis before scaling out.
- **Connection management:** a bounded Prisma/DB connection pool sized to the
  DB; a pooler (e.g. PgBouncer) in front when instance count grows.
- **Read scaling:** read replicas for read-heavy load when needed (routed
  explicitly); **write scaling** via careful indexing, batching, and async
  offload before considering partitioning.
- **Backpressure:** enforce timeouts, payload caps, pagination limits, and rate
  limits so load sheds gracefully rather than collapsing.
- **Graceful degradation:** when a cache or queue exists, a slow or absent one
  must degrade performance, not correctness.

## Anti-patterns (flagged in review)

- Fetching-then-filtering in app code what the DB should filter/paginate.
- N+1 queries; missing indexes on filtered/sorted columns.
- Unbounded lists / missing pagination.
- Caching without an invalidation story, or caching authoritative/sensitive data.
- Doing slow/external work synchronously in a request.
- Optimising without a measurement.

## Definition of done (performance)

- [ ] List endpoints paginated; queries indexed and N+1-free
- [ ] Slow/retriable work identified (no queue exists yet — say so rather than
      hiding a slow synchronous path)
- [ ] Any caching has explicit TTL + invalidation and is justified by profiling
- [ ] Perf-sensitive changes include before/after measurements
- [ ] No unbounded queries or payloads
