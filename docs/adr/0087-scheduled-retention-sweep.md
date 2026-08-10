# ADR-0087 — This application runs scheduled work, and its first job is a retention sweep

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** product owner (approved 2026-08-10, four clickable questions), engineering
- **Supersedes:** nothing. **Narrows:** ADR-0009 (background processing). **Builds on:** ADR-0085
  (privacy operations), ADR-0072/0073 (the append-only audit log), ADR-0075 (operational alerting),
  ADR-0086 (the staff console).
- **Spec / plan:** [`docs/specs/retention-sweep/`](../specs/retention-sweep/)

## Context

Two tables document a retention period and **nothing in the running system enforces either**.
`csp_reports` says 30 days
(`apps/api/prisma/migrations/20260809160000_csp_reports/migration.sql:15-19`) and `mail_events` says
12 months (ADR-0085 D3; restated at `20260809120000_mail_events/migration.sql:30-37`). Both
migrations say so in their own words — `csp_reports`' comment reads _"the true retention today is
forever"_ — and `docs/TECH_DEBT.md` #118 records it.

Two facts make this urgent rather than tidy:

1. **`csp_reports` is written by an unauthenticated endpoint.** `modules/csp/csp-report.controller.ts`
   is `@Public()` and answers 204 whatever arrives; `csp-report-body.ts:107-111` strips the query
   string and fragment but **not the path**, and the path is part of the dedup key. A caller who
   wants unique rows gets them by varying it: 20 reports/request × 60 requests/minute/IP =
   1.73 M rows/day, ≈600 MB/day at the migration's measured 348 B/row.
2. **`mail_events.recipient` holds a real customer address**, indefinitely — precisely what ADR-0085
   spent a whole decision keeping erasable. That migration says the table is deliberately ordinary,
   _"updatable, deletable, expirable — all three verbs are requirements"_. Today two are ever used.

And there is **no scheduler in this application at all.** ADR-0009 chose BullMQ + Redis and was never
implemented; `CLAUDE.md` §17 lists it among four accepted-but-unimplemented ADRs. Verified across
every `package.json` in the monorepo: no `@nestjs/schedule`, `node-cron`, `bullmq`, `ioredis`,
`croner`. So the first question is not "what period" but "what runs anything at all".

## Decision

### D1 — An in-process periodic sweep, `HeartbeatService`'s shape

One `setInterval`, `.unref()`'d, cleared in `onApplicationShutdown`, and **no timer created at all**
when disabled — the shape `common/operational/heartbeat.service.ts` already established here. No
Redis, no queue, no new dependency.

**Its costs, stated rather than discovered later:**

- **It runs per replica.** Two replicas sweep twice. That is harmless _for this job_ because the
  delete is idempotent and time-predicated: the second run finds what the first left, which is
  nothing. It would not be harmless for a job that sends, charges or emits.
- **It is not durable.** A restart loses the in-flight run; the next tick redoes it, because the
  predicate is "older than X" and not a work queue.
- **It has no retry.** A failed batch is retried by the next tick, for the same reason.

Each cost is acceptable **because of what this job is**, not because they are small. That
distinction is the whole of D2.

### D2 — ADR-0009 is narrowed, not superseded, and the trigger to reopen it is named

ADR-0009 chose BullMQ + Redis for background processing. This ADR does not replace that decision; it
records that **one job did not need it**. "We have a scheduler" must not become the answer to every
future background need.

**Reopen ADR-0009 the first time a job needs any of:** durability across a restart, retry with
backoff, exactly-once execution, fan-out to workers, a queue a request can enqueue onto, or
visible progress. A send, a charge, an export or an import is such a job. A sweep is not.

### D3 — The sweep may never touch `audit_events`, and ADR-0085 D3 stays unenforced

`audit_events` refuses `UPDATE` and `DELETE` in the database, by `BEFORE` triggers declared
`ENABLE ALWAYS` so the application role cannot bypass them
(`20260803170000_audit_events/migration.sql:110-122`). ADR-0085 D1 refused to relax them and gave the
reason: it converts a **structural** guarantee into a **procedural** one, changing the answer to
"could these rows have been altered?" from _"not by the application role"_ to _"only by the erasure
path, which we believe was used correctly"_.

So the sweep's table list is closed, and the exclusion is **structural** — a test asserting set
equality on the tables the sweep names, plus a source scan — not a convention somebody remembers.

**ADR-0085 D3's own retention period therefore remains unenforced**, and this ADR does not implement
it. That is a deliberate scope line the product owner took explicitly. Its consequence is stated in
§Consequences, because the day this merges several documents will say "retention is enforced" while
one period is still forever.

### D4 — No audit event, and the census structurally cannot hold this decision

ADR-0073's two tests, applied in writing:

