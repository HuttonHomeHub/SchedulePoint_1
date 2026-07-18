# ADR-0045: Live cross-plan / programme scheduling (inter-project Milestone 2)

- **Status:** Accepted (inter-project **Milestone 2** — the live cross-plan solve deferred by ADR-0043;
  each §30 sub-clause Accepts with its owning implementation feature F1–F8)
- **Date:** 2026-07-18
- **Deciders:** Product Owner (approved the five critical questions at their recommended defaults,
  2026-07-18), Solution Architect, Technical Lead; schema reviewed with **database-architect** before the
  migration (F2); authorisation reviewed with **security-reviewer** (F3/F5).

### Critical questions — resolved (PO-approved defaults, 2026-07-18)

1. **Acyclicity grain → plan-level DAG** (§3/§30.6). A cross-plan link may only run one direction between
   any two plans; bidirectional plan interfaces are out of scope for M2 (the activity-level + fixpoint
   upgrade is the documented deferred path).
2. **Cross-plan link home → the successor activity** (mirrors the intra-plan dependency editor).
3. **Programme recalc vs a peer-locked plan → fail-fast 423, write nothing** (§4). The caller must hold the
   pen on every plan the solve writes; a locked neighbour blocks the whole solve with the blocked-plan list.
4. **Staleness → pull + `scheduleStale`** (§5/§30.7). No background push job in M2.
5. **Pen guarding link create/delete → the successor plan's pen** (§6).

- **Amends:** ADR-0021 (extends the DAG invariant across plans), ADR-0022 (extends CPM execution to a
  programme-level orchestration), ADR-0043 (delivers its explicitly-deferred Milestone 2). Builds on
  ADR-0012/0016 (RBAC + org scoping / tenancy), ADR-0028 (plan edit-lock), ADR-0037 (absolute
  working-instant axis), ADR-0034/0035 (conformance methodology + semantics ledger).

## Context

ADR-0043 (Milestone 1, Accepted) modelled inter-project dates as **two nullable per-activity imported
instants** (`activities.external_early_start` / `external_late_finish`) plus a plan-level
`ignore_external_relationships` toggle, clamped **inside the existing forward/backward passes** as
SNET/FNLT-shaped soft bounds. Crucially, `computeSchedule` stays **pure** and its signature is
unchanged — a plan with no external data is byte-identical (the ADR-0034/0037 parity gate). M1
deliberately shipped **static, hand-entered** external dates and explicitly deferred the _live_ solve:

> "**Deferred to Milestone 2:** a first-class **live cross-plan relationship** whose external dates are
> auto-derived from the linked plan's computed schedule and kept fresh — cross-plan edges + a cross-plan
> DAG/cycle invariant (extending ADR-0021), cross-plan authorisation, staleness/propagation, and
> programme-level recalc orchestration above ADR-0022." (ADR-0043 §Decision / §Consequences)

Real construction programmes are split across many plans (engineering, procurement, construction,
start-up, multiple contractors). A milestone in one plan is routinely gated by a date that lives in
**another** plan, and when the upstream plan re-plans, the downstream date must move with it. M1 lets a
planner _type in_ an imported vendor delivery; M2 lets them **draw a live edge** from the upstream
activity so the bound is derived from that activity's computed schedule and stays fresh.

