---
'@repo/api': minor
'@repo/types': minor
---

Notes M1 — schema, permissions, shared types & cascade wiring (dark) (the Notes feature, ADR-0046).
The storage + authorisation foundation for attributed, time-ordered note threads on entities (plans and
activities in v1; client/project reserved). Nothing consumes it yet — no controller, no route, no UI —
so `main` stays byte-identical: the API surface and the CPM engine are untouched.

- **Schema (`@repo/api`)** — a new polymorphic `notes` table (`entity_type` discriminator + nullable
  typed FKs `plan_id`/`activity_id`) with an exactly-one-parent CHECK, a 1–5000-char plain-text body
  CHECK, and indexes for the plan/activity threads, the batch note-counts badge, and the cascade sweep.
  Every note carries a denormalised `plan_id` (an activity note copies its activity's), so a single
  sweep by `plan_id` catches PLAN + ACTIVITY notes with no double-count. See ADR-0046.
- **Permissions (`@repo/api`)** — `note:read` (every member, part of `HIERARCHY_READ`) and a
  `note:create`/`note:update`/`note:delete` write group granted **Contributor upward** (like
  `activity:update_progress`): annotating an entity is non-structural, so it needs neither the
  hierarchy write nor the plan edit-lock pen. Author-ownership of edit/delete is a service-layer check.
- **Lifecycle (`@repo/api`)** — `HierarchyLifecycleService` now sweeps and restores a plan/activity's
  notes as part of its soft-delete batch (no endpoint guard — a note has exactly one parent).
- **Types (`@repo/types`)** — `NoteEntityType`, `NoteSummary`, and `ActivityNoteCount`.
