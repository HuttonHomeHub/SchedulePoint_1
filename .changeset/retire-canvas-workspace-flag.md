---
'@repo/web': patch
---

Retire `VITE_CANVAS_WORKSPACE`, the last feature flag that selected between two different plan
surfaces.

**No user-visible change.** Every published image already compiled this flag on — a `VITE_` flag is
inlined at build time and the release pipeline passes none, so the branch being deleted was
unreachable in any shipped bundle (ADR-0088 D1). What goes is the ~270-line legacy long-scrolling
plan page it selected when off, and the branch that chose between them.
