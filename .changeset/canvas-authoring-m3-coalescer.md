---
'@repo/web': minor
---

feat(web): canvas-first authoring — auto-recalc coalescer hook (ADR-0032, M3 pt.1)

Add `usePlanAutoRecalc`: a plan-scoped coalescer over the existing recalculate command — a trailing
~500 ms debounce + single-flight, with `notify()` (request a coalesced recalc after a structural
edit) and `flush()` (fire now, for the manual Recalculate button), guarded by an `enabled` flag
(role + pen + a start date). Foundation for unifying canvas + table edits onto one auto-recalc path;
the endpoint and ADR-0022's engine-owned batched write are unchanged. Fully unit-tested (fake timers:
coalescing, flush, guard, single-flight, unmount flush). Not yet wired to the edit surfaces.
