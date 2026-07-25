# ADR-0053: Calendar scoping tiers & the resource management layer

- **Status:** Accepted (M1 — §1 the tier, §2 the guard & lifecycle). §3 (resource hierarchy)
  accepts with M3, §4 (archive) with M4, §5 (interchange tiering) with M5 — see the
  acceptance-status ledger at the foot of this ADR.
- **Date:** 2026-07-25
- **Deciders:** Product Owner (scope, CQ-1…CQ-7), Solution Architect, Technical Lead;
  schema / CHECK / indexes / migration safety designed with the **database-architect** agent
- **Feature spec:** [`docs/specs/library-scoping-and-manageability/feature-spec.md`](../specs/library-scoping-and-manageability/feature-spec.md)
- **Implementation plan:** [`docs/specs/library-scoping-and-manageability/implementation-plan.md`](../specs/library-scoping-and-manageability/implementation-plan.md)

## Context

SchedulePoint's two shared libraries — **calendars** (ADR-0024/0036) and **resources**
(ADR-0039) — are **org-global and flat**. That was the right v1 shape for one project; it does
not survive a real tenant.

**Calendars are missing a tier.** P6 has three: **Global**, **Project** and **Resource**.
SchedulePoint has the org tier (`calendars.organization_id`) and the per-resource one
(`resources.calendar_id`), but **no project tier**. Every one-off a planner needs — "Client X
winter shutdown", "Tunnel drive night shift", "Phase 2 turnaround" — permanently pollutes the
library every other project picks from. The pollution is worst where it is least visible:
**every schedule import creates its calendars as org calendars** (`InterchangeService.commit`,
ADR-0050), so importing three P6 files can silently add a dozen shared calendars named
`Standard 5 Day Workweek`, `CALENDAR-1`, `Nights`. There is no way to clean that up: the
`CALENDAR_IN_USE` guard (correctly) refuses to delete anything still referenced.

**Resources are missing a management layer, not a tier.** The pool is _correctly_ org-global —
a shared pool is precisely what makes cross-plan over-allocation detection and levelling
(ADR-0041) meaningful, and it matches P6's enterprise resource pool. Fragmenting it would
destroy that. What is missing is everything P6 _pairs_ with a shared pool: a **hierarchy**, an
**active/archived** lifecycle, and **search/filter** so a picker is usable past a page of rows.

Three forces make this the moment: interchange has landed (import is now the fastest way to
fill both libraries with junk); the resource dimension is complete (ADR-0039 → 0041 → 0042 →
0044), so the pool is the thing planners touch most; and a live defect (a 20-row default page
size with no client pagination) silently truncates every library screen and every picker.

Forces on the design:

- **Behaviour must not change for existing data.** Every existing calendar is a shared one.
  A tenant that never creates a project calendar must be byte-identical to today.
- **A tier is only real if it is an invariant.** If any one write seam forgets the check, a
  project calendar leaks across projects and the tier is a convention, not a boundary.
- **Referential integrity is not negotiable** (`docs/DATABASE.md`: the DB is the last line of
  defence). A calendar's owning project must be a real FK, and "the discriminator and the FK
  agree" must be a DB invariant, not just service code.
- **The CPM engine must stay untouched.** The ADR-0034 golden + scenario suite is the parity
  gate for this whole epic, and it must be _structurally_ trivial to satisfy, not argued.

## Decision

### 1. A calendar scope tier — `CalendarScope { ORG, PROJECT }` + a nullable `project_id`

`calendars` gains an enum discriminator `scope` (constant `DEFAULT 'ORG'`) and a nullable typed
parent FK `project_id` (RESTRICT), kept in agreement by a **fail-closed** CHECK:

```sql
ALTER TABLE "calendars" ADD CONSTRAINT "ck_calendars_scope_parent" CHECK (
    CASE "scope"
        WHEN 'ORG' THEN "project_id" IS NULL
        WHEN 'PROJECT' THEN "project_id" IS NOT NULL
        ELSE false
    END
);
```

The `ELSE false` is the ADR-0046 `ck_notes_exactly_one_parent` precedent: a future third tier
(e.g. `CLIENT`) added to the enum before its CHECK branch lands is **rejected**, never silently
unconstrained.

Name uniqueness becomes **per tier** — two partial uniques replacing the single org-wide one:

