---
'@repo/web': minor
---

Add the activities table and definition CRUD to the plan-detail screen. A plan now
lists its activities (code, name, type, duration, progress); Planners and Org
Admins can add, edit, and soft-delete them from a form dialog that mirrors the API
rules — the duration field is hidden for milestone types (which have no duration),
and the constraint date only appears once a constraint type is chosen (the two are
sent, or cleared, together). The graphical Time-Scaled Logic Diagram will edit
these on a timeline in a later release.
