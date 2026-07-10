# ADR-0021: Activity dependency graph — the DAG invariant & service-layer cycle prevention

- **Status:** Accepted
- **Date:** 2026-07-10
- **Deciders:** James Ewbank (with Claude Code)

## Context

The Activities foundation (M3, ADR nothing-new — it followed the hierarchy
patterns) gave a Plan a set of **activities** but no relationships between them.
The M4 slice adds **dependencies**: typed (FS/SS/FF/SF), lagged edges from a
predecessor activity to a successor activity within the same plan (see
[`docs/specs/activity-dependencies.md`](../specs/activity-dependencies.md)).

Together the activities (nodes) and dependencies (edges) form a **directed
graph**. The CPM engine (M6) computes early/late dates, total float and the
critical path by a forward then backward topological pass over this graph. That
computation is only defined — and only terminates — if the graph is **acyclic**
(a **DAG**). A cycle (`A → B → … → A`) has no topological order: the forward pass
would loop forever or, if naively guarded, produce nonsense dates. The graphical
TSLD canvas (M7) relies on the same guarantee.

So the invariant "**the dependency graph of a plan is always acyclic**" is a
cross-cutting contract that M6 and M7 both build on, and it must hold at the
**write boundary** — a cycle must never be persisted, not merely detected later.
Two forces make this non-trivial:

1. **Concurrency.** Two requests adding the mirror edges `A → B` and `B → A` at
   the same time could each individually see an acyclic graph and both commit,
   creating a 2-node cycle that neither transaction saw.
2. **Scale.** A plan can hold thousands of activities and edges; the check runs
   on every dependency create and must stay cheap.

Self-loops (`A → A`) and exact duplicates are the degenerate cases of the same
"keep the graph well-formed" concern and are handled alongside.

## Decision

We will **enforce the DAG invariant in the service layer**, inside the same
database transaction that inserts the edge:

1. On `create`, before inserting `predecessor → successor`, reject a **self-loop**
   (`predecessor == successor`) with `422` (a DB `CHECK ck_dependencies_no_self_loop`
   backs this as defence-in-depth).
2. Load the plan's **active** edges (indexed by `plan_id`) into an in-memory
   adjacency map and run a **reachability walk** (DFS/BFS, `O(V+E)`) from the
   proposed **successor** over successor-edges. If the proposed **predecessor** is
   reachable, inserting the edge would close a cycle → reject with `409`,
   `reason: CYCLE_DETECTED`. Otherwise insert.
3. Run the load-walk-insert as one unit under a transaction that **serialises
   conflicting inserts within a plan**, so the mirror-edge race cannot bypass the
   walk. Concretely: the create transaction takes a **plan-scoped advisory /
   row-level lock** (e.g. `SELECT … FOR UPDATE` on the parent `plans` row, or a
   `pg_advisory_xact_lock` keyed by plan id) before loading the edges, so
   concurrent dependency creates in the same plan are ordered — the second walk
   sees the first edge and rejects the cycle. Cross-plan creates never contend.
4. **Duplicates** are caught by the partial-unique index
   `(predecessor_id, successor_id, type) WHERE deleted_at IS NULL` and mapped to
   `409 DUPLICATE_DEPENDENCY`; the index also makes the race for identical edges
   safe without the lock.

The invariant holds **per plan**, and dependencies are constrained to a single
plan (both endpoints share `plan_id`), so the lock scope is the plan.

This is bounded by an explicit **scale ceiling of ~2,000 activities per plan**
for the in-memory walk. Beyond that we revisit (see Consequences).

## Alternatives considered

- **Detect cycles in the database (recursive CTE / transitive-closure table).**
  A `WITH RECURSIVE` reachability query, or a maintained closure table, could
  enforce acyclicity in SQL. Pros: the check lives next to the data; no app-side
  graph load. Cons: a recursive CTE on every insert is harder to reason about and
  tune than an `O(V+E)` in-memory walk at our scale; a closure table doubles the
  write surface and its own consistency must be guarded. Neither removes the need
  to serialise concurrent inserts. Rejected for now as premature; **kept as the
  documented fallback** if the 2,000-node ceiling is exceeded.
- **Optimistic (no lock) + detect-and-repair.** Insert freely, run a background
  job to find and break cycles. Rejected: a persisted cycle breaks the CPM engine
  and the canvas _now_; "eventually acyclic" is not acceptable for a correctness
  invariant.
- **Application-wide lock / queue for all dependency writes.** Correct but need-
  lessly serialises unrelated plans. Rejected in favour of the **plan-scoped**
  lock, which lets different plans (and different orgs) write concurrently.
- **Trust the client / UI to prevent cycles.** Rejected outright: the API is the
  source of truth; a browser preview is a nicety, never the guarantee (multiple
  clients, direct API use, retries).

## Consequences

- **Positive.** The CPM engine (M6) and the TSLD canvas (M7) can assume a DAG
  unconditionally — no defensive cycle handling in the engine. The guarantee is
  enforced at the only place it can be (the write), is race-safe, and keeps
  unrelated plans fully concurrent. Self-loops and duplicates get clear,
  distinct error codes (`422`, `409 CYCLE_DETECTED`, `409 DUPLICATE_DEPENDENCY`).
- **Negative / cost.** Every dependency create pays a plan-scoped lock + an
  `O(V+E)` edge load and walk. Cheap at expected scale; the lock briefly
  serialises concurrent dependency creates **within one plan** (not across plans).
- **Bounded assumption.** The in-memory walk assumes a plan's edge count fits in
  memory and stays fast; we set a **~2,000-activity** working ceiling. The
  revisit trigger: plans approaching that size, or the edge-load/walk showing up
  in latency. The fallback is the DB recursive-CTE / closure-table approach above.
- **Testing obligation.** The invariant must be covered by explicit tests: unit
  (`CycleDetector`: acyclic pass; self, 2-node mirror, and longer `A→B→C→A`
  cycles rejected) and an **API e2e race test** asserting that concurrent `A→B`
  and `B→A` creates result in **exactly one** success and one `409`.
- **New risk/debt.** The lock choice (advisory vs `FOR UPDATE`) and its isolation
  interaction are load-bearing; they are implemented and tested in Task B2 and
  must not be weakened without revisiting this ADR.

## References

- [`docs/specs/activity-dependencies.md`](../specs/activity-dependencies.md),
  [`docs/plans/activity-dependencies.md`](../plans/activity-dependencies.md)
- ADR-0008 (modular monolith / layered modules — where the guarantee lives),
  ADR-0012 (RBAC + resource scoping), ADR-0016 (identity & tenancy).
- Graphical Path Method / CPM background: `docs/PROJECT_BRIEF.md`.
