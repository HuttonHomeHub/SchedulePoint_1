---
'@repo/web': minor
---

Add/edit/remove dependencies from the Logic panel. Planners and Org Admins
(`canManageLogic`) get "Add predecessor"/"Add successor" buttons and per-row
Edit/Remove: adding picks the other activity from the plan (self excluded),
chooses a type (FS/SS/FF/SF) and a signed lag; editing changes type/lag with
optimistic locking; removing confirms first. The API stays the source of truth
for the acyclic guarantee — a cycle, duplicate, or stale-version rejection is
surfaced inline. Viewers and Contributors keep the read-only panel.