```sql
CREATE UNIQUE INDEX "uq_calendars_org_name"     ON "calendars" ("organization_id", "name") WHERE "deleted_at" IS NULL AND "scope" = 'ORG';
CREATE UNIQUE INDEX "uq_calendars_project_name" ON "calendars" ("project_id", "name")      WHERE "deleted_at" IS NULL AND "scope" = 'PROJECT';
```

The predicates are keyed on `scope` (not on `project_id IS NULL`) so a future tier gets its own
name index rather than silently sharing — and colliding in — the ORG namespace. A name **may**
be reused across tiers by design: a project may hold its own "Standard" beside the
organisation's. Forcing global uniqueness would let an org-level rename break unrelated
projects and would forbid the common P6 project-local override; the UI disambiguates with a
tier badge, not a name rule.

Scoping is **per project, not per plan** (product-owner decision, P6-aligned): plans within a
project share a shutdown, and per-plan calendars would multiply near-identical rows across a
project's baselines and scenarios — the pollution problem in miniature.

**Additive with no data migration.** `scope` has a constant default and `project_id` is
nullable with no default, so on PostgreSQL 11+ both `ADD COLUMN`s are metadata-only (no table
rewrite, no scan) and every existing row reads `(ORG, NULL)` — today's only tier and today's
exact behaviour. The unique-index swap is a strict **widening** for that data: with every row
at `scope = 'ORG'`, the new predicate selects exactly the old index's row set, so the rebuild
cannot fail on data the old index already accepted. Drop and both creates run in **one
transaction** (Prisma Migrate wraps a migration file), so uniqueness is never unenforced —
which is also why `CONCURRENTLY` is neither possible nor wanted here.

### 2. One shared usable-by guard, at every seam

A calendar is usable by a holder **iff** it is an active calendar in the holder's own
organisation **and** either `scope = ORG`, or `scope = PROJECT` with `project_id` = the
holder's project. This is enforced by **one function** —
`assertCalendarUsableBy({ calendarId, organizationId, projectId })` — called by every seam that
binds a `calendar_id`:

| Seam                  | `projectId` passed             | Result for a PROJECT calendar of another project                                 |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `plan.calendarId`     | the plan's project             | 422 `CALENDAR_WRONG_SCOPE`                                                       |
| `activity.calendarId` | the activity's plan's project  | 422 `CALENDAR_WRONG_SCOPE`                                                       |
| `resource.calendarId` | **`null`** (org-global holder) | 422 `RESOURCE_REQUIRES_ORG_CALENDAR` — **any** project calendar is a hard reject |

`projectId` is deliberately **non-optional**: a new seam must state which kind of holder it is,
so "forgot to pass a project" cannot silently become "org-global, anything goes". The guard
takes the same calendar advisory lock the `CALENDAR_IN_USE` delete guard uses, so a calendar
can never be bound mid-deletion and a concurrent narrow cannot slip past the count.

A calendar id from **another organisation**, soft-deleted, or unknown stays a **404** at every
seam — the tier must never become a cross-tenant existence oracle. Only an in-org calendar of
the wrong tier produces the 422, and its `details` name the owning project.

**The per-relationship lag calendar is not a seam.** `ActivityDependency.lagCalendar` is a
`LagCalendarSource` **enum** (`PREDECESSOR | SUCCESSOR | TWENTY_FOUR_HOUR | PROJECT_DEFAULT`),
not a calendar FK — it dereferences a calendar an endpoint already resolved, and therefore
already guarded. A **structural test** pins the whole seam set down (`ActivityDependency`,
`CrossPlanDependency` and `BaselineActivity` carry no `calendarId`; exactly `Plan`, `Activity`
and `Resource` do), so a future per-relationship calendar FK cannot land without the guard.

**Scope change.** **Widening** (PROJECT → ORG, "promote") is always allowed: every referencer
of a project calendar is inside that project, which is a subset of the organisation, so the set
of legal holders only grows — the id is stable and every reference keeps working.
**Narrowing** (ORG → PROJECT) is guarded: under the calendar advisory lock, in one transaction,
the service counts active plans and activities **outside** the target project plus **all**
active resources (the pool is org-global, so any resource reference is by definition outside a
single project) and refuses with **409 `CALENDAR_SCOPE_NARROWING_BLOCKED`** carrying per-class
counts. Both paths ride the existing optimistic `version` gate, and both set `scope` and
`project_id` in a **single** `UPDATE` (the CHECK is a row constraint evaluated at statement
end).