- **Durability** — does the act leave something a reader must later explain? A swept row is
  deleted _because of a rule already recorded in an ADR and a migration comment_; the row's absence
  is the rule working, not an act somebody took.
- **Blast radius** — does it change what others may do? No. It changes nothing about anyone's
  permissions or any plan's content.

Both say no, and `OperationalModule`'s docblock is the on-point precedent: this is a machine acting
on a clock, not a person acting on data. `AuditService.record()` also fails its caller outside a
transaction (ADR-0073 C4), which would turn a logging fault into a failed sweep.

**The honest part:** the route census (`audit-coverage.structural.spec.ts`) reflects over
**controller metadata**, and a lifecycle hook has none — so the census can see this decision in
_neither_ direction. It is a recorded rule, not a gate, and calling it a gate would be the ADR-0072
`ENGINE_DERIVED` mistake repeated.

### D5 — On by default, operator-configurable

`RETENTION_SWEEP_ENABLED` defaults **true**; the two periods and the interval are operator variables.

The "ships inert until configured" precedent (`MAIL_ALERT_URL`, `HEARTBEAT_URL`) **deliberately does
not transfer.** Those need an external receiver, so shipping them armed would point at nothing; a
sweep needs nothing, and the periods are already decided by an accepted ADR. Default-off would
reproduce `docs/TECH_DEBT.md` #100 exactly — a mechanism that exists and reaches nobody — which is
the failure this repository has just spent an epic climbing out of.

It is cheap to say yes **now specifically**: both tables were created by `20260809` migrations, so
the first sweep on the deployed host deletes zero rows.

### D6 — `ctid`, not `id`, and that is a measured decision

The spec proposed `DELETE … WHERE id IN (SELECT id … ORDER BY … LIMIT n)`. **Measured, that
formulation is wrong**, and the measurement is the reason this task existed.

Postgres 17, local, `csp_reports` seeded to 500,000 rows / 207 MB and `mail_events` to
200,000 rows / 38 MB over 400 days — the shapes the two migrations measured:

| statement                 | csp 1,000  | csp 10,000                  | mail 1,000                   |
| ------------------------- | ---------- | --------------------------- | ---------------------------- |
| `id IN (SELECT id …)`     | 9.9 ms     | 160 ms — **Seq Scan** 499 k | 40.8 ms — **Seq Scan** 200 k |
| `ctid IN (SELECT ctid …)` | **5.6 ms** | **40.5 ms** — Tid Scan      | **3.8 ms** — Tid Scan        |

With `id IN`, the planner's **outer** lookup degrades to a sequential scan as the batch grows or the
table is small enough to make a hash join look cheap — so the delete becomes **O(table), not
O(batch)**, which is the one property a batched delete exists to guarantee. On the _smaller_ table it
was **10.8× slower**. With `ctid` the outer step is always a Tid Scan.

**`ctid` is used inside one statement and never persisted or carried between statements** — it is a
physical location and moves under `VACUUM`. Each batch re-selects, which is what makes that safe.

**The chosen defaults, from these numbers:**

- **Batch 1,000.** 100 rows costs 4.7 ms and 1,000 costs 5.6 ms — ten times the rows for 1.2× the
  time. 10,000 costs 40.5 ms and holds locks eight times longer for no throughput worth having.
- **Interval 1 hour.** The idle batch — the one that runs forever and finds nothing — measured
  **0.031–0.035 ms**. Frequency is effectively free; the constraint is the opposite one, that a rare
  sweep lets a flood's residue sit.
- **Per-run cap 50,000 rows** (50 batches ≈ 0.3 s). Enough to drain a day of ordinary growth in one
  tick, bounded so a pathological backlog cannot hold the connection for minutes.

The panel's read — oldest row, both tables — measured **0.020–0.027 ms** on Index Only Scans.

### D7 — No schema change, confirmed rather than assumed

Both migrations claim their index exists to serve this sweep. Confirmed: the batched inner select
runs `Index Only Scan using csp_reports_last_seen_at_id_idx` and
`Index Scan using mail_events_occurred_at_id_idx`. The conditional database-architect task the plan
opened (M0-T3) therefore **does not open**. Had it, it would have run unconditionally (§19.3).

### D8 — The console's leading answer is derived from the data, not reported by the sweep

`RetentionStatusStore` is in memory and resets on restart, so a last-run timestamp **cannot**
separate "the sweep is working" from "the sweep never armed" — the inverted-signal problem
`HeartbeatService` was built to solve one layer out, met again inside this feature. A panel that led
with `lastRunAt` would read healthiest exactly when the sweep had failed to start.

So `overdue` is computed from the age of each table's **oldest surviving row** against its period
plus one sweep interval. That is a fact about the database, true on a replica that has this instant
booted and true if this code has never run at all. The store's numbers are carried too, but as
detail behind that answer.