Forces (in addition to M1's):

- **The parity gate is non-negotiable.** `computeSchedule` must remain pure and byte-identical on a plan
  with no cross-plan inputs (ADR-0022/0034/0037). Any cross-plan machinery must live **above** the engine
  and feed the _existing_ M1 external-instant inputs — not change the pass structure or the signature.
- **Acyclicity now spans plans.** ADR-0021 guarantees each plan's dependency graph is a DAG and cheaply
  serialises the write. A cross-plan edge makes the _union_ graph the thing that must stay acyclic, or the
  programme solve has no defined order and CPM does not terminate.
- **Execution is plan-scoped today.** ADR-0022's recalc endpoint, its plan advisory lock, and ADR-0028's
  per-plan edit-lock ("pen") are all **single-plan**. A programme solve touches several plans; its
  locking/transaction boundary and pen interaction are new and load-bearing.
- **Tenancy.** A cross-plan link spans two plans in (per ADR-0043) the **same organisation**, possibly
  under two different projects/clients. Authorisation and anti-IDOR must be defined for an edge with
  _two_ resource endpoints.
- **Smallest-correct-first-slice (CLAUDE.md §19).** A full push-based, background-propagated, live
  cross-tenant programme graph is XL. We want the smallest slice that makes a live cross-plan edge real,
  keeps the programme solve deterministic and terminating, and preserves the parity gate.

## Decision

**We will model a live cross-plan dependency as a first-class edge that _derives_ the M1 per-activity
external instants at recalc time, enforce a plan-level DAG across cross-plan edges, and add a synchronous
programme-recalc orchestration that recalculates a plan's cross-plan dependency-closure in topological
order — reusing the unchanged pure engine and the existing single-plan recalc transaction per plan.**

Concretely:

### 1. Cross-plan dependency as a first-class edge (new `CrossPlanDependency`)

A new org-scoped table whose predecessor and successor activities live in **different** plans (same org).
It mirrors `ActivityDependency` (type FS/SS/FF/SF, signed `lag_minutes`, `lag_calendar`, soft-delete,
audit, optimistic `version`) but carries **both** plan ids (`predecessor_plan_id`, `successor_plan_id`,
denormalised for scoping/ordering) and is deliberately **separate** from the intra-plan `dependencies`
table — whose whole-service contract asserts a single `plan_id` for both endpoints (ADR-0021,
`loadEndpointInPlan`). Keeping them separate preserves that invariant untouched and keeps the per-plan
adjacency loads (the ADR-0021 cycle walk, the engine's `loadEdges`) byte-identical.

### 2. Derivation, not a new engine input (parity by construction)

The engine is **not** given cross-plan edges. Instead, at recalc time the **service** (`buildEngineGraph`)
derives each successor activity's external bounds from its upstream predecessors' **persisted computed
dates** and folds them into the _existing M1 inputs_:

- **Forward (external early start):** for each incoming cross-plan edge, apply the M1-shaped forward
  bound to the predecessor's persisted early dates (FS→early-finish+lag, SS→early-start+lag, …); the
  activity's effective `externalEarlyStart` fed to the engine is the **later** of (all derived bounds, the
  hand-entered M1 column). "Later drives" (ADR-0035 §30.1) is unchanged.
- **Backward (external late finish):** symmetrically, an _outgoing_ cross-plan edge to a downstream plan
  derives an FNLT-shaped `externalLateFinish` from the downstream successor's persisted late dates; the
  effective bound is the **tighter** (min) of (derived, M1 column).

Because the derived values are just the M1 external instants, `computeSchedule` is called exactly as
today. **A plan with no cross-plan edges derives nothing → identical engine input → byte-identical output
(the parity gate).** The derived instants are transient (computed per recalc); they never overwrite the
hand-entered M1 columns.

### 3. Cross-plan acyclicity = a plan-level DAG (extends ADR-0021)

We enforce that the directed graph whose **nodes are plans** and whose **edges are cross-plan
dependencies** is **acyclic**. Combined with ADR-0021's per-plan activity DAG, this makes the _union_
graph provably acyclic: order the plans topologically, then order activities within each plan; every edge
is either intra-plan (respects the inner order) or points to a strictly-later plan. On creating a
cross-plan edge `pred(plan A) → succ(plan B)`, the service loads the cross-plan edge set (small — plans,
not activities), and rejects (409 `CROSS_PLAN_CYCLE_DETECTED`) if plan A is already reachable from plan B
over cross-plan edges — the plan-grain analogue of the ADR-0021 reachability walk. Serialised by an
**org-scoped** advisory lock (deterministic key) so concurrent cross-plan creates cannot race a mirror
edge. This is stricter than pure activity-level acyclicity (it forbids _any_ bidirectional interface
between two plans, even when acyclic at activity grain) but it is the standard programme model, it is
**cheap** (bounded by plan count, not activity count), and it gives the programme solve a **single
topological pass** rather than an iterative fixpoint.

### 4. Programme recalc = topological, per-plan sequential transactions (extends ADR-0022)

A new synchronous endpoint recalculates a plan's cross-plan dependency **closure**:

```
POST /organizations/:orgSlug/plans/:planId/schedule/recalculate-programme
```

(permission `schedule:calculate`; Planner + Org Admin). It resolves the closure of upstream plans (and
the target), topologically sorts them by the plan-level DAG, and recalculates **each plan in order** using
the **existing ADR-0022 single-plan recalc transaction verbatim** — one plan per transaction, in a
deterministic order. Because plans are processed upstream-first, each plan reads its upstreams'
**freshly-written** dates when it derives its external bounds (§2). No giant cross-plan transaction is
held; the per-plan advisory locks are acquired and released **in the deterministic topological order**, so
two overlapping programme recalcs cannot deadlock. The **pen** (ADR-0028) is asserted per plan inside each
plan's transaction, exactly as the single-plan recalc does today. **Default:** a programme recalc requires
the caller to hold the pen on **every plan it writes**; if any plan is held by another editor it fails
fast with 423 listing the blocked plans (no partial write). (See Critical Question 3 for the
skip-and-report alternative.)

### 5. Staleness = pull, computed on read (no background push in M2)

When a single plan is recalculated **on its own** (the existing ADR-0022 endpoint), its downstream plans
become **stale** — their persisted dates were derived against an older upstream schedule. M2 tracks this
by stamping each plan's schedule with a `schedule_computed_at` (and reusing it as the freshness cursor): a
plan is **stale** iff any plan in its upstream closure has a later `schedule_computed_at`. Staleness is
**computed on read** (a bounded walk of the small plan-level graph) and surfaced on the schedule summary
(`scheduleStale: boolean` + the list of stale upstream plan ids), so the planner knows to run a programme
recalc. **We do not** add a background push/propagation job (ADR-0009) in M2 — it is the documented next
slice. The single-plan endpoint stays byte-identical; it simply leaves downstreams flagged stale.

### 6. Authorisation (extends ADR-0012/0016)

A cross-plan edge has two org-scoped endpoints in the **same org** (cross-org links are rejected). Because
RBAC is org-scoped, a member with the relevant permission may already act on any plan in their org; M2
therefore introduces **no new role**, but adds an explicit permission **`dependency:link_cross_plan`**
(granted to Planner + Org Admin) so cross-plan linking is auditable and independently revocable. Create
loads **both** endpoint activities active in the caller's org (anti-IDOR — a foreign/other-org/deleted id
is 404, indistinguishable from missing), asserts they are in **different** plans of the **same** org, and
asserts the **pen on the successor plan** (the plan whose schedule the edge bounds) — see Critical
Question 2. Read/list of cross-plan links reuses `dependency:read`; delete reuses the pen on the affected
plan(s).

