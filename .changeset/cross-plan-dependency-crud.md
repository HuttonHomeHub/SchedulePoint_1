---
'@repo/api': minor
'@repo/types': minor
---

Cross-plan dependency CRUD + the plan-level DAG invariant + authz (inter-project M2, ADR-0045 §3/§6,
F3). A new `cross-plan-dependencies` NestJS module — a dark sibling of `dependencies` — lets a Planner
draw a **live inter-project link** between two activities in **different plans of the same
organisation**. Nothing consumes the edges yet (the derivation seam + programme recalc are F4/F5), so
`main` stays byte-identical: the engine and schedule service are untouched.

- **API (`@repo/api`)** — org-scoped `POST/GET/DELETE …/cross-plan-dependencies` (create derives both
  plan ids from the endpoint activities; never from input) plus per-plan (incoming) and per-activity
  (both-direction) list routes. Create loads **both** endpoints active in-org (anti-IDOR uniform 404),
  rejects a same-plan edge (**422 `CROSS_PLAN_SAME_PLAN`**, N31), and — under a new **org-scoped**
  advisory lock (a distinct key namespace from the per-plan write lock) inside one transaction —
  enforces the **plan-level DAG** (**409 `CROSS_PLAN_CYCLE_DETECTED`**, N30), asserts the pen on the
  **successor** plan (ADR-0028), and rejects a duplicate `(pred, succ, type)` (**409
  `DUPLICATE_CROSS_PLAN_DEPENDENCY`**, N33). Delete is pen-gated and soft. A new
  **`dependency:link_cross_plan`** permission (Planner + Org Admin) gates linking; reads reuse
  `dependency:read`.
- **Types (`@repo/types`)** — `CrossPlanDependencySummary` (carries both plan ids, no `isDriving`) and
  `CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES` (the one-voice N30/N31/N33 copy).
