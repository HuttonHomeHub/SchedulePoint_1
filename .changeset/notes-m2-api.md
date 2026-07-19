---
'@repo/api': minor
---

Notes M2 — the note-thread API (the Notes feature, ADR-0046). A new org-scoped `notes` NestJS module
(copied from the reference template) exposing attributed, time-ordered note threads on plans and
activities. Non-structural, so — like the activity-progress path — it is **not** plan-edit-lock ("pen")
gated: a Contributor can annotate without seizing the editor lock.

- **Routes** (`/api/v1/organizations/:orgSlug/…`): `GET/POST …/plans/:planId/notes`,
  `GET …/plans/:planId/notes/activity-counts` (the batch row-badge counts), `GET/POST
…/activities/:activityId/notes`, `PATCH …/notes/:noteId`, `DELETE …/notes/:noteId`. Lists are
  newest-first and paginated (`{data, meta}`).
- **RBAC**: `note:read` for every member; `note:create/update/delete` Contributor-upward. Update and
  delete are further constrained to the note's **own author** (a service-layer row check → 403), so
  holding the permission is not enough to touch someone else's note.
- **Invariants**: `organization_id`/`entity_type`/`plan_id`/`activity_id` are derived from the resolved
  parent, never from client input (`whitelist`/`forbidNonWhitelisted`); body is trimmed-then-validated
  (whitespace-only → 422, 1–5000 chars); optimistic `version` guard → 409; uniform 404 anti-IDOR on a
  foreign/other-org/deleted parent or note. A note deletes softly under its own batch.

Covered by unit + Supertest e2e (RBAC, cross-author 403, 409, 422, anti-IDOR 404, not-pen-gated writes,
grouped counts, and cascade-with-parent). The CPM engine and recalc parity gate are untouched.
