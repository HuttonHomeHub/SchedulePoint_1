---
'@repo/web': minor
---

Ship the **Project Explorer** navigator and turn the persistent app-shell **on by
default** (ADR-0029). The rail now hosts an accessible Client → Project → Plan tree:

- **Lazy drill-down** — expanding a client loads its projects, a project its plans,
  one query per expanded node (reusing the existing hierarchy reads, so page CRUD
  refreshes the tree for free). Nothing is fetched until you open it.
- **URL-projected selection + deep-linking** — the open plan is highlighted; landing
  on a plan/project URL auto-reveals and scrolls its ancestor path into view.
- **Keyboard-first** — a WAI-ARIA `tree` with roving focus and the full APG keymap
  (↑/↓, ←/→ to expand/collapse/move, Home/End, Enter/Space). Per the product
  decision, **client/project rows only expand**; only a **plan** opens on the canvas.
- The shell (top bar + collapsible/resizable rail, drawer below `lg`, welcome
  landing) is now the default navigation surface; set `VITE_NAV_TREE=false` for the
  previous header-only layout (emergency rollback). No API or database change.
