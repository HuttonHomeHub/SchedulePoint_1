---
'@repo/api': minor
'@repo/types': minor
---

Add the server core of the single-editor **plan edit-lock** (ADR-0028) — the last precondition to
enabling the built TSLD editing surface. A new `PlanLock` lease (heartbeat + TTL with explicit
release; presence = held, absence = free) backs an `edit-lock` sub-resource under a plan:
GET status, POST acquire (with `takeover`), POST heartbeat, POST request, POST handoff, and DELETE
release. Lock-precondition failures return a new **423 Locked** (`code: "LOCKED"`), distinct from the
409 optimistic conflict, with a machine-readable `reason`
(`PLAN_EDIT_LOCK_REQUIRED | PLAN_EDIT_LOCK_HELD | PLAN_EDIT_LOCK_LOST`). The holder grain is the
**user** (re-entrant across tabs), and any Planner can **request control** of a live lock and take
over after a grace window — or immediately if the holder has gone inactive — while an Org Admin can
override immediately; acquire/request/hand-off/take-over serialise under the existing plan advisory
lock. New permissions `plan:acquire_lock` / `plan:request_control` (Planner + Org Admin) and
`plan:override_lock` (Org Admin). `@repo/types` gains the `PlanEditLockStatus` / `PlanEditLockActor`
contracts and the `PLAN_EDIT_LOCK_*` reason union. No UI yet and no endpoint is pen-gated in this
slice — inert until the front end and the write-gate land; `main` stays releasable.
