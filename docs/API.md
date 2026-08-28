# API conventions

> The conventions every endpoint must follow. The implementation standard is in
> [`docs/REFERENCE_FEATURE.md`](REFERENCE_FEATURE.md) (exemplars:
> `modules/clients`, `modules/notes`, `modules/share`), wired globally per
> [`BACKEND_ARCHITECTURE.md`](BACKEND_ARCHITECTURE.md). Keep this in step with
> the OpenAPI document (`@nestjs/swagger`, served at `/api/docs` outside prod).
> Request models are `class-validator` DTOs; response models are explicit DTOs
> that never expose internal/audit columns.

## Style

- **REST over HTTPS**, JSON request/response bodies (`application/json`).
- Resource-oriented, plural nouns: `/clients`, `/projects`, `/plans`,
  `/activities`. Note the **US spelling** on the wire — `/organizations`, not
  `/organisations` — even though prose in these docs uses British spelling.
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
(`nextCursor`/`hasMore`), a bounded-list roll-up, server configuration the response
would otherwise force the client to hardcode (`GET …/deleted`'s `retentionDays`/
`retentionActive`, ADR-0096), or **`warnings`**: a
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

A single, predictable error shape (`ApiError` in `@repo/types`), produced for
every failure by `AllExceptionsFilter`:

```jsonc
// 404
{
  "error": {
    "code": "NOT_FOUND",
    "message": "No plan exists with that id.",
    "details": null,
  },
}
```

- **`code` is the _class_ of failure, not the specific one.** It comes from the
  thrown `DomainError` subclass (`common/errors/domain-errors.ts`) or, for
  framework errors, from the status: `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`,
  `VALIDATION_FAILED`, `GONE`, `LOCKED`, `UNAUTHENTICATED`, `BAD_REQUEST`,
  `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `INTERNAL_ERROR`. That is the whole set —
  do not expect a per-resource code like `PLAN_NOT_FOUND` on the wire.
- **The specific condition lives in `details.reason`.** This is the field a
  client branches on. Every named code elsewhere in this document —
  `CALENDAR_WRONG_SCOPE`, `RESOURCE_IN_USE`, `GROUP_NOT_ASSIGNABLE`,
  `CALENDAR_ARCHIVED`, `PLAN_EDIT_LOCK_REQUIRED`, … — is a `details.reason`
  value carried by a generic top-level `code`, not a top-level `code` itself:

  ```jsonc
  // 422 — an activity pointed at another project's calendar
  {
    "error": {
      "code": "VALIDATION_FAILED",
      "message": "That calendar belongs to another project.",
      "details": { "reason": "CALENDAR_WRONG_SCOPE", "projectId": "…" },
    },
  }
  ```

  When adding an error, put the branchable discriminator in `details.reason` and
  give it a test — the top-level `code` is too coarse for a client to act on.

- `message` is human-readable and safe to surface; never leak internals or
  stack traces. A 5xx is always the generic `INTERNAL_ERROR` message.
- Validation failures return `422` with field-level `details` from the global
  `ValidationPipe`.

### Status codes

| Code | Use                                                        |
| ---- | ---------------------------------------------------------- |
| 200  | Successful read/update                                     |
| 201  | Resource created (include `Location`)                      |
| 204  | Success, no body (delete, or a lifecycle-flag sub-action)  |
| 400  | Malformed request                                          |
| 401  | Not authenticated                                          |
| 403  | Authenticated but not authorised                           |
| 404  | Resource not found                                         |
| 409  | Conflict (e.g. duplicate, optimistic-lock version clash)   |
| 410  | Gone — the resource existed but has expired (e.g. a token) |
| 413  | Payload too large — upload exceeds the boundary cap        |
| 422  | Validation failed                                          |
| 423  | Locked — the plan edit-lock precondition failed (ADR-0028) |
| 429  | Rate limited                                               |
| 500  | Unexpected server error                                    |

**`POST :id/<verb>` sub-actions: `200` + the resource, or `204`?** A sub-action that changes what
the resource **is** returns it (`…/clients/:id/restore`, `…/baselines/:id/activate` — a restore
brings a cascade back, an activation moves a per-plan invariant and reports a count the client
cannot derive). A sub-action that flips an **orthogonal lifecycle flag** to a value the caller
already knows returns `204` (`…/archive`, `…/unarchive`, ADR-0053 §4) — the body would carry only
the incremented `version`, and the list the caller is looking at is invalidated either way.

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
create/update/delete/restore, `…/activities/positions`, `…/activities/parents`,
`…/activities/placements`, `…/activities/bulk-delete`, `…/activities/restore-batch/:batchId`, dependency
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
ships the management surface; F-M3 adds the session-less guest **read** surface below.

| Method | Path                              | Notes                                                                                                                                                             |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `…/plans/:planId/shares`          | Create a link · 201 `{ url, share }` (raw token in `url`'s fragment, once) · 422 `SHARE_EXPIRY_IN_PAST`. `plan:share`.                                            |
| GET    | `…/plans/:planId/shares`          | The plan's links, newest-first — **metadata only, never a token** (id, label, `active`, expiresAt, revokedAt); **unpaginated** (tiny per-plan set). `plan:share`. |
| DELETE | `…/plans/:planId/shares/:shareId` | Revoke a link (immediate; the next guest request 404s) · 204, **idempotent**. `plan:share`.                                                                       |

Anti-IDOR is uniform: a foreign, other-org, or deleted plan — or a share id that is
not this plan's — is an indistinguishable **404**. `organization_id` is copied from
the resolved plan, never from client input. **Non-scheduling**: the CPM engine and
the pen model (ADR-0028) are untouched, and share writes are deliberately not
pen-gated.

#### Guest read surface (F-M3, session-less)

The app's **first unauthenticated data-read** endpoints (ADR-0051 §3–§6). Every route
is `@Public()` (bypasses the session guard) and instead resolves an
`Authorization: Bearer sp_share_<token>` header to its **one plan** via the
`ShareTokenGuard`. There are **no path/query params that select a plan or org** — the
**token is the entire scope**, so there is nothing to tamper with (anti-IDOR by
construction). Reads go through the existing org-scoped repositories, scoped **only** by
the token's `planId` + `organizationId`, and return **field-stripped, read-only** DTOs.

| Method | Path                         | Notes                                                                                                                                                                                                             |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/v1/share/plan`         | The plan header (`id`, `name`, `status`, `description`, `dataDate`) + its calendar (weekday mask + exceptions) + the schedule summary (`projectFinish`, activity/critical/near-critical counts).                  |
| GET    | `/api/v1/share/activities`   | The plan's activities, **cursor-paginated** (`limit`/`cursor`) — id, code, name, type, duration, CPM early/late dates, actual dates, total float, `isCritical`, lane, and progress (`status`, `percentComplete`). |
| GET    | `/api/v1/share/dependencies` | The plan's logic ties, **cursor-paginated** — id, predecessorId, successorId, type, lag (days).                                                                                                                   |

