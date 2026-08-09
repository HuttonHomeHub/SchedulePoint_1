> # ⚠ SUPERSEDED by the staff console (ADR-0086), 2026-08-09
>
> **Not deleted, because one third of it survives and deleting the document would take that with
> it.** This spec's central constraint was "there is no system administrator", and the staff console
> overturned exactly that — so two of its three milestones are subsumed and the third is not:
>
> | This spec                              | Fate                                                                                                                                                                                                                                                                                                                            |
> | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | **M-A** CSP report sink                | **Subsumed** by staff-console M4. Built, plus a Security panel that reads it — which this spec ruled out on the grounds that there was no principal for a system-wide read.                                                                                                                                                     |
> | **M-B** Mail failure alerting          | **Subsumed** by staff-console M1. Built as `MAIL_ALERT_URL`, plus the heartbeat this spec did not propose.                                                                                                                                                                                                                      |
> | **M-C** Unverified members, org-scoped | **SURVIVES, and is not in that epic.** It is genuinely organisation-scoped — an Org Admin asking about their own organisation's members — so it needs no staff principal and belongs on the members screen. The staff console's Accounts panel is a different thing: installation-wide, staff-only, and no use to an Org Admin. |
>
> Read the rest for the reasoning; act on `docs/specs/staff-console/` for anything but M-C.

# Implementation Plan: Operational self-service

> **Status:** Draft — awaiting approval alongside `feature-spec.md`.
> **Sequencing decision already taken by the product owner (2026-08-09):** the CSP flip is done
> **manually first** from `docs/DEPLOYMENT.md`, closing TECH_DEBT #8 this week. This epic is built
> afterwards, for the recurring value rather than for that one flip.

## Breakdown

### Epic

Make the two **recurring** operational questions answerable by the product instead of by a person on
the host, and make the one org-scoped support question answerable by an Org Admin.

Explicitly **out of scope**, with the reason: the email-verification backfill. It is a system-wide
irreversible write and there is no global principal in the role model to perform it (spec §3). It
stays a `psql` script and the runbook stays the way it is done.

---

### Milestone A — CSP report sink (shippable slice)

The highest-value piece and the one that changes how a policy decision is made.

#### Feature: the endpoint

##### Task A1 — `csp_reports` table + migration (≈ one PR)

- Deduplicated on `(effective_directive, blocked_uri, document_uri)`, carrying `count`,
  `first_seen_at`, `last_seen_at`.
- **Ordinary table, not append-only.** Stated in the migration comment, because the reflex in this
  repository after ADR-0072 is to reach for the audit-log shape. This is telemetry about a policy,
  not evidence about a person: it is meant to be expired.
- **Risk:** a unique index on three free-text columns. `blocked_uri` can be long. Cap and truncate
  at write, hash for the index if the measured lengths warrant it — measure before choosing.
- **Tests:** the dedup upsert increments rather than inserts; truncation is deterministic.

##### Task A2 — `POST /api/v1/csp-report`, public and throttled

- `@Public()` + `@Throttle` per the `share-guest.controller.ts:66` precedent.
- Accepts both report shapes — the legacy `report-uri` body (`application/csp-report`) and the
  newer `report-to` batch (`application/reports+json`). **Do not assume one:** support differs by
  browser, and the practical answer is usually to emit both directives. Establish which each engine
  actually sends before claiming coverage.
- Always `204`. Body cap. Unparseable bodies are dropped silently, not 400'd.
- **Tests:** both body shapes; oversized body; malformed body; throttle trips.

##### Task A3 — the policy carries the directives

- Add `report-uri` **and** `report-to` (plus the `Reporting-Endpoints` header) to `CSP_POLICY` in
  both compose files.
- **`apps/web/e2e-csp/` parses the policy out of `docker-compose.yml` rather than restating it**
  (ADR-0074), so it will see the new directives automatically — check that it does not now fail on
  a directive it does not expect. That suite is the reason this task is not a one-line edit.

##### Task A4 — reading them, and expiring them

- An operator read: a documented `psql` query, or a small CLI in `apps/seed-cli`'s shape. **Not an
  in-app screen** — spec §3, there is no principal for a system-wide read.
- A retention sweep at the decided window.
- **Open decision to confirm before this task:** the retention period (14 or 30 days proposed).

---

### Milestone B — Mail failure alerting

#### Task B1 — `AlertService` + wiring on the existing failure path

- Hooks `event: 'mail.send_failed'` where it is already emitted
  (`common/mail/smtp-mail.service.ts`); no new failure detection.
- **Fire-and-forget, never awaited.** ADR-0075 rejected a synchronous mail failure because it would
  create an enumeration oracle on sign-up; an awaited alert reintroduces exactly that latency and
  failure coupling. Bounded timeout, errors swallowed to a log line.
- Names the message kind and a count. **Never the recipient address** — this goes to a chat channel.
- No URL configured ⇒ no behaviour change at all, which is the rollback contract.
- **Tests:** a failing send triggers one alert; a failing alert does not fail the send; absent
  config is inert.

##### Task B2 — coalescing

- A broken relay fails every send. Alert on the first failure in a window, then a summary — not one
  POST per send. Window reuses the existing debounce idiom rather than inventing a scheduler.

> **The cron does not go away**, and the plan says so rather than letting it be assumed: an app
> cannot alert that it is down, and `watch-mail-failures.sh`'s "cannot read logs" branch covers
> exactly that. B1 replaces the mail-failure half; the liveness half stays external.

---

### Milestone C — Unverified members (org-scoped)

#### Task C1 — `verified` filter on the members list

- `GET …/organizations/:slug/members?verified=false`, `ORG_ADMIN`, own organisation, existing
  org-scope guard. No new permission.
- **Tests:** cross-org returns 404 (not 403), per the repo's standing rule.

#### Task C2 — the members table surfaces it

- A filter and a column. Empty state when nobody is unverified — which is the common case and
  therefore the state to design first.
- Resend-verification on the row where permitted.

## Sequencing & slices

A → B → C, and each is independently shippable and independently useful. A is first because it is
the only one that changes a **decision** rather than a chore.

C is deliberately last: it is the smallest, and its value only begins once
`AUTH_REQUIRE_EMAIL_VERIFICATION` is on — which is step 3 of the manual runbook and has not happened
yet.

## Definition of Done (per task)

The standard gate — `pnpm lint && typecheck && test`, plus `scripts/e2e-local.sh api` for A2/C1
since they touch `apps/api`, plus a changeset for anything user-visible (C only; A and B are
operator-facing and ship no UI).

## Risks & assumptions (rollup)

| Risk                                                                                                | Handling                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **A public unauthenticated POST endpoint is an abuse surface.** Anyone can send fabricated reports. | Throttle, body cap, dedup, retention. Accept that reports are untrusted input and never render them as HTML.                    |
| Report volume from a single misconfiguration swamps the table.                                      | Dedup is in A1, not a later optimisation — it is the design, not a tuning knob.                                                 |
| The two report body shapes are assumed rather than verified.                                        | **Marked as unverified in the spec.** A2 establishes it by observation before the task claims coverage.                         |
| `e2e-csp` breaks on the new directives.                                                             | A3 owns it; that suite parses the real policy, which is what makes it valuable and also what makes it sensitive to this change. |
| Building this delays nothing operational.                                                           | By design — the manual flip happens first and closes #8 independently.                                                          |

## What this plan does not claim

The value case for A and B is **recurring**; for C it is real but small. Nothing here is urgent —
the manual runbook closes all three debt rows this week without any of it. This epic is worth
building because the next CSP change, and the next broken relay, should not cost a person an
evening.
