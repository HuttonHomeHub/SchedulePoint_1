# ADR-0051: External-Guest per-plan share links

- **Status:** Accepted
- **Date:** 2026-07-21
- **Deciders:** Backend architecture, Security, Product
- **Related:** ADR-0003 (Better Auth), ADR-0012 (RBAC + resource scoping), ADR-0016
  (identity & tenancy; "External Guest modelled separately"), ADR-0028 (plan
  edit-lock / pen). Feature spec: `docs/specs/external-guest-share-link/`.

## Context

The product defines five roles (`docs/PROJECT_BRIEF.md` §5). Four —
`ORG_ADMIN / PLANNER / CONTRIBUTOR / VIEWER` — are **organisation memberships**
and are modelled by the `OrganizationRole` enum + the role→permission matrix
(`apps/api/src/common/auth/org-permissions.ts`, ADR-0012/0016). The fifth,
**External Guest**, is explicitly **NOT** a member role. ADR-0016 records it as
"modelled separately (a future ADR)"; `principal.ts` repeats the note. This is
that ADR.

An External Guest is someone **outside the organisation** — a client's owner
rep, a subcontractor — who needs **read-only** access to **exactly one plan**
(its canvas / activities / logic / schedule) via a **share link**, with **no
Better Auth account and no organisation membership**. The brief requires the link
to be **revocable**, **optionally time-limited**, **not indexable**, and to
support an **optional access log** (`docs/PROJECT_BRIEF.md` §13).

The forces:

- **The existing authorisation model is membership-scoped.** `Principal.can(perm,
orgId)` answers "does this user hold this permission **in the org that owns the
  resource**?" A guest has no membership, so it cannot be expressed as a
  `Principal` without synthesising a fake membership — a foot-gun for IDOR.
- **The existing authentication seam is session-based** (ADR-0003). Every
  protected request resolves a Better Auth session cookie → `Principal`. A guest
  has no session; the whole point is an outsider with no login.
- **A share URL is a bearer credential.** Whoever holds the link holds the
  access. URLs leak — via the HTTP `Referer` header to third-party assets, via
  browser history, bookmarks, and server access logs. The design must minimise
  that leak and make the credential cheap to revoke.
- **Anti-IDOR is paramount.** The token must dereference to **one** plan; a guest
  must never be able to enumerate or reach another plan or another organisation.

We already have a strong, proven precedent for a hashed-at-rest bearer token: the
organisation **invitation** token (`apps/api/src/modules/invitations/token.ts` +
the `Invitation.tokenHash` unique column). We reuse its shape.

## Decision

We will model an External Guest as a **revocable, hashed, per-plan share grant**
— a new `PlanShare` row — dereferenced by a **session-less bearer token**, and
enforced by a **parallel `GuestPrincipal` + `ShareTokenGuard`** that is
**structurally distinct** from the member `Principal`. A share link is **not** an
organisation membership and **not** a role; it is a separate grant with its own
narrow, read-only capability.

### 1. The grant: a `PlanShare` row

A new organisation-scoped table (full house standards: UUID v7 PK, snake_case
`@map`, timestamptz UTC, soft delete, audit, `version`):

```
PlanShare
  id               uuid pk
  plan_id          uuid  fk → plans.id (ON DELETE RESTRICT)     -- the ONE plan this grants
  organization_id  uuid  -- denormalised from the plan (copied by the service, never input)
  token_hash       text  unique                                  -- SHA-256(raw token); raw is never stored
  label            text? -- optional human label ("Client review – Acme") for the management list
  expires_at       timestamptz?  -- NULL = no expiry (optional TTL)
  revoked_at       timestamptz?  -- NULL = live; set = immediately dead
  last_accessed_at timestamptz?  -- best-effort telemetry (coalesced write; §7)
  version, created_at/by, updated_at/by, deleted_at  -- house standards
```

- A plan may have **many** share links (each independently revocable). No
  one-active-per-plan invariant.
- **`plan_id` is denormalised nowhere else needed** — the row lives directly on
  the plan, so the plan-cascade soft-delete (HierarchyLifecycleService) stamps
  `plan_shares.deleted_at` in the same batch as the plan (ADR-0046 note
  precedent). A deleted plan's links therefore stop resolving automatically.
