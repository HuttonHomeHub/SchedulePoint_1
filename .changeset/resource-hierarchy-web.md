---
'@repo/web': minor
---

feat(web): nested resource library with groups (ADR-0053 §3, M3 — behind `VITE_LIBRARY_SCOPING`)

The web surface for the resource hierarchy, behind the existing `VITE_LIBRARY_SCOPING` flag
(**off by default**). With it on:

- the **resources library** lists rows in tree order — a group is followed by its own contents,
  indented — with a `Group` column naming each row's parent and a **Not assignable** badge on
  every group, so the constraint is readable rather than implied;
- a group shows **Not scheduled** in the Calendar column, distinct from the "—" that means
  "inherits the plan calendar";
- the **resource form** offers `Group` as a kind and a **parent group picker** (indented by depth)
  that never offers a resource its own contents as a parent; choosing `Group` hides the calendar,
  capacity and cost fields, and those values are never sent for a group;
- deleting a group that still contains assigned resources explains **how many are assigned inside
  it**, rather than the misleading "this resource is assigned".

Groups are excluded from the **assign-a-resource** picker regardless of the flag — the API rejects
a group assignment, so offering one could only ever produce an error.

With the flag off, the library renders exactly as before: flat, in the server's order, with no
group column, badge, kind option or parent picker.
