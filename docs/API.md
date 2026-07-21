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
| 413  | Payload too large — upload exceeds the boundary cap        |
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
create/update/delete, cross-plan dependency create/delete (on the **successor**
plan), and `…/schedule/recalculate` — additionally require holding the pen and
return **423 `PLAN_EDIT_LOCK_REQUIRED`** otherwise (distinct from the 409 version
clash). The Contributor progress path (`…/activities/:id/progress`), all reads,
and plan-metadata `PATCH …/plans/:id` are **not** pen-gated.

The write-gate is **behind a staged-rollout flag** `PLAN_EDIT_LOCK_ENFORCED`
(default off): the lock mechanism ships inert so it never breaks the existing
(flag-on) activities-table / dependency-editor / recalculate flows, which don't
acquire a lock yet. Ops enable it only once the front end acquires the pen across
every editing entry point (edit-lock M2/M3).

### Cross-plan dependencies (ADR-0045)

A **live cross-plan dependency** is an inter-project logic edge whose predecessor
and successor activities live in **different plans of the same organisation**
(inter-project M2). It is a sibling of the intra-plan dependency, kept on its own
resource because it carries **two** plan ids and is derived above the pure engine
(never fed to it). Create is **org-scoped** (not nested under a plan): both plan
ids are derived server-side from the two endpoint activities, so a caller only
supplies the endpoint ids. Listing reuses `dependency:read`; create/delete need
the dedicated **`dependency:link_cross_plan`** (Planner + Org Admin) and hold the
pen on the **successor** plan (the edge's home).

| Method | Path                                               | Notes                                                                                      |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `…/cross-plan-dependencies`                        | Link two activities across plans · 422 `CROSS_PLAN_SAME_PLAN` · 409 cycle/duplicate · 423. |
| GET    | `…/cross-plan-dependencies/:id`                    | Fetch one (org-scoped, anti-IDOR 404).                                                     |
| DELETE | `…/cross-plan-dependencies/:id`                    | Soft-delete · 204, pen on the successor plan.                                              |
| GET    | `…/plans/:planId/cross-plan-dependencies`          | The plan's **incoming** cross-plan links (cursor-paginated).                               |
| GET    | `…/activities/:activityId/cross-plan-dependencies` | An activity's links, **both directions** (cursor-paginated).                               |

Anti-IDOR is uniform: a foreign, other-org, or deleted endpoint id is an
indistinguishable **404**. The programme graph is a **plan-level DAG** — a create
that would close a cycle between two plans is rejected **409
`CROSS_PLAN_CYCLE_DETECTED`** (N30), a same-plan edge is **422
`CROSS_PLAN_SAME_PLAN`** (N31), and a duplicate `(predecessor, successor, type)`
is **409 `DUPLICATE_CROSS_PLAN_DEPENDENCY`** (N33). Concurrent mirror creates are
serialised by an **org-scoped advisory lock** so exactly one wins.

### Programme recalculation (ADR-0045 §4)

`POST …/plans/:planId/schedule/recalculate-programme` (`schedule:calculate` —
Planner + Org Admin) recalculates the target plan's **upstream cross-plan
closure** — the plan plus every plan it transitively depends on over cross-plan
edges — in **topological order, upstream-first** (the target last), so the
target's derived inter-project bounds (the live cross-plan derivation, ADR-0045
§2) read fresh upstream dates. Each plan is recalculated with the **existing
single-plan recalc transaction** (its own advisory lock + pen), acquired in the
deterministic topological order (a stable lock order ⇒ deadlock-free). The **pure
engine is untouched**; a plan with **no** cross-plan edges recalculates just
itself (equivalent to `…/schedule/recalculate`).

Because the solve **writes** every plan in the closure, the default policy
(ADR-0045 Critical Question 3) is **fail-fast**: a pre-flight pass asserts the pen
on **every** closure plan _before any write_, collecting **all** blocked plans and
throwing a single **423 `PROGRAMME_PLANS_LOCKED`** (with the `blockedPlanIds`
list) if any is held by another editor — **nothing is written**. The `200`
response carries the per-plan summaries (in recalculation order) plus a programme
roll-up (`planCount`, and `crossPlanUpstreamMissingCount` — the summed **N32**
warnings for cross-plan edges whose upstream had never been calculated, which
contribute no derived bound and are never an error).