Two consequences worth stating. The grace is measured in **exact milliseconds**, not against the
floored day count the panel displays: at the default hourly interval the allowance is 1/24th of a
day, so comparing whole days would round it entirely away and report every table as overdue for an
hour out of every day, until the word stopped meaning anything. And there are **no counts** —
"how many rows are expired" is a full scan of a table this feature exists because it grows without
bound, run on every page load, answering a question no operator has. One index-forward `LIMIT 1` per
table answers the one they do.

It ships on the existing `GET /staff/health` response rather than a route of its own. A second route
earns a route-census entry and writes a second `staff.panel_read` audit row every time the page
loads; the cost is a mail-named DTO carrying retention, which the DTO's own docblock states rather
than leaving to be discovered.

### D9 — Three consecutive failures earn one alert, and what that cannot see is stated

A sweep that keeps failing POSTs once to the existing `MAIL_ALERT_URL`, after three consecutive
failed runs, latched until a clean run. One failure is not news: the next tick **is** the retry, and
a channel that fires on every blip gets muted — a muted channel being worth less than no channel,
because it is believed to be working (ADR-0075). A clean run closes the incident, so a sweep that
recovers and breaks again hours later alerts again; that is a new incident to whoever reads it.

The body carries the failure count and the table names and **nothing from a row**. This POST leaves
the system for a third-party chat service, which is data egress; `csp_reports` holds
attacker-controlled strings and `mail_events` holds a customer's address.

**What it cannot detect is a sweep that never armed** — no runs means no failures means no alert,
forever. That is D8's job, and the two are documented as primary and secondary detectors rather than
as one mechanism that happens to have a gap.

`OperationalAlertService.post()` was extracted verbatim to `postAlert` in `alert-dispatch.ts`. The
implementation plan named an injected `OperationalAlertDispatcher`; it shipped as a **function**, and
the departure is the point rather than a shortcut: a service adds a fourth constructor parameter to
`OperationalAlertService` and forces both construction sites in
`operational-alert.service.spec.ts` to change — and that spec is the before/after oracle for this
move (the ADR-0078 barrel-preserving-move argument). As a function it passes with **zero** edits.
Adding a `recordRetentionFailure` to a service whose whole vocabulary is mail was rejected outright:
the name would become a lie, which is how the next producer ends up somewhere worse.

**The threshold test found a real defect rather than confirming one.** A sweep that _threw_ recorded
itself with `record([], at)`, which finds no failed table in an empty list and therefore **reset**
`consecutiveFailures` to zero — so a sweep crashing on every tick was filed as a clean run, silencing
this threshold and painting the staff console healthy during the one failure mode nobody had
anticipated. `recordFailedRun` now says it explicitly, and both the store and the service pin it.

## Options rejected

- **BullMQ + Redis (ADR-0009 as written).** A queue, a broker, a new runtime dependency and an
  operational surface, to run one idempotent statement on a clock. Reopens at D2's named trigger.
- **`pg_cron`.** Requires a superuser to install the extension; this application's role is not one,
  and making it one to schedule a `DELETE` inverts the least-privilege posture of §14.
- **A host cron calling an endpoint.** The mechanism `scripts/watch-mail-failures.sh` is being
  retired _from_ — it runs outside the container, needs its own credentials and fails silently when
  the host changes.
- **A one-off manual `psql` cleanup.** Not a decision, a postponement; and it is exactly the
  unaudited-shell operation ADR-0086 exists to reduce.
- **`DELETE` with no batching.** One statement, one long transaction, unbounded lock hold on a table
  an unauthenticated endpoint writes to.

## Consequences

- **This application now runs scheduled work.** That is the significant part, and D2 exists so it
  does not silently become the answer to everything.
- **The panel's last-run state is per process** and resets on restart. That is why the staff
  console's primary signal is the **derived** one — oldest row age against the configured period —
  which is true whether or not any sweep code ever ran. A last-run timestamp alone cannot tell "the
  sweep is working" from "the sweep never armed", which is the `HeartbeatService` inverted-signal
  argument in a second place.
- **A mistyped period is irreversible.** Lengthening it afterwards recovers nothing — ADR-0085 D3's
  own asymmetry. Mitigated by a minimum of one day, a boot line naming the effective values, and the
  panel; not eliminated.
- **`docs/TECH_DEBT.md` #118 splits rather than closes.** Two of the three documented periods become
  enforced; ADR-0085 D3's does not.
- **The CSP period bounds staleness, not data age** (`docs/DATABASE.md:1481-1496`): `last_seen_at`
  moves on every repeat, so a violation still being reported never ages out, and its `document_uri`
  may carry a plan or organisation id in its path. The sweep bounds the residue **after** a flood
  stops; the per-IP throttle bounds a sustained one. Accepted and recorded rather than over-claimed.

## What this ADR does not do

It does not implement erasure (ADR-0085), does not touch the CPM engine, and adds no migration.
