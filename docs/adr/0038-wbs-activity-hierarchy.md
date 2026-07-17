# ADR-0038: WBS activity hierarchy — adjacency-list parent tree & the WBS_SUMMARY type

- **Status:** Accepted
- **Date:** 2026-07-17
- **Deciders:** James Ewbank (with Claude Code)

## Context

An activity is the leaf of the `Organization → Client → Project → Plan → Activity`
hierarchy — a flat set of activities per plan. Real construction schedules,
however, group those activities into a **Work Breakdown Structure (WBS)**: a tree
of summary bands ("Substructure", "Superstructure", …) each rolling up the dates
of the work beneath it. ADR-0035 §24 documents the CPM semantics we owe: a
**WBS-summary**'s dates roll up from its branch's **earliest start / latest
finish**, and **summaries carry no logic** (they are never an endpoint of a
dependency edge). The M5-epic (Engine Conformance Framework) delivers this in
slices — Feature **F5** is the schema/validation foundation this ADR governs;
**F6** is the rollup engine; **F7** the conformance mapping; **F8** the product
surface.

F5 needs two things in the data model:

1. A way to express "activity X is grouped under summary S" — a **parent link**.
2. A **WBS_SUMMARY** `ActivityType` so a summary band is a first-class activity
   (it has a name, a lane, dates that will be computed by rollup), distinct from a
   `TASK`.

Two forces shape the choice. First, this is a **long-lived schema decision** (the
biggest in the milestone) — reparenting, referential integrity, and query shape
must all stay cheap for the schedule's lifetime. Second, the parent tree must not
be conflated with the **dependency DAG** (ADR-0021): the DAG is the CPM logic
network (typed, lagged edges the engine walks); the WBS tree is a **grouping**.
They are independent graphs over the same nodes — a cycle in one says nothing
about the other, and a WBS parent is **not** a logic tie.

A wrinkle for later (F7): the product owner's conformance **fixture** expresses
hierarchy as `wbs` **code strings** (e.g. `TT.4.2`), not as a parent link. That
is a _conformance-adapter_ concern (derive `parentId` from code prefixes at import
time), never the product data model — see _Consequences_.

## Decision

We will model the WBS as an **adjacency list**: a nullable, self-referencing
**`parent_id`** foreign key on `activities`, plus a new **`WBS_SUMMARY`** member of
the `ActivityType` enum.

- **`activities.parent_id`** (`UUID?`, `@map("parent_id")`) is a self-FK to
  `activities.id`. `NULL` = a top-level activity (no WBS parent); non-null = the
  activity is grouped under the referenced summary. It is **client-settable**
  (Planner-owned), modelled in Prisma as the named self-relation
  `"ActivityHierarchy"` (`parent` / `children`).
- **`WBS_SUMMARY`** is appended to `ActivityType`. A summary is an activity whose
  dates are **computed by rollup** (F6), not entered.

**Rollup itself is out of scope for F5** — this slice persists the tree and
enforces its invariants; the engine computes summary dates in F6.

### Invariants

The FK gives us referential integrity but cannot express the domain rules; the
**service layer** owns these (each unit-tested, the ADR-0021 precedent), with the
cheap cases backed by DB constraints as defence in depth:

- **(a) The parent tree is acyclic.** No activity may be its own ancestor. A DB
  `CHECK` cannot express transitive acyclicity, so on every create/reparent the
  service walks **ancestors** from the proposed parent and rejects if the child is
  reached (`409 PARENT_CYCLE`) — the exact analogue of the dependency DAG walk
  (ADR-0021), serialised by the same plan advisory lock so a concurrent
  mirror-reparent cannot slip a cycle past two walks. The trivial **1-node** case
  (an activity as its own parent) _is_ expressible and is backed by
  `ck_activities_parent_not_self` (`parent_id IS NULL OR parent_id <> id`, raw SQL
  in the migration).
- **(b) Same plan and same organisation.** A parent must be in the **same plan and
  org** as its child. The FK scopes only to `activities` (a cross-plan/cross-org
  `parent_id` satisfies it), so the service checks scope inside the write
  transaction — the identical limitation and remedy as `activities.calendar_id`
  (ADR-0037) and the plan/calendar pickers. Rejected with `422`
  (`PARENT_WRONG_SCOPE`).
