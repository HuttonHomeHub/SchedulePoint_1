# Observability Standards

> How SchedulePoint is made observable in production. Backed by ADR-0013
> (OpenTelemetry and Pino). Goal: answer _what happened_ and _why is it slow_
> quickly, without vendor lock-in.
>
> **What is wired today:** structured Pino logging with correlation ids, and the
> liveness/readiness endpoints. **Metrics and tracing are not wired** — no
> OpenTelemetry dependency is installed. Those sections below are the standard
> we will implement against, not a description of the running system
> (`docs/ARCHITECTURE.md` §10). Treat them as binding when the work is done, not
> as something to cite as already true.

## Structured logging — wired

- **JSON logs via Pino** (`nestjs-pino`) — one event per line, machine-parseable.
- **Levels:** `error` (needs attention / reported), `warn` (recoverable /
  degraded / expected 4xx), `info` (notable lifecycle events), `debug`
  (dev/troubleshooting, off in prod). No `console.log`.
- **Every log carries context:** `correlationId`, request method/route, and
  (when authenticated) a principal id — never PII.
- **Redaction is mandatory:** secrets, tokens, cookies, auth headers, and
  sensitive or PII fields are redacted at the logger. Log the _fact_, not the data.
- Logs are the operational record. A separate append-only **audit log** is a
  standard we have not yet built — see
  [`SECURITY_STANDARDS.md`](SECURITY_STANDARDS.md).

### Correlation IDs — wired

- A **correlation ID** is generated per request (or taken from an inbound
  `x-request-id`/`traceparent`), attached to the request-scoped logger, and
  returned in the response header.
- When background processing arrives (ADR-0009), the id **propagates** into jobs
  and outbound calls so a single user action stays traceable end-to-end.

### Domain events worth logging

Structured, data-free logs on the paths where "what happened?" is hard to
reconstruct afterwards:

- **CPM recalculation** (ADR-0022): every recalculation emits
  `'schedule recalculated'` with `{ organizationId, planId, userId,
activityCount, criticalCount, constraintViolationCount, constraintWarningCount,
durationMs }` — enough to watch the performance NFR (`durationMs` vs plan size)
  and to spot mandatory constraints that broke logic
  (`constraintViolationCount`, ADR-0035 §7) or soft warnings
  (`constraintWarningCount`, N15) without logging any schedule data. The
  unreachable DAG-guard breach logs distinctly (a broken invariant) and surfaces
  as a 500.
- The same shape applies to any future long-running or invariant-guarded
  operation: counts and durations, never the payload.

## Health & readiness — wired

- **`GET /api/v1/health`** — **liveness**: the process is up (fast, dependency-free).
  Used by the orchestrator to decide restarts.
- **`GET /api/v1/health/ready`** — **readiness**: the app can serve traffic; checks the
  database (and any future critical dependency) via `@nestjs/terminus`. Used to
  gate rollout and load-balancer membership.
- Both are `@Public()` and must not leak internal detail beyond up/down + checks.

## Metrics — standard, not yet implemented

- **OpenTelemetry metrics** exported via OTLP to a backend chosen at deploy time
  (Prometheus/Grafana or hosted).
- **RED for every endpoint** (Rate, Errors, Duration) and **USE for resources**
  (Utilisation, Saturation, Errors), plus key **business metrics** (e.g. recalcs
  performed, imports committed) named consistently.
- Instrument the meaningful things; avoid unbounded label cardinality (never use
  ids or PII as label values).

## Tracing — standard, not yet implemented

- **OpenTelemetry traces**; HTTP and Prisma **auto-instrumented**. Spans carry
  the correlation/trace id; important business operations add explicit spans
  with useful attributes (no PII).
- Sampling is configurable (head/tail) to control volume while keeping error
  traces.

## Monitoring & alerting — **partly built, and shipped unwired**

**Two alert producers exist** and neither is a dashboard. Both post a JSON body
to an operator-supplied webhook via `postAlert`
(`common/operational/`), and both are **dormant by default**:

- `mail.send_failed` (ADR-0075) — one alertable event naming which of the three
  messages failed, to `MAIL_ALERT_URL`. Deliberately operator-facing rather than
  request-path: sending from application code before handing off to Better Auth
  would create an enumeration oracle.
- The **retention sweep** (ADR-0087 M4) — alerts after **three consecutive**
  failed runs, to `HEARTBEAT_URL`. Three, not one, because the next tick is the
  retry and a channel that cries wolf gets muted. It cannot detect a sweep that
  never armed; the staff console's derived `overdue` is the primary detector for
  that, because it reads the age of the oldest surviving row rather than a
  last-run timestamp that resets on restart.

**Both URLs are empty by default** — compose edits on the host — so until an
operator sets them, a broken relay and a failing sweep both reach nobody
(`docs/TECH_DEBT.md` #100, open on the operator half). Do not read "built" as
"in use" here.

Still **not built**: dashboards, SLOs and symptom-based alerting.

- Dashboards for the golden signals (latency, traffic, errors, saturation) per
  service.
- **Alert on symptoms** (error-rate/p95-latency SLO burn, readiness failing),
  not noise. Every alert is actionable and points to a runbook.
- SLOs are defined with real data once deployed (see
  [`PERFORMANCE.md`](PERFORMANCE.md) and [`TECH_DEBT.md`](TECH_DEBT.md)).

## Diagnostics

- Errors are reported with correlation id and safe context (no secrets); the
  client only ever sees a safe message + id (see error handling in
  [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md)).
- Graceful shutdown drains in-flight requests. Startup validates config (Zod)
  and fails fast on misconfiguration.
- Debug logging can be raised per environment without a redeploy where possible.

## Facade, not lock-in

- Product code logs through the Nest logger and will use OTel APIs for
  spans/metrics. The concrete exporter/backend is **configuration**, so we can
  adopt or switch observability providers without touching product code.

## Definition of done (observability)

- [ ] New endpoints emit correlated, redacted structured logs
- [ ] Long-running or invariant-guarded paths log counts + duration, not payloads
- [ ] Health/readiness updated if a new critical dependency is introduced
- [ ] No PII/secrets in logs, metrics labels, or spans
