---
'@repo/web': patch
---

fix(web): load the whole plan into the workspace instead of the first page

The canvas, activities table and logic view fetched a single default page (20 rows) from the
cursor-paginated activities and dependencies endpoints, so a plan with more than 20 activities showed
only the first ~20 and — because a dependency edge only draws when both its endpoint bars are loaded —
almost none of its links. Adds an `apiFetchAllPages` helper that follows `meta.nextCursor` to
exhaustion (100 rows/page) and points the plan-workspace activity and dependency queries at it, so the
full network loads and renders. No API or schema change.