- Indexes: `unique(token_hash)` (the lookup); `(plan_id)` where `deleted_at IS
NULL` (list a plan's links; also the cascade filter); `(organization_id)` for
  scoped audit.

### 2. The token: minted random, stored hashed, presented as a bearer

- **Mint** a 256-bit random token (`randomBytes(32).toString('base64url')`),
  prefixed `sp_share_` for identifiability in logs/leak-scanners. Store **only**
  its `SHA-256` hash; return the raw token **once** in the create response. This
  is byte-for-byte the invitation-token pattern — we extract the shared helper to
  `common/tokens/` and reuse it (a database leak never yields a usable token).
- 256 bits of entropy makes **link-guessing** computationally infeasible;
  brute-force is further blunted by rate-limiting (§6).
- **Presentation — the token rides in the URL _fragment_, not the path/query, and
  reaches the API only as an `Authorization: Bearer` header.** The public guest
  URL is `https://<app>/share#<token>`. The SPA reads `window.location.hash`, and
  every guest API call sends `Authorization: Bearer sp_share_<token>`. Rationale:
  a URL **fragment is never transmitted to any server** (not in the request line,
  not in the `Referer` header), so the token never lands in web-server access
  logs, API access logs, or a referrer to a third-party asset. This is the
  strongest mitigation for the two worst leak vectors (referrer + server logs).
  Bookmarks/history still hold the full link (inherent to any "anyone-with-the-
  link" share) — mitigated by cheap revocation and optional expiry.
- The guest view is served **`noindex`** (`X-Robots-Tag: noindex, nofollow`) and
  **`Referrer-Policy: no-referrer`** so it is neither crawled nor a referrer leak
  source (brief §13 "must not be indexable").

### 3. The identity: a distinct `GuestPrincipal`, never a synthesised `Principal`

We introduce a separate request identity type:

```
class GuestPrincipal {
  readonly shareId: string;
  readonly planId: string;         // the ONE plan
  readonly organizationId: string; // its owning org (for scoped repo reads)
  readonly scope: 'SCHEDULE_READ'; // v1 fixed; reserved for future scopes (§4)
}
```

It is **structurally incompatible** with `Principal` (no `memberships`, no
`can()`). A `ShareTokenGuard` resolves the Bearer token → `PlanShare` row →
`GuestPrincipal`, or throws **404** (§5). Guest controllers are `@Public()` (they
bypass the global session `AuthenticationGuard`) and instead carry
`@UseGuards(ShareTokenGuard)`.

**Why a parallel type, not a synthesised read-only `Principal` with a fake
membership:** a synthesised membership would make guest requests eligible to flow
through **member** service methods (`organizations.resolveScope(principal,
orgSlug)`, `principal.can('plan:read', orgId)`) — one missed check and a guest
could reach member surfaces. A distinct type makes that a **compile error**: no
member method accepts a `GuestPrincipal`. Guest reads live in a dedicated `share`
module whose service loads the plan by **the token's own `planId`** and calls the
existing **repositories** (Plan/Activity/Dependency/Schedule reads) scoped by the
token's `organization_id` + `plan_id` — **never** from any guest-supplied id.
Deny-by-default is preserved by construction.

### 4. The scope: a fixed, read-only "schedule read" surface (v1)

A guest may read, for **their one plan only**:

- Plan header (name, status, `plannedStart`/data date, description) and its
  **calendar** (to render the time axis).
- **Activities** (name, type, computed early/late/actual dates, duration, total
  float, `isCritical`, lane/position) — including **progress** (status, %
  complete, actual dates), because a status share is the point of the "client
  review" journey (brief §10 journey 3).
- **Dependencies** (the logic ties) and the **schedule summary** (project finish,
  critical path).

A guest may **never** read: any other plan or the org roster/hierarchy;
**cost / Earned Value** (`cost:read` is Planner+Admin only — commercially
sensitive; excluded by omission, never wired into the guest surface);
**resources / histogram**, **baselines / variance**, and **notes** (internal team
data) are **out of scope for v1** (default-exclude; each is a candidate future
opt-in scope). Audit fields (`createdBy`/`updatedBy`), the plan-lock holder's
identity, and any user identity are stripped from guest DTOs.

`GuestPrincipal.scope` is fixed to `SCHEDULE_READ` in v1 and reserved so a future
`PlanShare.scope` column can widen a specific link (e.g. `+RESOURCES`) without a
model change. **A guest never writes** — there is no guest write path, the guest
never acquires a pen (ADR-0028), and the recalc parity gate is untouched.

### 5. Revocation, expiry & the deleted-plan interaction

`ShareTokenGuard` resolves a token only when **all** hold: `token_hash` matches;
`revoked_at IS NULL`; `deleted_at IS NULL`; (`expires_at IS NULL OR expires_at >
now()`); **and** the referenced plan is itself active (`plans.deleted_at IS
NULL`). Any failure → a **uniform `404 Not Found`** (never 401/403) so the guest
path leaks nothing about whether a token ever existed, is expired, or was revoked.

- **Revoke** = set `revoked_at = now()`. Effect is **immediate**: the very next
  guest request fails resolution → 404. No caching of resolved tokens in v1
  (revocation latency = one request).
- **Expiry** is optional per link; enforced at resolve time.
- **Plan soft-delete** cascades `deleted_at` onto its `plan_shares` (§1) and the
  guard also re-checks the live plan, so a deleted (or later restored) plan's
  links behave correctly with no separate bookkeeping.
- **Accepted residual: a response-shape-uniform 404 is not perfectly timing-uniform.**
  A dead token (unknown/revoked/expired/soft-deleted grant) is rejected after **one**
  DB round trip (`findLiveByTokenHash`), whereas a **live** token whose **plan** was
  soft-deleted costs **two** (the extra `plans.findActiveByIdInOrg` re-check). That
  latency gap distinguishes "a real token that now points at a deleted plan" from "no
  such token" — but it is **not a token-discovery oracle**: reaching the two-round-trip
  path at all requires already holding the actual 256-bit token, at which point guessing
  is already moot. We **accept** this residual rather than pad latency or always run the
  plan check; the entropy + rate-limit (§6), not timing-uniformity, are the anti-guessing
  controls.

### 6. Abuse resistance for a public endpoint

The guest endpoints are unauthenticated by session. Mitigations:

- **Rate-limit** `/api/v1/share/*` per client IP (blunts scraping / token
  spraying / DoS). SchedulePoint has no global throttler today, so this feature
  **introduces** one (`@nestjs/throttler` on the guest controller and/or an nginx
  `limit_req` zone) — a named dependency, flagged for security- and
  devops-reviewers.
- **256-bit tokens** make enumeration infeasible; the uniform-404 resolve gives
  no oracle.
- **Bounded reads:** guest list endpoints are cursor-paginated exactly like the
  member endpoints (a 2,000-activity plan is the documented ceiling).

### 7. Audit & telemetry

`created_by` (who minted) and `updated_by`/`revoked_at` (who revoked) are audited
on the row. Guest **access** is logged via Pino (structured: `shareId`, `planId`,
`organizationId`, client IP, path) — satisfying the brief's "optional access log"
without a dedicated DB table in v1. `last_accessed_at` is a best-effort,
**coalesced** column write (at most once per short interval per link) so guest
reads stay cheap. A full per-hit DB access-log table is **deferred**.

## Alternatives considered

- **Synthesised read-only `Principal` with a virtual membership + a `GUEST` role
  in `OrganizationRole`.** Reuses the guard/permission plumbing, but pollutes the
  member enum, risks a guest reaching member code paths, and muddies the RBAC
  matrix. Rejected — ADR-0016 deliberately keeps the guest _out_ of the member
  role set. The parallel `GuestPrincipal` is safer by construction.
- **Token in the URL path (`/share/$token`) as the credential.** Simpler
  (one copy-paste URL, trivial routing), but the token then appears in the
  `Referer` header to any third-party asset, in browser history, **and in
  server/API access logs**. Rejected as the _primary_ design in favour of the
  fragment; retained as a documented fallback if the fragment approach proves
  awkward (see the spec's critical questions).
- **A short-lived guest _session_ cookie exchanged from the token.** The guest
  posts the token once, gets an http-only guest cookie, and the URL token is
  stripped. Reduces token-in-URL exposure after first load, but re-introduces a
  session/CSRF surface for an outsider and contradicts the "session-less" goal;
  revocation would then need session invalidation too. Rejected for v1; revisit
  if we ever need guest write or long guest sessions.
- **A signed, stateless JWT link (no DB row).** No storage, self-describing
  expiry — but **cannot be revoked** without a denylist (which re-introduces
  state), and rotating the signing key invalidates every link at once. Revocation
  is a hard product requirement (brief §5/§13). Rejected.
- **Per-link scope column from day one.** More flexible, but no concrete second
  scope exists yet; a fixed `SCHEDULE_READ` surface with a reserved field is
  leaner (YAGNI). Deferred.

## Consequences

- **Positive:** the External Guest role from the brief finally exists, cleanly
  separated from org membership (honouring ADR-0016); a leak-minimising,
  revocable, optionally-expiring, non-indexable link; anti-IDOR guaranteed by the
  token dereferencing to exactly one plan and the type system forbidding guest→
  member method flow; the CPM engine, pen model and recalc parity gate are
  untouched (read-only, write-free).
- **Negative / new surface:** the **first unauthenticated data-read endpoint** in
  the app — it needs a rate-limiter (new infra dependency) and a mandatory
  security-review of the whole authz model. A share URL remains a bearer
  credential in the holder's history/bookmarks (mitigated, not eliminated). A
  parallel guard/identity is a small amount of duplicated plumbing (kept minimal
  by reusing repositories, not re-implementing reads).
- **Follow-ups / reserved:** wider guest scopes (resources/baselines) via the
  reserved `scope`; a DB access-log table if auditors demand per-hit records; a
  guest-session model if guest write is ever wanted. Tracked in the spec.

## References

- `docs/PROJECT_BRIEF.md` §5, §10 (journey 3), §13; ADR-0003, ADR-0012, ADR-0016,
  ADR-0028, ADR-0046 (cascade precedent).
- Token precedent: `apps/api/src/modules/invitations/token.ts`,
  `Invitation.tokenHash`.
- Feature spec + plan: `docs/specs/external-guest-share-link/`.
