---
'@repo/web': minor
---

feat(web): in-tree CRUD for the Project Explorer (ADR-0029 Phase 2)

Planners and Org Admins can create, rename, and soft-delete clients, projects,
and plans directly from the Project Explorer rail — via a per-row "⋯" button,
right-click, or the ContextMenu/Shift+F10 key — plus a "New client" control in
the rail header for the empty-org case. It reuses the existing form dialogs,
`ConfirmDialog` (with kind-appropriate cascade copy), mutation hooks, optimistic
locking, and the soft-delete/Recently-Deleted flow; there is no backend change.

Introduces a hand-rolled, tokenised `Menu`/`MenuItem` design-system primitive
(WAI-ARIA APG Menu Button — no new dependency) and a shell-layer `NavigatorCrud`
coordinator that owns the dialogs, so the shared tree emits CRUD intents without a
`feature → feature` import (an extension within ADR-0029; recorded in
`docs/DECISIONS.md`). Selection stays a pure projection of the URL, so a new plan
navigates + reveals while new folders are revealed by expansion.

Ships behind `VITE_NAV_TREE_CRUD` (off by default) and additionally gated by write
RBAC, so Contributors/Viewers keep a read-only tree.
