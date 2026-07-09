# ADR-0009: Background processing with BullMQ + Redis

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Backend architecture

## Context

Blank App will need work done outside the request/response cycle: sending
reminders/notifications, scheduled and recurring generation, exports, and
retriable side effects. Doing these inline blocks requests, loses work on
failure, and can't be scheduled or retried reliably.

## Decision

Use **[BullMQ](https://docs.bullmq.io)** backed by **Redis** for background jobs
and scheduling, integrated via `@nestjs/bullmq`.

- **Producers** enqueue jobs from services; **processors** (workers) live in the
  owning feature module and are thin wrappers that call services — same layering
  as HTTP.
- **Reliability:** jobs are persisted in Redis, retried with exponential
  backoff, and moved to a dead-letter/failed set after max attempts. Handlers
  are **idempotent** (safe to run more than once).
- **Scheduling:** repeatable jobs (cron-like) drive recurring work.
- **Isolation:** the worker can run in-process now and be split into a separate
  deployment later without code changes (same image, different entrypoint).
- **Observability:** jobs carry the correlation ID; failures and durations are
  logged and counted (see `docs/OBSERVABILITY.md`).

## Alternatives considered

- **`pg-boss` (Postgres-backed queue)** — attractive (no extra service) and a
  reasonable fallback; we chose Redis/BullMQ for its mature scheduling,
  rate-limiting, concurrency controls, and ecosystem. Revisit if we want to
  avoid operating Redis.
- **Cloud-managed queues (SQS, etc.)** — ties us to a provider before the
  hosting platform is decided (see `docs/TECH_DEBT.md`). Deferred.
- **In-process `setTimeout`/cron only** — no durability, no retries, lost on
  restart. Rejected.

## Consequences

- **Positive:** durable, retriable, schedulable async work; keeps requests fast;
  worker scales independently.
- **Negative / risks:** introduces Redis as a dependency to operate (also used
  for caching, ADR-0010 — one Redis serves both initially). Handlers must be
  idempotent — enforced in review.
- Added to the local `docker-compose` stack when the first job lands (roadmap).

## References

- `docs/BACKEND_ARCHITECTURE.md` (Background processing), ADR-0010
