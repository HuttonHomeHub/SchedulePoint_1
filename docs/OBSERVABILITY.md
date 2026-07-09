# Observability Standards

> How Blank App is made observable in production. Backed by ADR-0013 (OpenTelemetry
> and Pino). Goal: answer _what happened_ and _why is it slow_ quickly, without
> vendor lock-in.

## Structured logging

- **JSON logs via Pino** (`nestjs-pino`) — one event per line, machine-parseable.
- **Levels:** `error` (needs attention / reported), `warn` (recoverable /
  degraded / expected 4xx), `info` (notable lifecycle events), `debug`
  (dev/troubleshooting, off in prod). No `console.log`.
- **Every log carries context:** `correlationId`, request method/route, and
  (when authenticated) a principal id — never PII.
- **Redaction is mandatory:** secrets, tokens, cookies, auth headers, and
  sensitive or PII fields are redacted at the logger. Log the _fact_, not the data.
- Logs are the operational record; the **audit log** is a separate, append-only
  security record (see [`SECURITY_STANDARDS.md`](SECURITY_STANDARDS.md)).

## Correlation IDs

- A **correlation ID** is generated per request (or taken from an inbound
  `x-request-id`/`traceparent`), attached to the request-scoped logger, and
  returned in the response header.
- It is **propagated** to background jobs (BullMQ) and outbound calls, so a
  single user action is traceable end-to-end across HTTP → worker → DB.

## Health & readiness

- **`GET /health`** — **liveness**: the process is up (fast, dependency-free).
  Used by the orchestrator to decide restarts.
- **`GET /health/ready`** — **readiness**: the app can serve traffic; checks
  critical dependencies (database, and cache/queue when present) via
  `@nestjs/terminus`. Used to gate rollout and load-balancer membership.
- Both are `@Public()` and must not leak internal detail beyond up/down + checks.

## Metrics

- **OpenTelemetry metrics** exported via OTLP to a backend chosen at deploy time
  (Prometheus/Grafana or hosted).
- **RED for every endpoint** (Rate, Errors, Duration) and **USE for resources**
  (Utilisation, Saturation, Errors). Plus key **business metrics** (e.g. jobs
  processed/failed, queue depth) named consistently.
- Instrument the meaningful things; avoid unbounded label cardinality (never use
  ids/PII as label values).

## Tracing

- **OpenTelemetry traces**; HTTP, Prisma, Redis, and BullMQ **auto-instrumented**.
  Spans carry the correlation/trace id; important business operations add
  explicit spans with useful attributes (no PII).
- Sampling is configurable (head/tail) to control volume while keeping error
  traces.

## Monitoring & alerting

- Dashboards for the golden signals (latency, traffic, errors, saturation) per
  service, plus queue depth and job failure rate.
- **Alert on symptoms** (error-rate/p95-latency SLO burn, readiness failing,
  queue backlog), not noise. Every alert is actionable and points to a runbook.
- SLOs are defined with real data once deployed (see
  [`PERFORMANCE.md`](PERFORMANCE.md) and `docs/TECH_DEBT.md`).

## Diagnostics

- Errors are reported with correlation id and safe context (no secrets); the
  client only ever sees a safe message + id (see error handling in
  [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md)).
- Graceful shutdown drains in-flight requests and jobs. Startup validates config
  and fails fast on misconfiguration.
- Debug logging can be raised per environment without a redeploy where possible.

## Facade, not lock-in

- Product code logs through the Nest logger and uses OTel APIs for spans/metrics.
  The concrete exporter/backend is **configuration**, so we can adopt or switch
  observability providers without touching product code.

## Definition of done (observability)

- [ ] New endpoints/jobs emit correlated, redacted structured logs
- [ ] Meaningful spans/metrics added for new critical paths
- [ ] Health/readiness updated if a new critical dependency is introduced
- [ ] No PII/secrets in logs, metrics labels, or spans