The solve is **synchronous and bounded**: the upstream closure is capped at **50
plans**; a larger programme rejects with **422 `PROGRAMME_TOO_LARGE`** (recalculate
a smaller sub-programme) rather than open an unbounded request. Lifting the cap is
the deferred background/queued-solve slice, not a bigger limit.

| Method | Path                                             | Notes                                                                                                                              |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `…/plans/:planId/schedule/recalculate-programme` | Recalculate the plan's upstream cross-plan closure in dependency order · 423 `PROGRAMME_PLANS_LOCKED` · 422 `PROGRAMME_TOO_LARGE`. |

### Notes (ADR-0046)

A **note** is an attributed, timestamped, plain-text entry (1–5000 chars, no
markdown) in an entity's thread — the "why" behind a schedule. v1 hangs off
**plans** and **activities** (the model extends to clients/projects later with no
rework). Notes are **org-scoped, audited, soft-deleted**, and cascaded/restored
with their parent by `HierarchyLifecycleService`. Reading needs **`note:read`**
(every member); writing needs **`note:create` / `note:update` / `note:delete`**
(**Contributor upward**, the `activity:update_progress` grant surface). Notes are
**non-structural**: writes are deliberately **NOT pen-gated** (no edit-lock, no
423). On create the caller sends **only `body`** — the organisation, entity type,
plan id (an activity note copies its activity's plan id) and activity id are all
derived server-side from the resolved parent. Threads are **newest-first**,
cursor-paginated.

| Method | Path                                    | Notes                                                                                                            |
| ------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET    | `…/plans/:planId/notes`                 | A plan's PLAN-type notes, newest-first (cursor-paginated). `note:read`.                                          |
| POST   | `…/plans/:planId/notes`                 | Add a note to the plan · 422 empty/whitespace-only or over-long body. `note:create`. **Not pen-gated.**          |
| GET    | `…/plans/:planId/notes/activity-counts` | Per-activity active-note counts for the plan (`ActivityNoteCount[]`), one grouped query (no N+1). `note:read`.   |
| GET    | `…/activities/:activityId/notes`        | An activity's notes, newest-first (cursor-paginated). `note:read`.                                               |
| POST   | `…/activities/:activityId/notes`        | Add a note to the activity · 422 bad body. `note:create`. **Not pen-gated.**                                     |
| PATCH  | `…/notes/:noteId`                       | Edit **your own** note (body + optimistic `version`) · 403 non-author · 409 stale · 422 bad body. `note:update`. |
| DELETE | `…/notes/:noteId`                       | Delete **your own** note (soft) · 204 · 403 non-author. `note:delete`.                                           |

Anti-IDOR is uniform: a foreign, other-org, or deleted parent or note is an
indistinguishable **404**. Edit/delete are additionally constrained to the note's
**author** (`created_by === principal.userId`) — the permission alone is not
enough; anyone else is **403** (Org-Admin moderation of others' notes is out of
v1). The response carries `authorId`, the server-resolved `authorName` (or null),
and `edited` (true once the body has been revised).

### External-Guest share links (ADR-0051)

Revocable, read-only, per-plan **share links** for someone OUTSIDE the organisation
(no account, no membership). Managing links is a **governance act** gated on
`plan:share` (Planner + Org Admin only). The raw `sp_share_…` token is returned
**once**, on create, inside the guest URL's **fragment** (`…/share#<token>`) — only
its SHA-256 hash is stored, and no list/read response ever carries a token. F-M2
ships the management surface; the session-less guest read path (F-M3) is separate.

| Method | Path                              | Notes                                                                                                                        |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| POST   | `…/plans/:planId/shares`          | Create a link · 201 `{ url, share }` (raw token in `url`'s fragment, once) · 422 `SHARE_EXPIRY_IN_PAST`. `plan:share`.       |
| GET    | `…/plans/:planId/shares`          | The plan's links, newest-first — **metadata only, never a token** (id, label, `active`, expiresAt, revokedAt). `plan:share`. |
| DELETE | `…/plans/:planId/shares/:shareId` | Revoke a link (immediate; the next guest request 404s) · 204, **idempotent**. `plan:share`.                                  |

Anti-IDOR is uniform: a foreign, other-org, or deleted plan — or a share id that is
not this plan's — is an indistinguishable **404**. `organization_id` is copied from
the resolved plan, never from client input. **Non-scheduling**: the CPM engine and
the pen model (ADR-0028) are untouched, and share writes are deliberately not
pen-gated.

### Schedule interchange (ADR-0050)

**Import** a foreign schedule file (a P6 **XER** for M1; MS Project MSPDI later) into a chosen project as a
**new plan**, best-effort and transparently. The parsing/mapping/validation is the pure, engine-free
`@repo/interchange` package; the API module is thin (upload, authz, org-scope). The flow is **two-phase**:
a stateless **dry-run** parses the file and returns an **interchange report** (detected format/version,
mapped counts, and the approximation / repair / drop findings — the runtime instance of ADR-0050's mapping
contract) **without writing anything**, then a separate **commit** creates the plan. Import needs
**`interchange:import`** (**Planner + Org Admin**, a hierarchy-write capability, deliberately not
Contributor); the authoritative org-scope check is on the **target project** (anti-IDOR). Uploads are
multipart with a **byte cap enforced at the boundary** (→ 413 before the file is fully buffered).

| Method | Path                                        | Notes                                                                                                                                                                                     |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `…/projects/:projectId/interchange/dry-run` | Parse an uploaded `file` (multipart) → `200 { data: InterchangeReport }`; **no write**. 422 unrecognised/malformed/no file · 413 oversize. `interchange:import`.                          |
| POST   | `…/projects/:projectId/interchange/commit`  | Re-parse the uploaded `file` (multipart) and create a plan → `201 { data: { planId, report } }`. One transaction (calendars + activities + dependencies), then recalculate. Same 422/413. |

The dry-run is **read-only** (returns `200`, not `201` — no resource is created). A parseable file returns
its report **even when it needed repairs** (dangling edge dropped, duplicate `(pred,succ,type)`
de-duplicated, cycle broken, duplicate code suffixed, units coerced — each named in `report.repairs` /
`report.approximations`, never silent). A structurally-impossible file (not XER / malformed / no project)
is a user-safe **422** (`details.reason = UNPARSEABLE_FILE`); a missing `file` is **422**
(`NO_FILE`). Anti-IDOR is uniform: a foreign or other-org project (or a caller who is not a member of the
org) is an indistinguishable **404**; a malformed project id is **400**.

The **commit** endpoint is the second phase: it re-accepts the same multipart upload (stateless — `importXer`
is pure + deterministic, so the graph committed equals the one reviewed) and, in **one transaction**, creates
the plan with its calendars, activities and dependencies via the existing repositories (the same
transaction-composition each domain service uses), then **recalculates** the new plan (ADR-0022; the CPM engine
is only invoked). It returns **`201 { data: { planId, report } }`**. **Atomicity:** any failure — an
unparseable file (422 before any write), a persistence rejection (duplicate plan/calendar name, duplicate/cyclic
dependency — the whole transaction rolls back), or a recalculation failure (compensated) — leaves **nothing
created**. Same authz (`interchange:import`), org-scope (anti-IDOR) and byte cap (→ 413) as the dry-run.
Calendars are imported to the M1 weekday-mask contract (intraday shifts approximated to worked weekdays);
activities are laid out on a deterministic lane per source order.

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
- The `GET …/schedule/summary` roll-up also surfaces **cross-plan staleness**
  (ADR-0045 §5 / ADR-0035 §30.7): `scheduleStale` (a boolean — true when an
  upstream cross-plan plan was recalculated more recently than this plan, so a
  programme recalculate is due) and `staleUpstreamPlanIds` (the upstream plan ids
  driving it). Both are **computed on read** (pull; there is no background push)
  and are **present only for a plan with at least one cross-plan link** — a plan
  with no cross-plan edges omits them entirely, so its summary is unchanged. A
  **programme recalculate** (`POST …/schedule/recalculate-programme`), which
  recomputes the upstream closure upstream-first, clears the staleness.
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