**Project delete cascades.** `HierarchyLifecycleService`'s project branch (and its client
branch, which deletes projects) stamps `calendars WHERE project_id IN (…) AND deleted_at IS
NULL` and those calendars' exceptions with the **same `delete_batch_id`** as the project's
plans and activities; restore reverses it by batch. The predicate is NULL for every ORG
calendar, so a shared-library calendar can never be swept. The single-calendar
`CALENDAR_IN_USE` guard deliberately does **not** apply on the cascade path — its referencers
are being deleted in the same cohesive batch (the ADR-0038 subtree-cascade precedent).

**One new permission code: `calendar:manage_org`,** granted to **Planner + Org Admin** —
exactly the roles that already hold `calendar:*`, so there is **zero capability change today**.
It gates writes to _shared tenant state_: creating, editing or deleting an `ORG`-scoped
calendar, and any promote/narrow. A `PROJECT`-scoped calendar needs only the plain
`calendar:create/update/delete`. It exists as its own code (the `dependency:link_cross_plan`
precedent) so shared-library writes are independently revocable and auditable; narrowing it to
Org-Admin-only later is a one-line move out of `HIERARCHY_WRITE`, with no schema or API change.

**Scope-filtered listing is not an authorisation boundary.** Every member of an org can already
read every project in it, so hiding project calendars from the org list (`?scope=org`, the
default) is a **usability** filter that preserves today's result set for existing clients. The
security control is the write-time guard, enforced server-side at every seam regardless of what
a list returns. The new `GET …/projects/:projectId/calendars` returns the project's _usable
set_ (its own + all ORG), which is exactly what the guard accepts — so a picker fed from it can
never offer something the write seam would reject.

### 3. The resource pool stays a single org-level pool _(accepts with M3)_

Manageability comes from an **adjacency-list `parent_id`** (the ADR-0038 precedent) plus a
**non-assignable `GROUP` `ResourceKind`**, so a grouping node has no calendar, capacity, cost or
assignment — which makes the levelling/histogram/EV parity argument _trivial_. Invariants
(acyclic, same-org, only a `GROUP` may parent, depth ≤ 10) are service-owned under a new
**org-scoped** resource-tree advisory lock.

### 4. `archived_at` on `resources` and `calendars` _(accepts with M4)_

Orthogonal to soft delete: an archived row stays valid and keeps scheduling; it is hidden from
pickers and rejected for **new** assignments only. Soft delete cannot serve this purpose — a
soft-deleted resource cannot be referenced by an active assignment, which is exactly what
`RESOURCE_IN_USE` exists to prevent.

### 5. Interchange maps the tier _(accepts with M5)_

Import creates calendars at **PROJECT** scope pinned to the target project (resource calendars
at ORG, with a report finding); export emits `clndr_type`. The ADR-0050 mapping-contract table
is updated in lock-step.

### 6. The CPM engine is untouched

The engine builds its `WorkingTimeCalendar` port from `calendar_shifts` / `calendar_exceptions`
rows loaded **by calendar id**; it never receives `organization_id`, and it will never receive
`scope`, `project_id` or `archived_at`. `computeSchedule`'s signature is unchanged, and
`ScheduleService`'s per-recalc `portByCalId` cache is keyed by calendar id. The ADR-0034 golden

- scenario suite is therefore **structurally** untouched, not merely observed to pass.

## Alternatives considered

