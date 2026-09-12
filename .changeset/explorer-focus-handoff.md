---
'@repo/web': patch
---

Project Explorer: hand focus back to the tree when a focused row is removed under it.

A row can disappear while the browser's focus ring is physically on it — a lazy-load placeholder is
focusable and is unmounted the moment its fetch resolves, and a real node goes the same way on a
collapse or another member's delete. Focus landed on the page body, which on this surface also
silently disables the keyboard shortcuts, since those are handlers on the workspace root. The tree
now takes focus back and says what left (WCAG 2.2 §2.4.3 Focus Order).