- **Uniform 404** — any dead / revoked / expired / soft-deleted-grant / deleted-plan
  token resolves to the same `404`, never `401/403` (no oracle).
- **429** — a **tighter per-IP rate limit** (30 requests / 60 s) than the global default
  (100 / 60 s) applies to `/api/v1/share/*` only; a burst yields `429`.
- **Headers** — every guest response carries `X-Robots-Tag: noindex, nofollow` and
  `Referrer-Policy: no-referrer` (§2/§5): not crawlable, not a referrer-leak source.
- **Never exposed** — cost / Earned-Value / money, resources / assignments, baselines /
  variance, notes, audit columns (`createdBy`/`updatedBy`/`version`/`deletedAt`/
  timestamps), any user identity, the plan-lock holder, and the token / tokenHash.
- **Read-only** — the persisted CPM columns are read (no engine call); the only write is
  a best-effort, coalesced `last_accessed_at` telemetry touch (at most once / 5 min per
  link), fired-and-forgotten so it never blocks or fails a read.

#### Web surface (F-M4, flagged)

The web surface for both halves ships behind `VITE_GUEST_SHARE_LINKS` (default off; ADR-0051
F-M4): a member **Share links** dialog on the TSLD toolbar (`share` item) that calls the F-M2
management endpoints above — list / create (showing the one-time guest URL with a Copy button) /
revoke, gated on `plan:share` — and a **public `/share` route** (a sibling of the authenticated
shell, no session, no chrome) that reads the token from the URL **fragment**, calls the F-M3 guest
endpoints with the Bearer header (no cookies), and renders the plan read-only. No new API — the flag
only governs whether the web UI exposes the already-shipped endpoints.

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

| Method | Path                                        | Notes                                                                                                                                                                                                                                                                                        |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `…/projects/:projectId/interchange/dry-run` | Parse an uploaded `file` (multipart) → `200 { data: InterchangeReport }`; **no write**. Optional form fields `globalCalendarScope=PROJECT\|ORG` (default `PROJECT`) and `resourceResolutions` (JSON). 422 unrecognised/malformed/no file or bad option · 413 oversize. `interchange:import`. |
| POST   | `…/projects/:projectId/interchange/commit`  | Re-parse the uploaded `file` (multipart) and create a plan → `201 { data: { planId, report } }`. Same optional form fields. One transaction (calendars + activities + dependencies), then recalculate. Same 422/413, plus 422 `UNRESOLVED_RESOURCE_COLLISIONS`.                              |

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

**Resource-name collisions** are the one thing an import will not decide for you. A source resource whose
`code` matches a library row **is** that row — a code is an identifier, and matching one is not a guess. The
ambiguous case is a code that matches nothing while the **name** is already taken: `uq_resources_org_name`
refuses the insert, and both ways out change real data. So the dry-run reports each one in
`report.resourceCollisions` (`{ resourceKey, name, code, existing: { id, name, code, archived } }`, **absent
when there are none**), and the commit takes an answer per resource in the optional `resourceResolutions`
form field — a JSON object keyed by `resourceKey`:

- **`REUSE_EXISTING`** — bind the imported assignments to the library row already there. The file's own rate
  and calendar for that resource are **not** imported.
- **`CREATE_COPY`** — create a separate resource, renamed `"<name> (imported <date>)"`, so the file's own
  rate and calendar survive.

Either answer is recorded as a `repair` finding on the post-commit report. A collision with **no** answer
fails the commit with **422 `UNRESOLVED_RESOURCE_COLLISIONS`** (`details.collisions` carries the unanswered
list) rather than being guessed: the resource library is org-global, and levelling, over-allocation and
Earned Value all read from one pool — reusing the wrong row discards rates for a crew that may not be the
same crew, and duplicating one splits its demand across two rows that each look half-loaded. Calendars take
the **opposite** route on purpose (always created, suffixed, reported): a duplicated calendar is inert until
something is scheduled on it, so there is nothing to ask about.

**Imported calendars land in the target project, not the shared library** (ADR-0053 §5). An import
creates each calendar at **`PROJECT`** scope pinned to the target project — so a fresh import adds
**zero rows** to the organisation library and its calendars are deleted with the project. Two
exceptions, both **named in the report**: a calendar an imported **resource** holds is forced to
**`ORG`** (a resource is organisation-global and can hold nothing else), and a source **global**
calendar (P6 `clndr_type = CA_Base`) is created at `ORG` when the caller sends
`globalCalendarScope=ORG` — otherwise it lands in the project with a "promote it if others need it"
finding. A calendar name the target tier already holds is created afresh as
`"<name> (imported YYYY-MM-DD)"` and reported as a repair — **never silently reused**, because two
calendars sharing a name can have different working weeks. **Export** emits `clndr_type` from the
stored tier, so an XER export→import round trip preserves it; MSPDI has no equivalent field and
reports the tier as a drop.

### Calendar scope tiers (ADR-0053)

A calendar belongs to one of two **tiers**: **ORG** (the shared organisation library — the default, and
what every calendar was before ADR-0053) or **PROJECT** (local to one project). Both live on the same
`…/calendars` resource; `scope` + `projectId` are additive fields on every calendar request and response,
so **no existing call changes shape or meaning**.

