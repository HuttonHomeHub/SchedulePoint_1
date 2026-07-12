---
'@repo/web': minor
---

feat(web): turn Project Explorer in-tree CRUD on by default

`VITE_NAV_TREE_CRUD` now defaults **on** — the row context menu (create/rename/
soft-delete via the ⋯ button, right-click, ContextMenu/Shift+F10 key, and touch
long-press) and the rail-header "New client" control are live for writers
(Planner/Org Admin); Contributors/Viewers keep a read-only tree. Adds the flag-on
Playwright journeys (create client→project→plan from the rail, rename, and
cascade-delete → Recently Deleted) with an accessibility pass. Set
`VITE_NAV_TREE_CRUD=false` to fall back to the navigation-only tree.
