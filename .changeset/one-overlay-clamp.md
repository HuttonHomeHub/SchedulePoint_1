---
'@repo/web': patch
---

One viewport clamp for positioned overlays: the menu's measured clamp and top-layer portal target
move to a shared leaf, toolbar popovers measure themselves instead of guessing, both cap their
height with their own scroll at short viewports, and Escape inside a toolbar popover no longer
closes an enclosing dialog.
