---
'@repo/api': minor
---

Guarantee the plan's dependency graph stays acyclic (ADR-0021). Creating a
dependency now runs its load-check-insert inside one transaction under a
plan-scoped advisory lock: it loads the plan's active edges, walks forward from
the proposed successor, and rejects the link with `409 CYCLE_DETECTED` if the
predecessor is already reachable (which would close a cycle). The lock serialises
concurrent creates within a plan, so the mirror-insert race (`A→B` ‖ `B→A`)
resolves to exactly one success and one conflict — a cycle can never be persisted.
Different plans never contend. A pure `wouldCreateCycle` detector (O(V+E)) is
unit-tested for self/2-node/longer cycles and large graphs; an e2e race test
asserts the concurrency guarantee.
