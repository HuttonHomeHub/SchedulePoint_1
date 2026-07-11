# API conventions

> The conventions every endpoint must follow. Demonstrated by the reference
> template ([`docs/REFERENCE_FEATURE.md`](REFERENCE_FEATURE.md),
> `apps/api/examples/reference-feature/`) and wired globally per
> [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md). Keep this in step with
> the OpenAPI document (`@nestjs/swagger`, served at `/api/docs` outside prod).
> Request models are `class-validator` DTOs; response models are explicit DTOs
> that never expose internal/audit columns.

## Style

- **REST over HTTPS**, JSON request/response bodies (`application/json`).
- Resource-oriented, plural nouns: `/items`, `/organisations`, `/documents`.
- Use HTTP verbs correctly: `GET` (read, safe), `POST` (create), `PATCH`
  (partial update), `PUT` (full replace), `DELETE` (remove).
- All routes are served under the `/api` prefix and a version segment (below).
- **Path identifiers** are the resource UUID by default. A collection with a
  natural, human-readable, immutable key **may** use that key instead (e.g.
  `/organizations/{orgSlug}`); the UUID is still returned in the body.

## Versioning

- URI versioning: `/api/v1/...`. A new **major** version is introduced only for
  breaking changes; additive changes stay within the current version.
- The OpenAPI document is the contract. Breaking changes require an ADR and a
  migration note in `CHANGELOG.md`.

## Response envelope

Successful responses wrap the payload (see `@repo/types`):

```jsonc
// 200 OK
{
  "data": {/* resource or array */},
  "meta": {/* optional: pagination, etc. */},
}
```

## Errors

A single, predictable error shape (`ApiError` in `@repo/types`):

```jsonc
// 4xx / 5xx
{
  "error": {
    "code": "BILL_NOT_FOUND",
    "message": "No item exists with that id.",
    "details": null,
  },
}
```

- `code` is a stable, machine-readable `SCREAMING_SNAKE_CASE` string.
- `message` is human-readable and safe to surface; never leak internals or
  stack traces.
- Validation failures return `422` with field-level `details`.

### Status codes

| Code | Use                                                        |
| ---- | ---------------------------------------------------------- |
| 200  | Successful read/update                                     |
| 201  | Resource created (include `Location`)                      |
| 204  | Success, no body (e.g. delete)                             |
| 400  | Malformed request                                          |
| 401  | Not authenticated                                          |
| 403  | Authenticated but not authorised                           |
| 404  | Resource not found                                         |
| 409  | Conflict (e.g. duplicate, optimistic-lock version clash)   |
| 422  | Validation failed                                          |
| 423  | Locked — the plan edit-lock precondition failed (ADR-0028) |
| 429  | Rate limited                                               |
| 500  | Unexpected server error                                    |

