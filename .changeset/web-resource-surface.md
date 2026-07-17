---
'@repo/web': minor
---

Add the **resource management** web surface (M7-F6, ADR-0039), behind a new **default-off** flag
`VITE_RESOURCES` so it ships dark. An org-level **Resources library** screen
(`/orgs/:orgSlug/resources`) lists, creates, edits and deletes resources — each with a name, optional
code/description, a kind (Labour / Equipment / Material) and an optional own calendar — and a per-activity
**Resources** dialog (from the activities row) assigns a resource with budgeted units and an optional
**driving-resource** flag, plus edit/unassign. A Material resource can never be the driving resource: the
driving toggle is disabled with an explanatory hint (the API's `MATERIAL_CANNOT_DRIVE` is the backstop),
and setting a driver moves the flag off the previous one (announced). Reads are open to any member; create/
edit/delete/assign are Planner + Org Admin. With `VITE_RESOURCES` off the app is byte-identical to before —
no nav link, no route, no row action. The activities row-actions crowding this adds a fifth item to is
recorded as tech debt (migrate the cell to the `Menu` primitive before the flag is flipped on).
