---
'@repo/web': patch
---

fix(web): library lists and pickers no longer truncate at the first 20 rows — the resource and calendar libraries (and the members list, recycle bin, client/project/plan navigator, baselines, and the predecessor/successor/cross-plan link lists) called their cursor-paginated endpoints with no pagination params, so they silently showed only the server's default 20-row page and the rest of an org's rows could be neither seen nor selected. Each now pages through every row via `apiFetchAllPages`, the helper already used by the plan workspace.
