---
'@repo/web': patch
---

Retire `VITE_CANVAS_TOOLBAR` and delete the alternative plan-workspace layout it selected
(ADR-0088 D3). No user-visible change: the flag was compiled on and unreachable by any build path,
so the deleted branch could not be selected by anybody.