- **(c) A summary carries no logic.** A `WBS_SUMMARY` activity may **not** be an
  endpoint (predecessor or successor) of a dependency edge (ADR-0035 §24). The
  dependency-create path rejects such an edge with `422 SUMMARY_HAS_NO_LOGIC`.
  This keeps the CPM logic network (ADR-0021) over _working_ activities only; a
  summary's dates come from rollup, never from ties.
- **(d) Only a summary may be a parent (recommended, service-enforced).** We
  **recommend** that a non-summary activity is always a **leaf**: only a
  `WBS_SUMMARY` may have children. This matches how planners think (you nest work
  under a band, not under another task) and keeps rollup unambiguous (a branch's
  leaves are its non-summary descendants). It is a **service rule**
  (`422 PARENT_NOT_SUMMARY`), not a DB constraint — a `CHECK` cannot read the
  parent row's `type`, and a trigger would put business logic in the database
  (against `docs/DATABASE.md`). Reparenting a subtree under a new summary stays a
  pure `parent_id` update; changing an activity's type to/from `WBS_SUMMARY` is
  gated by whether it currently has children/edges.

### Soft-delete & cascade

`activities` are **never hard-deleted** in normal use; deletes are **soft and
cascading in the service layer** via `deleted_at` + a shared `delete_batch_id`
(the four-level `HierarchyLifecycleService`, `docs/DATABASE.md`). The WBS tree adds
a second parent axis to that mechanism:

- **FK `onDelete: Restrict`.** A summary with children can never be hard-deleted
  out from under them. In practice `RESTRICT` never fires (we soft-delete); it is
  defence in depth against an accidental hard delete orphaning a subtree — exactly
  the posture of every other hierarchy FK.
- **Soft-deleting a summary cascades to its WBS subtree.** Deleting a
  `WBS_SUMMARY` soft-deletes it **and its descendant activities** (the branch it
  heads) in **one `delete_batch_id`**, so restore brings the whole branch back
  together and a descendant deleted _earlier_ (a different batch) is not
  resurrected. This extends the existing subtree-cascade to the `parent_id` axis
  in addition to the `plan_id` axis; the `HierarchyLifecycleService` gains the
  parent-child edge when it computes the active subtree. **Rationale:** a WBS band
  and the work it groups are a unit — leaving orphaned children under a deleted
  summary would violate the same "no active row under a deleted ancestor"
  invariant the plan hierarchy already upholds (`409 PARENT_DELETED` on a
  mismatched restore). A leaf activity (no children) soft-deletes as it does today.
- **Incident dependency edges** of a soft-deleted activity are handled by the
  existing link cascade (ADR-0021 / `HierarchyLifecycleService`) unchanged; the WBS
  cascade is purely about the `parent_id` subtree.

### Relationship to ADR-0021

The **dependency DAG** (ADR-0021) and the **WBS parent tree** are **independent
graphs** over the same activity nodes. The DAG is the CPM logic network the engine
topologically walks; the WBS tree is a grouping for rollup and display. Acyclicity
is required of **both**, but enforced **separately** (each has its own service
walk under the shared plan lock), and a cycle in one is unrelated to the other. A
`WBS_SUMMARY` participates in the WBS tree and is explicitly **barred from the
DAG** (invariant c). No code should treat a parent link as logic or vice versa.

## Alternatives considered

- **Materialised `wbs_code` path string (e.g. `TT.4.2`) as the product model.**
  Store each activity's position as a dotted path; the hierarchy is derived by
  string prefix. Pros: a subtree query is a single `LIKE 'TT.4.%'`; the shape
  matches the fixture. Cons: **no referential integrity** (a code can point at a
  non-existent or wrong-plan ancestor; nothing enforces the tree is well-formed);
  **reparenting is expensive and error-prone** — moving a branch rewrites the code
  of every descendant (a wide, lock-heavy `UPDATE`), and a partial failure
  corrupts the tree; codes must be kept unique and gap-free by hand. An
  adjacency-list `parent_id` gives real FK integrity, **O(1) reparenting** (one row
  update), and cheap child lookups via the partial index; subtree reads at our
  scale (≤ ~2,000 activities/plan, ADR-0021) are a bounded in-memory walk, the same
  ceiling the CPM engine already lives within. **Rejected as the product model.**
  The `wbs` code string survives only as a **conformance-adapter mapping** (F7):
  the fixture adapter derives `parentId` from code prefixes at import; it never
  becomes a persisted product column.
