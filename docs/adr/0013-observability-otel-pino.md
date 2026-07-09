# ADR-0013: Observability with OpenTelemetry + Pino

- **Status:** Accepted
- **Date:** 2026-07-08
- **Deciders:** Backend architecture, DevOps

## Context

Operating Blank App for a decade requires being able to answer "what happened?" and
"why is it slow?" in production. We need structured logs, request correlation,
metrics, and traces — without coupling to a single vendor before the hosting
platform is chosen (`docs/TECH_DEBT.md`).

## Decision

- **Structured logging with [Pino](https://getpino.io)** via `nestjs-pino`.
  Logs are JSON, one event per line, with a **correlation ID** on every log and
  response (generated per request, propagated to jobs and outbound calls).
  Redaction of sensitive fields is configured at the logger.
- **Metrics and traces via [OpenTelemetry](https://opentelemetry.io) (OTel)** —
  the vendor-neutral standard. The app emits OTLP; a collector/backend
  (Prometheus/Grafana, Tempo, or a hosted equivalent) is chosen at deploy time.
  HTTP, Prisma, Redis, and BullMQ are auto-instrumented; key business events are
  traced/counted explicitly.
- **Health & readiness** endpoints via `@nestjs/terminus`: `/health` (liveness)
  and `/health/ready` (readiness — checks DB and critical dependencies) for the
  orchestrator.
- **Facade, not vendor SDKs.** Product code logs through the Nest logger and
  creates spans/metrics through OTel APIs; the concrete exporter/backend is
  configuration, so we can adopt or switch providers without code changes.

## Alternatives considered

- **A single vendor agent (Datadog/New Relic) baked in** — fast but lock-in and
  cost before the platform is decided. Rejected; OTel can export to them later.
- **Plain `console.log` / unstructured logs** — unqueryable, no correlation.
  Rejected.
- **Winston** — capable, but Pino is faster and the `nestjs-pino` integration
  gives per-request correlation cleanly. Chosen for performance + ergonomics.

## Consequences

- **Positive:** queryable, correlated logs; standard metrics/traces; portable
  across backends; liveness/readiness for safe rollouts.
- **Negative / risks:** OTel setup has moving parts; a collector must be run in
  each environment. Log volume and PII must be controlled (redaction, sampling)
  — see `docs/OBSERVABILITY.md` and `docs/SECURITY_STANDARDS.md`.

## References

- `docs/OBSERVABILITY.md`, `docs/BACKEND_ARCHITECTURE.md` (Observability)