| Alternative                                                                        | Why not                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-plan calendars** instead of per-project                                      | P6 scopes calendars to the project; plans within a project share a shutdown. Per-plan would multiply near-identical calendars across a project's baselines/scenarios — the pollution problem in miniature. (Product-owner decision.)                                                                                                                                                                                        |
| **Nullable `project_id` only, no `scope` enum**                                    | Simpler and cannot disagree — a real merit. Rejected for API/query clarity (the tier becomes a first-class, filterable concept rather than a null test spread across every query) and for the fail-closed extensibility of the `CASE … ELSE false` CHECK. The redundancy risk is fully removed by that CHECK. (CQ-1.)                                                                                                       |
| **A composite FK `(organization_id, project_id) → projects(organization_id, id)`** | Would make "the owning project is in the same org" a DB guarantee, but needs a new `UNIQUE (organization_id, id)` on `projects` and would be the **only** such pattern in the schema — `activities.calendar_id`, `activities.parent_id` and `resources.calendar_id` all leave the identical invariant to the service. Consistency wins; the service checks it inside the write transaction, with its own reject-path tests. |
| **A per-seam scope check** instead of one shared guard                             | The failure mode of this feature is a _missed_ seam. Copy-paste guarantees drift. One function + a structural test over the seam set makes adding a seam a deliberate act.                                                                                                                                                                                                                                                  |
| **Fragmenting the resource pool per project**                                      | Destroys cross-plan over-allocation detection and levelling (ADR-0041) and diverges from P6's enterprise pool. (Product-owner decision.)                                                                                                                                                                                                                                                                                    |
| **Any resource may parent (no `GROUP` kind)**                                      | Makes "can I assign this?" ambiguous and forces levelling/histogram to decide whether a parent's capacity double-counts its children. (CQ-2.)                                                                                                                                                                                                                                                                               |
| **Soft delete instead of an archive flag**                                         | Different semantics — archive must keep existing references live. Orthogonal; both are needed.                                                                                                                                                                                                                                                                                                                              |
| **Client-side search**                                                             | The client only ever holds one 20-row page. Server-side `q` + cursor is the only correct fix.                                                                                                                                                                                                                                                                                                                               |
| **Importing global (`CA_Base`) calendars straight into the org library**           | A foreign file would write shared tenant state on every import — the exact problem. Project scope by default, with an explicit `globalCalendarScope: 'ORG'` opt-in.                                                                                                                                                                                                                                                         |
| **Two ADRs (calendars, resources)**                                                | They share one driving force, and one is the _reason_ the other is safe: the pool stays org-global **because** calendars gained a project tier.                                                                                                                                                                                                                                                                             |

## Consequences

**Positive**

- The shared organisation library stays small, curated and trustworthy; per-project noise stays
  in its project and is deleted with it.
- Schedule import stops being a tenant-wide pollution vector (M5).
- A planner can create a one-off calendar without Org-Admin involvement.
- Writes to shared tenant state become independently revocable and auditable.
- The resource pool becomes navigable and lifecycle-managed **without** fragmenting, so
  levelling and cross-plan over-allocation stay meaningful (M3/M4).

**Negative / costs**

- A new cross-cutting invariant every future calendar seam must honour — mitigated by the
  single shared guard, one reject-path test per seam, and the structural seam-set test.
- Two columns that could in principle disagree — removed by `ck_calendars_scope_parent`.
- Same-named calendars may exist in different tiers, which can read as ambiguous — mitigated by
  the tier badge in the UI (M2) and a tier-specific 409 message.
- One more permission code to reason about (though it changes no role's capability today).
- The narrowing count is O(k) heap fetches when an org calendar is explicitly pinned on many
  activities. It is an infrequent admin action taken under a lock, and `activities.calendar_id`
  is normally NULL (inherit the plan default), so k is small in practice.

**Follow-ups (deliberately deferred)**

- `GROUP`-level roll-up in the histogram / resource strip — an explicit non-goal (CQ-6).
- A `pg_trgm` GIN index on `lower(name)` if a tenant exceeds ~5k rows (`docs/PERFORMANCE.md`
  measure-first), and a partial ORG-tier list composite if an import-heavy tenant makes PROJECT
  rows dominate the org list.
- A possible `CLIENT` tier — the CHECK and the per-tier uniques are already fail-closed for it.

## Acceptance-status ledger

| Section                                                       | Milestone | Status       |
| ------------------------------------------------------------- | --------- | ------------ |
| §1 Calendar scope tier (schema, CHECK, per-tier uniques)      | M1        | **Accepted** |
| §2 Shared guard, scope change, cascade, `calendar:manage_org` | M1        | **Accepted** |
| §6 Engine untouched / parity gate                             | M1        | **Accepted** |
| §3 Resource hierarchy (`parent_id`, `GROUP`)                  | M3        | Proposed     |
| §4 `archived_at` on resources + calendars                     | M4        | Proposed     |
| §5 Interchange tier mapping                                   | M5        | Proposed     |

## References

- ADR-0012 / ADR-0016 — RBAC + resource scoping; tenancy & role model
- ADR-0024 / ADR-0036 / ADR-0037 — working-day calendars; hour/shift granularity; per-activity
  calendars and the engine's calendar port
- ADR-0021 / ADR-0038 — the DAG invariant; the WBS adjacency-list precedent
- ADR-0039 / ADR-0041 / ADR-0042 / ADR-0044 — the resource model, levelling, earned value,
  curves
- ADR-0046 — the fail-closed `CASE … ELSE false` CHECK and the polymorphic-cascade precedent
- ADR-0050 — schedule interchange (the import pollution vector)
- ADR-0034 — engine conformance & the golden/scenario parity gate
