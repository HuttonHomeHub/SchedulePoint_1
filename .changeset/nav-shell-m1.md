---
'@repo/web': minor
---

Introduce the persistent **app-shell** foundation (ADR-0029), behind `VITE_NAV_TREE`
(off by default). The authenticated layout becomes a mounted-once shell — top bar +
a **Project Explorer** rail + a single workspace region — so navigating between plans
swaps only the main region and the rail keeps its state. On `lg`+ the rail is pinned,
**collapsible and resizable** (a keyboard-operable splitter; width/collapsed state
persisted); below `lg` it is an off-canvas **drawer** opened from the header. With no
plan selected the workspace shows a neutral **welcome empty-state** ("Select a plan
from the Project Explorer", plus a getting-started hint for a brand-new org).

This is the M1 slice: the rail body is a placeholder — the accessible Client → Project
→ Plan tree lands in M2. Flag-off is byte-for-byte today's layout. Adds a reusable
`Sheet` (off-canvas drawer) primitive on the native `<dialog>`. No API or database
change.