| Method | Path                                                     | Notes                                                                                                                                                                                  |
| ------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `…/organizations/:orgSlug/calendars`                     | **+ query** `scope=org\|project\|all` (**default `org`** — today's result set). **+ response fields** `scope`, `projectId`.                                                            |
| GET    | `…/organizations/:orgSlug/projects/:projectId/calendars` | **NEW** — the calendars **usable in** this project: its own PROJECT-scoped ones **plus** every ORG-scoped one. Cursor-paginated. Foreign/unknown project → 404.                        |
| POST   | `…/organizations/:orgSlug/calendars`                     | **+ body** `scope` (default `ORG`), `projectId`. `scope: ORG` additionally requires **`calendar:manage_org`**; `scope: PROJECT` requires an active in-org `projectId` (404 otherwise). |
| PATCH  | `…/organizations/:orgSlug/calendars/:calendarId`         | **+ body** `scope`, `projectId` — the **promote / narrow** path, version-gated, requiring `calendar:manage_org`.                                                                       |
| DELETE | `…/organizations/:orgSlug/calendars/:calendarId`         | Unchanged, except an **ORG**-scoped calendar additionally requires `calendar:manage_org`.                                                                                              |

**New rejections** (every other calendar status code is unchanged):

| Status | `details.reason`                   | When                                                                                                                                                                                           |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 422    | `CALENDAR_WRONG_SCOPE`             | A PROJECT-scoped calendar was assigned to a plan or activity **outside** its owning project. `details.projectId` names the owner.                                                              |
| 422    | `RESOURCE_REQUIRES_ORG_CALENDAR`   | A PROJECT-scoped calendar was assigned to a **resource** — the pool is org-global (ADR-0039), so a resource may only hold an org-global calendar. `details` carries the offending `projectId`. |
| 422    | `CALENDAR_SCOPE_PROJECT_MISMATCH`  | `scope: PROJECT` without a `projectId`, or `scope: ORG` with one.                                                                                                                              |
| 409    | `CALENDAR_SCOPE_NARROWING_BLOCKED` | Narrowing an ORG calendar while active plans/activities outside the target project — or **any** active resource — still use it. `details` carries `{ plans, activities, resources }`.          |
| 409    | `DUPLICATE_CALENDAR`               | A name collision **within a tier**. The same name in two different projects, or in a project and the org library, is allowed by design.                                                        |

A calendar id from **another organisation**, soft-deleted, or unknown remains an indistinguishable **404**
at every seam — the tier is never a cross-tenant existence oracle. Scope-filtered listing is a **usability**
filter, not an authorisation boundary: the security control is the server-side write guard, applied at
`plan.calendarId`, `activity.calendarId` and `resource.calendarId` alike.

Deleting a project soft-deletes its PROJECT-scoped calendars (and their exceptions) in the **same batch**,
so restoring the project restores them; ORG-scoped calendars are never touched.

### Calendar hours: shifts and exception windows (ADR-0036 §2, ADR-0067)

Storage is **intraday windows**, not whole days. Both the weekly pattern and a dated exception can be
authored either way, and the two spellings of each pair are **mutually exclusive** — sending both is a
422 naming the pair, because they are two answers to one question.

| Surface         | Shorthand         | Storage form                                  | On read                                    |
| --------------- | ----------------- | --------------------------------------------- | ------------------------------------------ |
| Weekly pattern  | `workingWeekdays` | `shifts: [{weekday, startMinute, endMinute}]` | both — the mask is derived from the shifts |
| Dated exception | `isWorking`       | `windows: [{startMinute, endMinute}]`         | both — `isWorking` is `windows.length > 0` |

The shorthand is lossy on purpose: a mask can say only _whether_ a weekday works, and `isWorking` only
whether a day works at all. A split shift, a half-day Friday and a short-crew shutdown day are visible
only in `shifts`/`windows`. Minutes run from local midnight; **1440 is 24:00**, never a wrap — a night
shift crossing midnight is **two adjacent-day windows**, and nothing pairs them back together on read.

Windows must be sorted, non-overlapping within a day, and `start < end`. An unsorted array is rejected
rather than quietly sorted: storage is order-sensitive, and reordering the author's input hides which
pair they got wrong. An **empty** `windows` array is refused too, so "no working time" has exactly one
spelling (`isWorking: false`, or simply omitting both).

### The standard working day, and what `…Days` fields mean (ADR-0068)

A calendar carries a **standard working day** — P6's `day_hr_cnt`:

| Field                | Where                                         | Meaning                                                              |
| -------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `hoursPerDay`        | calendar create/update **request**, and reads | The standard working day in hours, 0.25–24. May be fractional (7.5). |
| `hoursPerDayMinutes` | calendar reads only                           | The stored truth behind it. `1440` is a 24-hour day.                 |

Omitting `hoursPerDay` on a write **derives** it from the weekly pattern being written — the modal
daily working hours among the days that work, or 24 for a calendar with no base week. It is derived
**once, at that write, and stored**: a standing derivation would make the factor a function of the
shift rows, so shortening one Friday would silently reinterpret every stored duration.

**This is the day↔minute factor for every day-denominated field measured on that calendar**, and it
changes what those fields have always meant:

| Field                                          | Measured on                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `durationDays`, `remainingDurationDays`        | the **activity's own** calendar, else the plan's                           |
| `levelingDelayDays`, `totalFloat`, `freeFloat` | the same                                                                   |
| `lagDays`                                      | the **relationship's lag calendar** (`TWENTY_FOUR_HOUR` is pinned at 1440) |
| a baseline's `durationDays`                    | the factor **frozen at capture**, not the live calendar                    |

So `durationDays: 5` on an eight-hour calendar is 2,400 working minutes, not 7,200; and the same
2,400 minutes reads back as `5` there, `2.5` on a sixteen-hour two-shift calendar and `2` (from
1.67) at twenty-four hours. Clients that assumed a day was always 1440 minutes should send
`durationMinutes` / `lagMinutes`, which are exact and unaffected.

Changing a calendar's `hoursPerDay` does **not** rewrite stored durations and moves no dates. It
changes what the same stored minutes are reported as.

### `CALENDAR_WORKING_TIME_UNREACHABLE` (422)

The engine's walk-time sibling of the build-time reject below (`docs/TECH_DEBT.md` #205(b)): a
calendar can hold SOME working time that the schedule still cannot reach — a window-only calendar
whose only working exception sits outside the span the walk needs (the conformance fixture's
CAL-05 is the canonical case), or a dated blackout longer than the engine's horizon. The walk
throws a typed `WorkingTimeHorizonExceededError`, mapped to 422 `CALENDAR_WORKING_TIME_UNREACHABLE`
at **every** service seam that reaches the working-time walk — five today: **recalculate** (and
the programme variant, via the shared per-plan recalculation), the **critical-path test**,
**float-paths** (it runs the same compute as a recalculation), and **earned-value** and the
**resource-histogram** (both walk per-assignment lag phasing, ADR-0071 §1). Previously the first
two 500ed and the last three still did — the enumeration is now computed
(`horizon-seams.structural.spec.ts`), so a new seam fails CI until it maps the error. `calendarId`
is carried **only when it is unambiguous** (the plan schedules everything on one calendar);
otherwise it is `null` rather than a guess (ADR-0076).

### `CALENDAR_HAS_NO_WORKING_TIME` (422)

A calendar with an empty week and no working exceptions has no working time at all. It is a valid
thing to store — it is a turnaround calendar mid-authoring — but nothing can be scheduled on it, so
**recalculate** (`POST …/schedule/recalculate`, `…/recalculate-programme`) and **baseline variance**
(`GET …/baselines/variance`) reject with 422 `CALENDAR_HAS_NO_WORKING_TIME`, carrying the calendar's
id and name. Previously these 500ed.

| Method | Path                                              | Notes                                                                                                                                                                                |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `…/calendars/:calendarId/exceptions`              | Add a dated exception. `windows` or `isWorking`; neither ⇒ a holiday.                                                                                                                |
| PATCH  | `…/calendars/:calendarId/exceptions/:exceptionId` | Edit its hours and/or label, gated on the **exception's** `version` (409 when stale) and bumping the **calendar's**. Sending neither `windows` nor `isWorking` edits only the label. |
| DELETE | `…/calendars/:calendarId/exceptions/:exceptionId` | Soft delete.                                                                                                                                                                         |

The exception's **date is not editable**: moving one is deleting it and adding another, which the two
surrounding endpoints already do visibly. `endDate` is returned on every read — storage holds a range,
only a single day is authorable, and a field the client cannot see is a field it cannot be told changed.

A calendar with **no working time at all** — an empty weekly pattern and no working exception — is a
valid thing to be part-way through building, and an impossible thing to schedule on. It is refused at
**recalculation and baseline variance** with a 422 `CALENDAR_HAS_NO_WORKING_TIME` naming the calendar,
not at create: only the engine sees the weekly pattern and the exceptions together.

### Resource hierarchy (ADR-0053 §3)

The org resource pool stays **one flat pool** for scheduling and gains a **navigation tree**: every
resource carries a nullable `parentId`, and a new `ResourceKind` value **`GROUP`** is a
non-assignable grouping node. Every addition is optional and every existing field keeps its meaning,
so **no existing call changes shape**.

| Method       | Path                                             | Notes                                                                                                                                                                       |
| ------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET          | `…/organizations/:orgSlug/resources`             | **+ query** `parentId=<uuid>` (a group's direct children) or `parentId=null` (top level); **omitted = today's flat library**. **+ response field** `parentId` on every row. |
| POST / PATCH | `…/organizations/:orgSlug/resources[/:id]`       | **+ body** `parentId` (uuid, or `null` for top level — on PATCH, **omitted** means "unchanged"). `kind` additionally accepts `GROUP`.                                       |
| DELETE       | `…/organizations/:orgSlug/resources/:resourceId` | Unchanged for a leaf. Deleting a **`GROUP`** soft-deletes its whole active **subtree** under one `delete_batch_id`, and its `RESOURCE_IN_USE` count spans that subtree.     |
| POST         | `…/activities/:activityId/assignments`           | Unchanged shape; **new reject** 422 `GROUP_NOT_ASSIGNABLE`.                                                                                                                 |

There is deliberately **no `?tree=true` response**: every row carries its `parentId` and the tree is
acyclic, same-org and ≤ 10 deep by invariant, so a client that pages the library nests it itself.

**New rejections:**

| Status | `details.reason`                 | When                                                                                                                                                    |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 422    | `GROUP_NOT_ASSIGNABLE`           | A `GROUP` was assigned to an activity, or set as its driver. A group is never an assignment endpoint.                                                   |
| 422    | `RESOURCE_PARENT_NOT_GROUP`      | The proposed `parentId` is an in-org resource that is not a `GROUP`.                                                                                    |
| 422    | `RESOURCE_PARENT_WRONG_SCOPE`    | The proposed parent is in-org but unusable (the guard's fail-closed same-org re-check).                                                                 |
| 422    | `RESOURCE_TREE_TOO_DEEP`         | The move would exceed 10 levels, measured as the new parent's depth **plus the moved subtree's height**. `details` carries `maxDepth`/`resultingDepth`. |
| 422    | `GROUP_HAS_NO_SCHEDULING_FIELDS` | A `GROUP` was given a `calendarId`, `maxUnitsPerHour` or `costPerUnit`. `details.fields` names them.                                                    |
| 409    | `RESOURCE_PARENT_CYCLE`          | The proposed parent is the resource itself or one of its descendants. Nothing is written.                                                               |
| 409    | `RESOURCE_IN_USE`                | Existing code; for a `GROUP` the `count` spans the whole subtree and `details.subtreeSize` says how many rows it covers. Also raised on `kind → GROUP`. |
| 409    | `RESOURCE_GROUP_HAS_CHILDREN`    | `kind` changed **away** from `GROUP` while it still contains rows. Reparent them first.                                                                 |

A `parentId` from **another organisation**, soft-deleted, or unknown is an indistinguishable **404** —
the tree is never a cross-tenant existence oracle.

### Library archive, search & filter (ADR-0053 §4)

Both shared libraries — calendars and resources — gain an **archive** lifecycle and server-side
**search/filter**. Archive is **orthogonal to delete**: an archived row is still entirely valid, keeps
every existing reference live and **keeps scheduling identically**; it is hidden from the default list
and from every picker, and only a **new** usage is refused. Archiving is deliberately **not** blocked by
use — it is the only way to retire a calendar that `CALENDAR_IN_USE` (correctly) refuses to delete.

`archivedAt` (ISO instant or `null`) is an additive response field on every calendar and resource, and
every query param below is optional with a default that reproduces today's result set — so **no existing
call changes shape or meaning**.

| Method | Path                                                     | Notes                                                                                                                                                                       |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `…/organizations/:orgSlug/calendars`                     | **+ query** `q` (name, case-insensitive substring, ≤ 100 chars, trimmed), `archived=exclude\|include\|only` (**default `exclude`**). **+ response field** `archivedAt`.     |
| GET    | `…/organizations/:orgSlug/projects/:projectId/calendars` | **+ query** `q`, `archived` (same semantics). No `scope` — this route's contract is "the calendars usable here".                                                            |
| POST   | `…/organizations/:orgSlug/calendars/:calendarId/archive` | **NEW** — `204`. Body `{ version }` (optimistic; stale → 409). An **ORG**-scoped calendar additionally requires `calendar:manage_org`.                                      |
| POST   | `…/calendars/:calendarId/unarchive`                      | **NEW** — `204`. Same body and permissions. Cannot fail on a name collision: an archived calendar keeps its name.                                                           |
| GET    | `…/organizations/:orgSlug/resources`                     | **+ query** `q` (matches **name OR code**), `kind` (a `ResourceKind`, incl. `GROUP`), `archived`. **+ response field** `archivedAt`. Combines with the existing `parentId`. |
| POST   | `…/organizations/:orgSlug/resources/:resourceId/archive` | **NEW** — `204`. Body `{ version }`. `resource:update`. Archiving a `GROUP` does **not** archive its subtree.                                                               |
| POST   | `…/resources/:resourceId/unarchive`                      | **NEW** — `204`. Same body and permission.                                                                                                                                  |

**New rejections:**

| Status | `details.reason`    | When                                                                                                                                                                                                                                                       |
| ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 422    | `CALENDAR_ARCHIVED` | An archived calendar was bound to a plan, activity or resource. Only a **new** binding is refused — re-submitting the binding the holder already has still succeeds, so an entity already on an archived calendar stays editable.                          |
| 422    | `RESOURCE_ARCHIVED` | A **new** assignment was created against an archived resource. **Editing an existing assignment** (units, rate, cost, curve) still succeeds — maintaining history is not new exposure.                                                                     |
| 409    | `DUPLICATE_*`       | Creating an **active** row on an archived row's name (or a resource's `code`). An archived row keeps its handles, so unarchive can never fail; `details` carries `archivedCalendarId` / `archivedResourceId` so a client can offer "unarchive it instead". |

Archived rows are still counted by the §2 scope-**narrowing** guard (archived ≠ deleted — the reference
is live) and are still swept by the project-delete cascade. Deleting an archived row obeys the ordinary
`RESOURCE_IN_USE` / `CALENDAR_IN_USE` rules — archive does not bypass the delete guard.

The `archived` filter, like `scope`, is a **usability** control and never an authorisation boundary: the
security controls are the write-time rejects above, applied server-side whatever a list returns. `q` is a
case-insensitive substring match bounded by the org filter; there is deliberately no index for it (see
`docs/TECH_DEBT.md` for the measured `pg_trgm` escalation).

### The audit log (ADR-0072)

Two read endpoints over the append-only `audit_events` table. There is no write endpoint and there
never will be — events are recorded by the actions that cause them, inside those actions'
transactions, and the table's triggers refuse `UPDATE`, `DELETE` and `TRUNCATE`.

| Method | Path                                    | Notes                                                                                                                                                          |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `…/organizations/:orgSlug/audit-events` | **NEW** — the organisation's events, newest first, cursor-paginated. `audit:read` (**Org Admin only**). A non-member 404s before the permission check can 403. |
| GET    | `/api/v1/me/audit-events`               | **NEW** — the caller's OWN events, across every organisation plus the org-less authentication rows. **No permission and no user id** — see below.              |

**`/me/audit-events` takes no user id.** Not an optional one, not a defaulted one: the actor comes
from the session, so there is no parameter a caller could change to read somebody else's history.
That is why the route needs no permission — anti-IDOR by construction rather than by a guard, and it
is what lets a Viewer or Contributor read their own sign-in history without an Org Admin's help.

Ordering is `occurred_at DESC, id DESC` and the cursor is keyset over that pair. `id` breaks the tie
because two events can share a millisecond, and a cursor on time alone would skip or repeat a row at
a page boundary.

**`ipAddress` and `userAgent` are recorded and not returned.** They are evidence for an
investigation, but the ordinary reader here is an Org Admin looking at a membership history, and a
colleague's home IP on that screen is a privacy cost with no matching benefit. Exposing them is a
decision with its own scope; `@repo/types`' `AuditEvent` has no such fields, so the response DTO's
`implements` enforces it rather than describing it.

`changes` is an allow-listed, redacted `{ before, after }` — **both sides always present**, so a
reader can tell "set from nothing" from "unchanged" without knowing the action's semantics — or
`null` for the five authentication actions, whose allow-list is deliberately empty.

#### What earns an event (ADR-0073 C3)

There is no write endpoint, so the vocabulary is the contract. A mutating route records an event
if it passes **either** of two tests, and **no** route records one by default:

- **Durability** — does the product otherwise keep a durable record that this happened, and who did
  it? A create or an ordinary update does (`created_by` / `updated_by`); a **delete or restore** is
  the act that erases its own trace, and a **bulk import** produces hundreds of rows with no
  per-row story. The latter two record.
- **Blast radius** — does this change the rules by which **other people's** work is evaluated? A
  plan's data date, a shared calendar's working time, a library object's availability, and a logic
  **link** all do; an activity's own duration, name, lane or progress does not.

Two consequences a client can rely on. **Editing an activity's own fields is never recorded** —
permanently, not pending — so a screen must not describe that as "not yet". And an action that
sweeps many rows writes **one** event carrying scalar counts, never one per swept row: a delete of a
WBS summary with forty descendants and sixty links is one `activity.deleted` with
`activityCount` / `dependencyCount` and the shared `deleteBatchId`. The same shape now applies to
`client.*` / `project.*` / `plan.*`, which previously carried the batch id and not the size.

One event is written **outside** its write's transaction, and only one: `interchange.imported`. The
import's phase 2 hard-deletes the created plan if the recalculation fails, and `audit_events` is
append-only — so a row written with the graph could outlive its subject and permanently claim an
import that was rolled back. It is written once the import is durable instead. Every other event in
families D–G shares its write's transaction and disappears with it.

Refused mutations record **nothing** in families D–G — no `DENIED` row for a 423 from the edit-lock
or a 409 from an optimistic-lock retry, both of which mean "two people were working at once". A
`DENIED` row is written only where an _attempt_ is itself signal: a refused permission change.

#### Filtering the audit reads (ADR-0073)

Both endpoints accept the same optional narrowing. **Omitting every parameter returns exactly the
page they returned before it existed**, which is what lets the client ship the controls behind a
flag without changing the request.

| Param     | Shape                                                        | Notes                                                                       |
| --------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `action`  | repeatable; up to the vocabulary size; each an `AuditAction` | Union, not intersection. Repeat the param: `?action=plan.deleted&action=…`. |
| `outcome` | repeatable; `SUCCESS` \| `DENIED` \| `FAILURE`               | Union.                                                                      |
| `from`    | ISO-8601 instant                                             | **Inclusive** lower bound on `occurred_at`.                                 |
| `to`      | ISO-8601 instant                                             | **Inclusive** upper bound, and must not precede `from`.                     |

**An unmatchable value is a 422 naming it — never a 200 with an empty page.** An unknown action or
outcome, more actions than the vocabulary holds, a malformed instant and an inverted range are all
rejected. (The action cap is **derived from the vocabulary**, not a literal: it shipped as a
hand-written `20` and fell behind the moment the coverage rung grew the catalogue, so an ordinary
two-category selection started 422ing. A bound computed from `AUDIT_ACTIONS` cannot drift.) A filter
that silently matches nothing is the `order` lesson (TECH_DEBT #19) in the one context where it is
worse than usual: an audit log answering "no events" to a misspelled filter reads as evidence that
nothing happened.

**`auth.*` actions are refused on the organisation route (422).** Those rows carry no
`organization_id` — authentication happens before an organisation is known — and that read filters
on exactly that column, so the filter could only ever return an empty page. It is also, measured,
the most expensive query the table accepts: with no index on `action`, proving the absence means
walking the whole organisation partition (681–954 ms at 1M rows, against 0.35 ms for the unfiltered
page). Read your own sign-in history on `/me/audit-events`, which is the one place those rows are
answerable.

#### Widening `/me` to attempts against you (ADR-0073 C2)

`GET /api/v1/me/audit-events?include=attempts` additionally returns **failed sign-ins against your
own email address** — `auth.sign_in_failed` rows, which carry neither an organisation nor an actor
and are therefore returned by no other endpoint to anybody.

| Param     | Shape                  | Notes                                                            |
| --------- | ---------------------- | ---------------------------------------------------------------- |
| `include` | repeatable; `attempts` | Omit for exactly the response this route gave before it existed. |

An unknown projection is a **422**, on the same rule as the filter values above.

**How the row becomes yours.** The attempted address is resolved to a user id at **write time**,
into `subject_id`. It is not matched at read time: addresses get reassigned, so a read-time join
would silently move one person's history into another person's account as the mapping changed.

Three consequences worth knowing before relying on this:

- **It is forward-only.** The table refuses `UPDATE` at the database (ADR-0072), so attempts
  recorded before this shipped cannot be attributed and will never appear.
- **An attempt against an address nobody registered is invisible here**, because there is no
  account to attribute it to. That is not a gap to fix — there is no subject.
- **It is not an existence oracle.** The lookup runs on both branches and changes nothing the
  caller can observe about the sign-in; the answer surfaces only in that account holder's own feed.

The organisation log never returns these rows whatever is asked of it.

Filters go into the `WHERE`, never a post-filter over a fetched page, so `limit` is honoured with a
filter that excludes most rows. **No index ships with the filter**; the composite is a per-slice
decision for the coverage milestone, on a fresh measurement (ADR-0073 "Measured, C1").

### The recycle bin, and what expires (ADR-0096)

`GET /organizations/:orgSlug/deleted` — the organisation's soft-deleted clients, projects and plans
in one keyset-paged list, ordered by `deletedAt DESC, id`. Requires `client:read`; a non-member gets
**404**, never 403 (no existence oracle). Restore is per-entity on the owning resource
(`POST …/clients/:id/restore` and siblings); **there is no purge route and there will not be one** —
ADR-0096 D1 refuses it structurally, so permanent deletion is only ever the retention timer's.

Each item carries:

| Field                                | Meaning                                                                                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kind` / `id` / `name` / `deletedAt` | The deleted thing.                                                                                                                                                                                                                         |
| `canRestore`                         | Whether restoring this row alone is legal — false when a live ancestor is required.                                                                                                                                                        |
| `deleteBatchId`                      | **The cascade's identity.** Deleting a client stamps ONE id across its projects and plans, and the restore is keyed on it, so those rows return together whatever the caller presses. Null only for a row deleted before batching existed. |
| `blockedBy`                          | The ancestor that must come back first: `{ kind, id, name, deleteBatchId }`, or `null`. Drawn from the same organisation-scoped query as the row itself, so it can never name an ancestor in another organisation.                         |

`blockedBy.deleteBatchId` is the field that matters: **equal to the row's own** means the blocker is
part of the same cascade and a single restore of the batch root takes both — the caller should
present them as one deletion. **Different** is the only case a caller must surface, because two
separate restores are genuinely required.

`meta` extends the usual page meta rather than replacing it — this is the first list that is both
truly paged and carries fields that are not a roll-up of the page:

```jsonc
{
  "nextCursor": null,
  "hasMore": false,
  "retentionDays": 90, // the SERVER's period
  "retentionActive": false, // whether anything is actually deleted
}
```

Both are **installation configuration, not organisation data**, and they are served here because a
client that hardcoded the period would be silently wrong on any host that overrode it. Read them
together: `retentionActive: false` is the shipped default, and it means deleted work is kept
indefinitely — a countdown rendered from `retentionDays` alone would state a consequence the
installation does not deliver.

### The organisation overview (ADR-0098)

`GET /api/v1/organizations/:orgSlug/overview` — the screen every sign-in already lands on.
Not paginated, and it carries **no `meta`**: there is nothing to add.

**One endpoint, not one per section.** All three sections resolve the same organisation, check
the same permission and read the same database in the same request, so partial failure is not a
real mode — per-section isolation buys nothing and costs a second round trip on the coldest path
in the product.

Two shape rules are load-bearing and worth stating here rather than only in the DTO:

- **`changedBy` is a discriminated union, never a nullable name.** `{ kind: 'MEMBER', name }`,
  `{ kind: 'FORMER_MEMBER' }` and `{ kind: 'UNKNOWN' }` are three different facts. A nullable
  string collapses the last two into an absence a reader cannot tell from a defect. Names are
  resolved **through the organisation's membership**, never through `users` directly — which is
  what stops this endpoint turning an arbitrary user id into a display name.
- **Sections the caller may not read are OMITTED, not zeroed.** `pendingInvitationCount` is
  absent without `invitation:read`; `expiringDeletedCount` is absent unless the caller may
  restore **and** hierarchy retention is armed on this host. A zero is a fact about the
  organisation; an absence is a fact about the reader, and sending `0` would tell a Contributor
  there is an answer they may not have.

**"Recently changed" is ordered by `GREATEST(plan, newest activity, newest dependency)`**, not by
`plans.updated_at` — editing an activity does not stamp its plan, and neither does the CPM
recalculation (ADR-0022). An ordering on the plan row alone ranks a plan somebody has been working
in all morning below one whose name was corrected last week, and every row on the screen still
looks correct.

**`?recentPlanIds=<uuid>` (repeatable, at most 5) resolves ids to `recentPlans`** — the browser's
"Jump back in" list. The client stores plan **ids only** and asks for their current names on every
load, which is what makes a rename correct itself and a plan the reader has lost access to
disappear rather than 404 on click. It rides on this request rather than taking one of its own:
that is the constraint that made the section acceptable on the coldest path in the product.

That parameter hands the server ids the caller may have no right to, so **the four ways an id can
fail are indistinguishable by design**: deleted, another organisation's, unreadable, and never
real all produce a byte-identical response. There is no `reason` field, no partial-failure list and
no dropped count, because any of them would turn this into an existence oracle for every plan in
the installation, reachable by any member. `recentPlans` preserves **the caller's order** — that
order is the browser's own recency and the server has no basis to improve on it. A malformed id or
more than five is a **422**: a client sending a non-UUID has a bug rather than a permission
problem, and saying so discloses nothing about the organisation's contents.

## Pagination, filtering, sorting

- **Cursor-based** pagination for lists: `?limit=20&cursor=<opaque>`; responses
  include `meta.nextCursor` and `meta.hasMore`.
- Filtering via explicit query params; sorting via `?sort=field&order=asc|desc`.
- **A list declares `order` only if it honours it.** The shared
  `PaginationQueryDto` deliberately does **not** carry `order`: it used to, which
  meant every list advertised a sort-direction param in its OpenAPI while all but
  one ignored it. A documented no-op is worse than an absent feature — the client
  sends `order=desc`, gets a `200`, and reads the wrong page with nothing to
  suggest anything went wrong. Most lists have a fixed direction that is a
  product decision (a member roster reads oldest-first; a note thread reads
  newest-first), and that is fine; it is advertising the opposite that is not.
  To make a list's direction caller-controllable, declare `order` in **that
  list's** query DTO and thread it into the `orderBy` — a `(created_at, id)`
  keyset is direction-agnostic provided both terms flip together. See
  `ListBaselinesQueryDto`, the one list that does.
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
- `PATCH …/plans/:planId/activities/parents` with `{ parents: [{ id, parentId, version }] }` is the
  WBS-membership sibling — a `null` `parentId` files the activity back at the top level. `parentId`
  is **required but nullable**: this is a batch of complete rows, not a partial `PATCH`, so an
  omitted field is a validation error rather than a silent "top level". Unlike `positions` it is
  **structural**: `parentId` feeds the engine's WBS rollup, so a committed batch leaves the plan's
  computed dates stale until the next recalculation.
- `PATCH …/plans/:planId/activities/placements` with
  `{ placements: [{ id, version, constraintType, constraintDate, visualStart, laneIndex }] }` is the
  third member of the family: where an activity goes **in time**, and optionally in lane. Every
  field is **required but nullable**, the `parents` rule — an omitted field is a validation error,
  never a silent clear — with one field where null carries a different meaning: a null `laneIndex`
  leaves the lane unchanged, because a bulk time shift moves bars along x and must be able to leave
  y alone. It carries placement fields and nothing else, so a bulk move cannot rename forty
  activities, and a `WBS_SUMMARY` is `422 SUMMARY_NOT_BULK_ELIGIBLE` (a summary's dates are an
  engine rollup, so there is nothing on it to place). **Structural**, like `parents`.
- **A batch delete is a `POST`, not a `DELETE`.** `POST …/plans/:planId/activities/bulk-delete`
  with `{ activities: [{ id, version }] }` returns **200** with
  `{ deleteBatchId, activityCount, dependencyCount }`. `DELETE` on the collection has no body in
  any framework a client can rely on, and the rows carry versions; the batch-write `PATCH` rule
  above does not extend to deletion. Every swept row shares **one** `deleteBatchId` — that is the
  point of the endpoint rather than a detail, because it is what makes the undo one restore rather
  than N, and what keeps a link between two deleted activities restorable at all. Leaf-only: a
  `WBS_SUMMARY` is `422`, since deleting one cascades to its whole subtree.
- `POST …/plans/:planId/activities/restore-batch/:batchId` (**200**) reverses it — every activity
  back with its **original id**, so the dependencies between them come back too. Re-creating the
  activities instead would mint new ids and silently drop that logic, which is a different schedule
  wearing the same shape.
- `DELETE …/activities/:activityId` answers **200 with `{ deleteBatchId }`**, not `204`. The id has
  always existed — `cascadeSoftDelete` assigns one per delete, covering the whole subtree when the
  activity is a `WBS_SUMMARY` — but a bodiless response meant a client could not call
  `POST …/plans/:planId/activities/restore-batch/:batchId` on the rows it had just deleted. That is
  why undoing a copied WBS band had no redo (`docs/TECH_DEBT.md` #113): the undo deletes the copy's
  root and lets the cascade run, and the redo needs an id nobody was told. It is one of the few
  `DELETE`s here that is not `204`, and the reason is the "can the caller derive it?" test the
  §"200 or 204" rule applies: this caller genuinely cannot. Note what moved — the **status code**,
  204 → 200. A caller reading the body is unaffected; one branching on the status, or a generated
  client treating 204 specially, is not, and five of this repository's own e2e specs had to change
  `.expect(204)` to `.expect(200)`. This entry said "additive rather than breaking" until the API
  review put that claim next to the diff disproving it (ADR-0076).
- `POST …/activities/:activityId/dissolve` (**200**) removes a WBS summary's grouping and **keeps
  the work**: its direct children take its own parent, then the now-childless summary is
  soft-deleted, in one transaction. It is a separate endpoint from `DELETE`, not a flag on it,
  because `DELETE` cascades to the whole subtree — the destructive reading must never be the
  default. Restoring a dissolved summary brings back the summary **alone**; the promotion is not
  undone. It returns `{ promoted: [{ id, parentId, version }] }` rather than `204`, because it
  mutates **sibling rows the caller never named** and bumps each one's `version`: a client cannot
  derive which activities were children, so a bare 204 would leave every cached child stale and
  409-ing on its next save for a reason the user did not cause (the cross-resource-recompute rule
  above, applied to the WBS tree).
- A batch whose items are individually valid may still be **jointly** invalid. `parents` is checked
  against the **resulting** tree, not the current one, so `[{A→B}, {B→A}]` — two rows that each
  file a childless top-level summary under another — is a `409 PARENT_CYCLE`. Validate the state a
  batch would produce, never row against pre-state. A row naming **itself** as its parent is
  unconditionally invalid input rather than a state-dependent conflict, so it is a distinct
  `422 SELF_PARENT` — `details.reason` is the field a client branches on, and must not mean two
  different things under two different statuses.

## Validation & data types

- Requests validated with `class-validator` DTOs; unknown properties rejected.
- Money is **`BIGINT` minor units** with a per-plan `currencyCode` — never
  floating point — and every money DTO carries an explicit `@Max` ceiling.
  Timestamps are **ISO 8601 UTC** strings.
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
  are activity-write data (`activity:update`, no new permission) and the `PUT`
  **requires the plan edit-lock** (ADR-0028 / ADR-0060 §5) like every other activity
  write — a `423` when enforcement is on and the caller does not hold the pen. The
  `GET` is member-level and never gated. When present,
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

- `GET …/schedule/health-check` reads a plan's **DCMA 14-point schedule health
  report** (health M1, `schedule:read` — every member). A pure read over the
  persisted definition and CPM columns: **the CPM engine is not invoked**, no lock
  or transaction is taken, and nothing is written. The `metrics` array is always
  exactly **14 entries, one per `HealthMetricId`, in ordinal order — never
  sparse**; a metric that could not be computed is present with
  `verdict: NOT_ASSESSABLE` and a typed `reason`, never omitted, never a 4xx.
  The per-metric shape is a documented discriminator on `verdict` (a
  `NOT_ASSESSABLE` row has `measured: null`, `detail: null`, empty offenders).
  Thresholds and the offender cap travel **in the payload** — a client never
  restates either. **The response does not vary by role**: it carries no cost,
  rate or budget field at any depth (metric 10 is narrowed to
  resource-assignment existence and says so in `detail.narrowing`), so one URL
  produces one document — a handover artefact. Shares the global throttle
  budget (measured: `docs/specs/schedule-health-check/m0-measurement.md`).

- `GET …/schedule/health-check/critical-path-test` runs **DCMA metric 12, the
  Critical Path Test, as a read-only what-if** (health M6, `schedule:read` —
  every member). **This route runs the CPM engine — twice** — on an in-memory
  copy of the plan graph: a control pass, then a pass with 600 working days
  injected into the front of the critical path, and the verdict from whether
  the control run's completion carrier moved in step. Its parity claim is
  deliberately the report route's WEAKER sibling (ADR-0116 D7): it computes
  **read-only and persists nothing** — no lock, no pen, no write path — proved
  by an e2e reading every engine-owned column back after the call. Returns the
  upgraded metric-12 row in the report's own `HealthMetricResult` shape;
  everything injected (amount, tolerance, subject, completion carrier) rides
  `detail`, so the verdict is reproducible by hand. Its own throttle
  (**14/60 s**) is derived from a committed formula and measurement
  (`docs/specs/schedule-health-check/m6-measurement.md`), never copied from
  the float-paths budget.

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
