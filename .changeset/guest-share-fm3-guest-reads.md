---
'@repo/api': minor
---

feat(api): session-less External-Guest read surface (ADR-0051 F-M3)

Adds the app's **first unauthenticated data-read** endpoints — the session-less guest read path for a
share link. Every route is `@Public()` (bypasses the session guard) and instead resolves an
`Authorization: Bearer sp_share_<token>` header to its **one plan** via the existing `ShareTokenGuard`
(uniform 404 on any dead / revoked / expired / deleted-plan token — no oracle).

- `GET /api/v1/share/plan` — the plan header + its calendar (for the time axis) + the schedule summary
  (project finish, activity / critical / near-critical counts).
- `GET /api/v1/share/activities` — the plan's activities, **cursor-paginated**: id, code, name, type,
  duration, CPM early/late + actual dates, total float, `isCritical`, lane, and progress
  (`status`, `percentComplete`).
- `GET /api/v1/share/dependencies` — the plan's logic ties, **cursor-paginated**: id, predecessorId,
  successorId, type, lag.

**Anti-IDOR by construction:** the handlers take **only** the `GuestPrincipal` the guard resolved — the
plan id and organisation id come solely from the token, never from a request param/query/body (there are
none). Reads go through the existing org-scoped domain repositories, scoped only by the token's
`planId` + `organizationId`, and return **field-stripped, read-only** DTOs that carry **no**
cost / Earned-Value / money, resources / assignments, baselines / variance, notes, audit columns,
user identity, plan-lock holder, or token. Every response is served `X-Robots-Tag: noindex, nofollow`
and `Referrer-Policy: no-referrer`, and the surface carries a **tighter per-IP rate limit** (30 / 60 s)
than the global default (100 / 60 s), scoped to `/api/v1/share/*` only.

**Read-only, write-free of engine state:** it reads the persisted CPM columns (no engine invocation), so
the recalc parity gate is untouched. The single write is a best-effort, **coalesced** `last_accessed_at`
telemetry touch (`touchLastAccessedIfStale`, at most once per 5 min per link), fired-and-forgotten so it
never blocks or fails a read. A flagged web surface is F-M4.

**Rate-limit hardening (from the F-M3 security review):** the per-IP guest limit relies on Express
resolving the real client IP, so `configureHttpApp` now sets `trust proxy` from the existing
`TRUSTED_PROXY_IPS` config (the same source Better Auth already trusts) — without it, behind a reverse
proxy every request collapses onto the proxy IP and the per-IP bucket degrades into one shared global
bucket. Set only when proxies are declared (production); off in dev/test. The remaining multi-replica
gap (Nest `ThrottlerGuard` uses in-memory storage) is logged as tech-debt #49.
