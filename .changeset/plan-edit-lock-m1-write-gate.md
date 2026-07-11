---
'@repo/api': minor
---

Add the plan edit-lock **write-gate** (ADR-0028, M1 completion). Structural plan
writes — activity create/update/delete/restore, the positions batch, dependency
create/update/delete, and schedule recalculate — now assert the caller holds the
plan edit-lock and return **423 `PLAN_EDIT_LOCK_REQUIRED`** otherwise (for graph
writes and recalculate the check runs inside the plan advisory-lock transaction).
The Contributor progress path, all reads, and plan-metadata edits stay ungated,
and a holder sending a stale row `version` still gets the existing 409 — the two
are distinct.

The gate ships **behind a staged-rollout flag `PLAN_EDIT_LOCK_ENFORCED` (default
off)**: enforcing it unconditionally would 423 the already-shipped, flag-on
activities-table / dependency-editor / recalculate flows, which don't acquire a
lock yet. So the whole mechanism lands inert; enforcement is enabled only once the
front end acquires the pen across every editing entry point (edit-lock M2/M3).
`main` stays releasable with no user-visible change.