### New / amended ADR-0035 clauses (semantics ledger)

Added under §30 (inter-project dates), each **Accepts with its owning M2 feature**:

- **§30.5 Live derivation.** A live cross-plan edge derives the successor's external early start
  (predecessor's computed early dates + the edge's typed lag) / the predecessor's external late finish
  (successor's computed late dates), composed with the M1 hand-entered column by **later-of** (forward) /
  **tighter-of** (backward). Absent a cross-plan edge, the M1 column stands (byte-parity).
- **§30.6 Plan-level DAG.** The plan-node / cross-plan-edge graph is acyclic; with the per-plan activity
  DAG (ADR-0021) this makes the programme graph acyclic and the solve a single topological pass.
- **§30.7 Staleness is pull-computed.** A single-plan recalc leaves downstream plans stale; staleness is a
  read-time comparison of `schedule_computed_at` across the upstream closure; a programme recalc clears it
  upstream-first. No auto-propagation in M2.
- **§30.8 Programme order & determinism.** Plans are recalculated upstream-first; per-plan advisory locks
  are taken in the deterministic topological order (deadlock-free); each plan is the unchanged ADR-0022
  transaction.
- **Negatives** (next free ledger numbers — **N30–N33**; confirm against the ledger at authoring):
  - **N30** — a cross-plan edge that would close a **plan-level cycle** → **reject** 409
    `CROSS_PLAN_CYCLE_DETECTED` (mirrors ADR-0021 `CYCLE_DETECTED`).
  - **N31** — a cross-plan edge whose endpoints are in the **same plan** → **reject** 422
    `CROSS_PLAN_SAME_PLAN` (use an intra-plan dependency).
  - **N32** — a programme recalc where an upstream plan has **never been calculated** (no persisted dates)
    → **warn-and-proceed**: that edge contributes **no** derived bound (treated as absent), counted as a
    `crossPlanUpstreamMissingCount` warning; never an error.
  - **N33** — a **duplicate** cross-plan edge (same predecessor, successor, type among active rows) →
    **reject** 409 `DUPLICATE_CROSS_PLAN_DEPENDENCY` (partial-unique index, mirrors
    `DUPLICATE_DEPENDENCY`).

## Alternatives considered

- **Cross-plan edge as a new engine input (teach `computeSchedule` about other plans).** Rejected: it
  breaks the purity/parity gate (the engine would need multi-plan state and a fixpoint), and it duplicates
  the M1 clamp seam that already exists. Deriving the M1 external instants above the engine keeps
  `computeSchedule` byte-identical and reuses the accepted §30 clamps verbatim.
- **Activity-level cross-plan DAG + iterative fixpoint solve** (allow bidirectional plan interfaces as long
  as no _activity_ cycle exists). More permissive and arguably "more correct", but the detection must load
  multiple plans' full edge sets (cost scales with activities across the programme, not plans), and the
  programme solve becomes an iterate-to-convergence loop with a termination cap — materially heavier and
  harder to make deterministic. Rejected for M2; documented as the future upgrade if bidirectional
  interfaces are demanded. (The plan-level DAG is a strict subset, so upgrading later is compatible.)
- **Push propagation via a background job (ADR-0009).** When plan A recalcs, enqueue downstream
  recalculations. The right answer at large scale, but it adds a worker, eventual-consistency UX, and
  cross-plan job authorisation for a solve that is synchronous and sub-second per plan at target sizes.
  Deferred; M2 ships pull + a staleness flag, which is enough to be correct and observable.
- **One big transaction spanning every plan in the programme.** Guarantees a single consistent snapshot,
  but holds many plan advisory locks for the whole solve (contention, deadlock, long-running txn) and
  cannot reuse the single-plan recalc path. Rejected in favour of per-plan sequential transactions in
  topological order (deterministic lock ordering is deadlock-free and each plan is the existing,
  well-tested ADR-0022 unit).
- **An explicit `Programme` grouping entity** (a table plans belong to, with its own membership/authz).
  Rejected for M2: the programme is **implicit** — the connected component of cross-plan edges — so no new
  grouping, membership, or authorisation surface is needed. An explicit programme entity (portfolios,
  programme-level baselines/reporting) is a clean future addition once the edges exist.
- **Overwrite the M1 external columns with derived values.** Rejected: it would clobber hand-entered
  imported dates and blur "typed" vs "live". Derived bounds are transient and _compose with_ the M1
  columns (later-of / tighter-of), so a planner can still pin a manual floor.

## Consequences

**Positive.**

- A live cross-plan edge becomes real: downstream dates track upstream re-plans on the next programme
  recalc, without abusing manual constraints or re-typing imported dates.
- The pure engine and the entire golden/scenario suite are **untouched** — the parity gate holds by
  construction (no cross-plan edge ⇒ identical engine input).
- The programme solve is **deterministic and terminating** (single topological pass; deadlock-free lock
  ordering) and reuses the proven single-plan recalc transaction per plan.
- ADR-0021's per-plan invariant and lock are unchanged; the new plan-level DAG is a cheap, separable layer.
- The last un-ADR'd programme capability is designed; new conformance scenarios (cross-plan differential,
  goldens, negatives) extend the S09 family.

