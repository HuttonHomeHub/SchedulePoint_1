---
'@repo/api': minor
'@repo/types': minor
---

feat(api): organise the resource library into groups (ADR-0053 §3, M3)

A resource pool of hundreds is now navigable. Resources can be nested under **groups**, without
fragmenting the pool itself — it stays a single organisation-wide pool, which is what makes
cross-plan over-allocation detection and resource levelling meaningful.

- A new resource kind, **`GROUP`**, is a grouping node rather than a resource: it has no calendar,
  no capacity ceiling and no cost rate, and it can never be assigned to an activity (422
  `GROUP_NOT_ASSIGNABLE`).
- Every resource carries a `parentId` (null = top level), settable on create and update.
  `GET …/resources?parentId=<id>` lists a group's contents and `?parentId=null` the top level;
  omitting it returns the whole library exactly as before.
- Moves are validated server-side: a group can't contain itself (409 `RESOURCE_PARENT_CYCLE`),
  only a group can contain resources (422 `RESOURCE_PARENT_NOT_GROUP`), a parent in another
  organisation is simply not found, and nesting stops at 10 levels (422 `RESOURCE_TREE_TOO_DEEP`).
  Two people re-organising at once can't combine their moves into a loop.
- Deleting a group deletes its whole contents together, unless something inside it is still
  assigned — in which case it is refused with the count of assigned resources in the group.
- An assigned resource can't be turned into a group, and a group that still holds resources can't
  be turned back into one.

Existing data is entirely unaffected: every existing resource is top-level and no resource is a
group. The CPM engine, the levelling pass, the resource histogram and Earned Value are untouched
and all read the same inputs as before — a group has no assignments, so it cannot appear in demand,
capacity or cost. Recalculation output is byte-identical.
