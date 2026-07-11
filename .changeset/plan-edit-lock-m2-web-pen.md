---
'@repo/web': minor
---

Add the plan edit-lock **web "pen" layer** (edit-lock M2, ADR-0028), behind a new
`VITE_PLAN_EDIT_LOCK` flag (default **off** — ships inert). When enabled, the plan
screen shows a single **"who holds the pen"** banner: a Planner clicks **Start
editing** to take an exclusive edit-lock (a background heartbeat keeps it alive,
released on Stop / navigation / tab-close), and the on-canvas schedule editing
affordances — the TSLD canvas, activity create/edit/delete, the positions batch,
the dependency editor, and Recalculate — become live only while holding it.
Everyone else sees who's editing (and, per their role, can **request control**,
**take over** once the holder goes idle / a grace window elapses, or — as an Org
Admin — take over immediately via a confirm); the Contributor progress path and
plan-metadata edits are never pen-gated. A **423 `LOCKED`** response drops the
surface to read-only with distinct copy, separate from the 409 "changed elsewhere"
conflict. With the flag off, nothing polls or changes — current behaviour
byte-for-byte. Enable `VITE_PLAN_EDIT_LOCK` **before** the backend's
`PLAN_EDIT_LOCK_ENFORCED` (ADR-0028 §9 rollout ordering).