**Negative / neutral.**

- The **plan-level DAG forbids bidirectional interfaces** between two plans (even when acyclic at activity
  grain). Accepted trade-off for determinism; the activity-level + fixpoint upgrade is documented.
- Staleness is **pull** — a downstream plan can display stale dates until someone runs a programme recalc.
  Surfaced explicitly (`scheduleStale`), but not auto-corrected in M2.
- A programme recalc needs the **pen on every plan it writes** (default), so a locked neighbour blocks the
  whole solve. Mitigated by the fail-fast 423 with the blocked-plan list; the skip-and-report policy is a
  Critical Question.
- New table + a new permission + a new endpoint + a plan `schedule_computed_at` column; all additive
  (constant/nullable defaults, no backfill), but a genuine schema and API surface increase.

**Follow-ups / new debt.**

- Background **push propagation** (ADR-0009) and **auto-recalc-on-upstream-change** — the M2 → M3 slice.
- An explicit **Programme** entity (portfolio views, programme baselines, cross-plan reporting).
- **Activity-level cross-plan acyclicity + iterative solve** if bidirectional interfaces are demanded.
- Cross-org / cross-tenant interfaces (currently rejected) if the product ever needs them.
- Keep the capability matrix + ADR-0035 ledger in lock-step (ADR-0034 living-matrix rule).

## References

- Feature spec: [`docs/specs/inter-project-dates/M2-live-cross-plan-solve-feature-spec.md`](../specs/inter-project-dates/M2-live-cross-plan-solve-feature-spec.md)
- Implementation plan: [`docs/specs/inter-project-dates/M2-live-cross-plan-solve-implementation-plan.md`](../specs/inter-project-dates/M2-live-cross-plan-solve-implementation-plan.md)
- Milestone 1: [ADR-0043](0043-inter-project-external-dates.md); semantics ledger: [ADR-0035](0035-schedulepoint-cpm-semantics.md) (§30, N25/N26; new §30.5–§30.8, N30–N33)
- DAG invariant: [ADR-0021](0021-dependency-graph-dag-invariant.md); execution/persistence: [ADR-0022](0022-cpm-execution-and-persistence-model.md); edit-lock: [ADR-0028](0028-plan-edit-lock.md)
- Axis/tenancy/authz: ADR-0037, [ADR-0016](0016-core-identity-tenancy-role-model.md), [ADR-0012](0012-authorization-rbac-scoped.md)
- Conformance methodology: [ADR-0034](0034-engine-conformance-methodology.md); fixture scenario **S09** family
- Engine/service seams: `apps/api/src/modules/schedule/engine/{compute,constraints,types}.ts`; `schedule.service.ts` (`buildEngineGraph`); `apps/api/src/modules/dependencies/{cycle-detector,dependencies.service}.ts`