- **Engine-only hierarchy (no schema).** Compute rollups from a transient grouping
  passed to the engine, persisting nothing. Pros: zero schema change. Cons: there
  is then **no product hierarchy** — the navigator, the API, and baselines have
  nothing to nest, reorder, or persist; every client would have to re-derive the
  tree. The WBS is a first-class product concept (PROJECT_BRIEF), not just an
  engine input. **Rejected.**
- **A separate `wbs_nodes` table with activities pointing at a node.** A dedicated
  hierarchy table decouples grouping from activities. Pros: a summary is not an
  "activity". Cons: it splits one concept across two tables, needs its own
  scoping/soft-delete/audit machinery, and complicates rollup (a summary's dates
  live on a different table than the leaves'). ADR-0035 §24 treats a summary **as
  an activity** whose dates roll up; modelling it as one `ActivityType` keeps the
  canvas, API, and baseline snapshot uniform. **Rejected** as over-modelling.
- **Enforce acyclicity in the database (recursive CTE / closure table).** As in
  ADR-0021, rejected as premature at our scale and unable to remove the need to
  serialise concurrent reparents; **kept as the documented fallback** if the
  per-plan ceiling is exceeded.

## Consequences

- **Positive.** The WBS is a real, referentially-sound product model:
  reparenting is one row update, "children of a summary" is a cheap partial-index
  lookup, and rollup (F6) reads `parent_id` directly. Adding `WBS_SUMMARY` to the
  enum now means F6/F7/F8 need **no** further enum migration. The dependency DAG is
  untouched and explicitly kept orthogonal. Fully additive: existing rows read
  `parent_id = NULL` and the byte-parity golden path (no summary present) is
  unchanged.
- **Negative / cost.** Three invariants (acyclic, same-scope, summary-no-logic)
  and the recommended "only-a-summary-is-a-parent" rule live in the **service**,
  not the DB — they must be covered by explicit tests (each reject path) and cannot
  be weakened without revisiting this ADR. Reparent and type-change paths gain a
  guarded ancestor walk under the plan lock.
- **Bounded assumption.** The ancestor walk and subtree cascade assume a plan's
  activity/edge set fits the same **~2,000-activity** working ceiling as ADR-0021;
  the same DB-side fallback applies past it.
- **Follow-ups.** F6 (rollup engine — `parentId` on `EngineActivity`, summary
  excluded from logic, dates = branch earliest-start/latest-finish); F7
  (conformance: fixture `wbs` code → `parentId` adapter, flip `type_wbs_summary`);
  F8 (API round-trip of `parentId` + navigator nesting). The
  `HierarchyLifecycleService` must learn the `parent_id` subtree axis for the
  cascade above (F5.T3 / lifecycle task). `@repo/types`' `ActivityType` union must
  gain `WBS_SUMMARY` in lock-step with the Prisma enum. **CLAUDE.md §16's ADR list
  should gain a one-line ADR-0038 entry** (flagged here; updated separately).

## References

- ADR-0035 §24 (WBS-summary rollup semantics), ADR-0021 (dependency DAG invariant
  — the orthogonal graph and the service-walk precedent), ADR-0037 (per-activity
  calendars — the same "FK cannot scope to plan/org, service does" pattern),
  ADR-0022 (engine-owned columns; rollup writes land here in F6).
- [`docs/specs/engine-conformance-framework/M5-epic-advanced-activity-types-implementation-plan.md`](../specs/engine-conformance-framework/M5-epic-advanced-activity-types-implementation-plan.md)
  Feature F5 (this slice) and F6–F8.
- [`docs/DATABASE.md`](../DATABASE.md) — schema standards (partial indexes, CHECK
  constraints, FK `onDelete` posture, cascade soft-delete + `delete_batch_id`).
- Migration `apps/api/prisma/migrations/20260717010000_m5_wbs_hierarchy/`.
