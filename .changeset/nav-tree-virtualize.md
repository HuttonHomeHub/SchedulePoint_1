---
'@repo/web': patch
---

Virtualize the Project Explorer tree (ADR-0029, C2). The flattened visible rows are
now windowed with `@tanstack/react-virtual`, so the rail stays cheap at org scale
(hundreds of plans). ARIA `setsize`/`posinset` come from the full model and the
focused/selected node is always kept rendered, so roving-tabindex keyboard navigation
and deep-link selection still reach any node even when it is scrolled out of view. No
visible behaviour change for small trees.