**423 vs 409 — two distinct concurrency signals.** A **409** is a per-row
lost-update / uniqueness clash (the optimistic `version` guard) — refetch and
retry. A **423** (`code: "LOCKED"`) is the plan **edit-lock** coordination layer
(ADR-0028): someone else holds the single-editor "pen", or the caller's lease was
taken over / expired. The specific condition is a `reason` in `details`:
`PLAN_EDIT_LOCK_REQUIRED` (a structural write without the pen),
`PLAN_EDIT_LOCK_HELD` (acquire/take-over refused — held, or grace not yet
elapsed), `PLAN_EDIT_LOCK_LOST` (the caller's lease was stolen or expired). See
the edit-lock endpoints and the gated-write note below.

### Plan edit-lock (ADR-0028)

The single-editor "pen" lives under a plan as an `edit-lock` sub-resource. Reads
are open to any member (`plan:read`); acquire/heartbeat/release/hand-off need
`plan:acquire_lock`; request-control needs `plan:request_control`; immediate
override needs `plan:override_lock` (Org Admin).

| Method | Path                                  | Notes                                                                    |
| ------ | ------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `…/plans/:planId/edit-lock`           | Lock status (state, holder, requestedBy, capability flags).              |
| POST   | `…/plans/:planId/edit-lock`           | Acquire/renew; `{ takeover: true }` steals per server policy · 423 held. |
| POST   | `…/plans/:planId/edit-lock/heartbeat` | Renew the holder's lease · 423 `PLAN_EDIT_LOCK_LOST`.                    |
| POST   | `…/plans/:planId/edit-lock/request`   | Register a peer request-control (no transfer).                           |
| POST   | `…/plans/:planId/edit-lock/handoff`   | Holder hands the pen to the requester · 409 if none pending.             |
| DELETE | `…/plans/:planId/edit-lock`           | Release (holder) / force-release (override) · 204, idempotent.           |

**Gated writes.** The structural write endpoints — activity
create/update/delete/restore, `…/activities/positions`, dependency
create/update/delete, and `…/schedule/recalculate` — additionally require holding
the pen and return **423 `PLAN_EDIT_LOCK_REQUIRED`** otherwise (distinct from the
409 version clash). The Contributor progress path (`…/activities/:id/progress`),
all reads, and plan-metadata `PATCH …/plans/:id` are **not** pen-gated.

## Pagination, filtering, sorting

- **Cursor-based** pagination for lists: `?limit=20&cursor=<opaque>`; responses
  include `meta.nextCursor` and `meta.hasMore`.
- Filtering via explicit query params; sorting via `?sort=field&order=asc|desc`.
- Always cap `limit` server-side to a sane maximum.
- A list that is **inherently bounded and caller-owned** (e.g.
  `GET /organizations` — only the caller's memberships, no filters) may return an
  unpaginated array; note the exemption at the endpoint. Revisit if the set can
  grow large.

## Batch mutations

- A batch write uses **`PATCH`** on the collection with an array body whose items each carry
  their own `id` and optimistic-lock `version` — e.g.
  `PATCH …/plans/:planId/activities/positions` with `{ positions: [{ id, laneIndex, version }] }`.
  No verb-in-path (`:batchMove`) and no `POST` (which reads as "create a resource").
- Batch writes are **all-or-nothing**: if any item fails its scope check (`404`) or version
  check (`409`), the whole batch is rejected and nothing is written. Cap the array server-side.

## Validation & data types

- Requests validated with `class-validator` DTOs; unknown properties rejected.
- If the app represents money, use **minor units (integer)** with an explicit
  currency code — never floating point. Timestamps are **ISO 8601 UTC** strings.

## Authentication

- Cookie-based sessions via Better Auth (secure, http-only, same-site); ADR-0003.
- The Better Auth handler is mounted at **`/api/auth/*`** (sign-up, sign-in,
  sign-out, session). It is a raw Node handler, mounted before body parsing, and
  sits outside the versioned `/api/v1` surface.
- State-changing requests require CSRF protection: Better Auth rejects requests
  whose `Origin` is missing or not in the allow-list (`trustedOrigins`, wired to
  `CORS_ORIGINS`) — browsers send `Origin` automatically.
- Deny-by-default: every route is authenticated unless marked `@Public()`. The
  authenticated identity is exposed at **`GET /api/v1/me`** (the current user and
  their organisation memberships).
- Protected routes are guarded server-side; `401`/`403` as per the table above.

## OpenAPI / docs

- The spec is generated from decorators (`@nestjs/swagger`) and served at
  `/api/docs` in non-production environments.
- Every endpoint documents its request/response schemas, status codes, and auth
  requirement. Treat the generated spec as part of the review.

## Conventions checklist (per endpoint)

- [ ] Correct verb, plural resource, versioned path
- [ ] DTO validation with explicit types
- [ ] Response uses the standard envelope; errors use `ApiError`
- [ ] Auth guard applied (or explicitly public)
- [ ] Pagination for lists; indexes for filter/sort columns
- [ ] OpenAPI annotations complete
- [ ] Tests: unit (service) + e2e (Supertest)
