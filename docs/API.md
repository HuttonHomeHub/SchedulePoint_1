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

`meta` is present only when a handler has something to add — pagination
(`nextCursor`/`hasMore`), a bounded-list roll-up, or **`warnings`**: a
machine-readable list of adjustments the server applied to keep a write
self-consistent (the write still succeeds and `data` reflects the corrected
value). Today the progress endpoint (`PATCH …/activities/:id/progress`) emits
`meta.warnings` (`{ code, message }`, `ProgressWarning`) when it repairs a
complete activity — `COMPLETE_WITHOUT_FINISH` (finish set to the data date) or
`REMAINING_ON_COMPLETE` (remaining forced to zero) — per ADR-0035 §6. An
ordinary write omits `meta` entirely.

### Cross-resource recompute (a write that mutates a sibling)

A few writes deterministically mutate a **second** resource in the same
transaction to keep a shared invariant true; the response body is still the
addressed resource only. The **duration-type triad** (ADR-0040) is the current
case: editing an activity's `durationDays` (when it has a driving resource
assignment with a `unitsPerHour`) recomputes and persists that assignment's
units/rate, and editing a driving assignment's units/rate (with an `editedField`)
can recompute and persist the owning activity's duration — each bumping the
sibling's optimistic-lock `version`. This is documented per-endpoint in the
OpenAPI `description`, and a client that also holds the sibling should **refetch
it** (its `version` has moved, or a later unrelated write to it will 409). The
whole recompute is inert — a plain single-row write — until a driving assignment
carries a rate, so it never surprises a plan that doesn't use resource units.

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
the edit-lock endpoints and the gated-write note below. (Separately, a **409** on
`POST …/edit-lock/handoff` is a state-precondition clash — "no one has requested
control" — not a lock/version conflict; it reads the same "conflicting state" 409
as e.g. restoring a child whose parent is still deleted.)

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

The write-gate is **behind a staged-rollout flag** `PLAN_EDIT_LOCK_ENFORCED`
(default off): the lock mechanism ships inert so it never breaks the existing
(flag-on) activities-table / dependency-editor / recalculate flows, which don't
acquire a lock yet. Ops enable it only once the front end acquires the pen across
every editing entry point (edit-lock M2/M3).

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
- **Calendar-day fields** (a date with no time/timezone) are strict `YYYY-MM-DD`
  strings — e.g. an activity's `constraintDate`/`expectedFinish` and its
  **external / inter-project dates** `externalEarlyStart`/`externalLateFinish`
  (ADR-0043 / ADR-0035 §30: imported commitments from another project, gating
  this activity; either/both/neither may be set, and dropped from the schedule
  when the plan's `ignoreExternalRelationships` option is on). A cross-field
  invalid pair returns **422** with a `details.reason` — e.g.
  `EXTERNAL_FINISH_BEFORE_START` when `externalLateFinish` precedes
  `externalEarlyStart` (N26), alongside a nullable-safe DB CHECK backstop.
- A plan's **scheduling options** are booleans on the plan resource
  (`makeOpenEndsCritical`, `useExpectedFinishDates`, `levelResources`,
  `ignoreExternalRelationships`, …); each defaults to a behaviour-preserving
  `false` and is set with a targeted PATCH. The computed `GET …/schedule/summary`
  roll-up carries `externalDrivenCount` (how many activities an external bound
  drove) — engine-derived on a recalculation.
- An activity's **Earned-Value cost inputs** (ADR-0042 / ADR-0044) are settable
  definition fields: `percentCompleteType` (`DURATION` default / `UNITS` /
  `PHYSICAL` — the measure that earns value), `physicalPercentComplete`, the
  minor-unit `budgetedExpense`/`actualExpense` (cost:read-gated in responses),
  and **`accrualType`** (`START` / `UNIFORM` default / `END`, ADR-0044 §32 /
  ADR-0035 §32). `accrualType` governs **when** the activity's cost is recognised
  in the `GET …/schedule/earned-value` read's Planned-Value time-phasing — START
  at its start, END at its finish, UNIFORM linearly — and **never changes a CPM
  date**; `UNIFORM` is byte-identical to the pre-ADR-0044 phasing. None of these
  feed the scheduler.
- An activity's **weighted progress steps** (ADR-0044 §2 / ADR-0035 §33) are a
  bulk-replace sub-resource: `GET …/activities/:activityId/steps` lists the active
  steps (seq-ordered), and `PUT …/activities/:activityId/steps` with
  `{ version, steps: [{ name, weight, percentComplete }] }` replaces the whole list
  in one transaction (retained rows updated in place, new ones appended, removed
  ones soft-deleted; the server assigns `seq`). `version` is the parent **activity's**
  optimistic-lock version (the replace bumps it; a stale value is a `409`). Steps
  are activity-write data (`activity:update`, no new permission). When present,
  their weight-weighted mean `Σ(w·p)/Σw` is the activity's **PHYSICAL** %-complete
  and **wins** over `physicalPercentComplete` (feeding the `GET …/schedule/earned-value`
  read only — never a CPM date); with no steps the manual field stands (parity). A
  step `percentComplete` outside 0–100 is a **422** (`STEP_PERCENT_OUT_OF_RANGE`,
  N28) and a negative `weight` a 422; all-zero weights fall back to the manual field
  and raise the read's `stepWeightZeroCount` warning (N27), never a reject.
- A **resource assignment** (`…/activities/:activityId/assignments`) carries a
  settable **`curveType`** (`UNIFORM` default / `BELL` / `FRONT_LOADED` /
  `BACK_LOADED` / `DOUBLE_PEAK`, ADR-0044 §3 / ADR-0035 §31) — the named P6 loading
  curve the resource-histogram read distributes the assignment's `budgetedUnits` by
  across the activity span. It shapes only the histogram — **no CPM date, no
  levelling** — and `UNIFORM` (the default) is a flat load (byte-identical to a
  flat-rate distribution). It is a plain enum (not cost-gated).
- `GET …/schedule/resource-histogram` reads a plan's **resource loading histogram**
  (ADR-0044 §3 / ADR-0035 §31, `schedule:read` — every member; the units histogram
  is **schedule data, not cost**, so it is **not** `cost:read`-gated). A
  `granularity` query param (`DAY` default / `WEEK` / `MONTH`) sets the shared
  time-bucket axis; `limit`/`offset` page over the **per-resource series** (`data`).
  Each assignment's `budgetedUnits` is distributed across its effective span per its
  `curveType`, **conserving units** (`Σ buckets === Σ budgetedUnits` per resource);
  the response `meta` carries the shared `buckets` axis, `granularity`, the total
  series count, `hasMore`, and **`curveNormalisedCount`** (N29 — assignments whose
  profile did not sum to 100 and were normalised to conserve units). It reads the
  persisted CPM dates only — no recompute, no CPM date moved, no levelling. A
  granularity too fine for the plan's span returns **422**
  (`HISTOGRAM_GRANULARITY_TOO_FINE`); request a coarser one.

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
