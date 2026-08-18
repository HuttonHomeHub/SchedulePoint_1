---
'@repo/web': patch
---

Fix a contrast failure on every Delete button.

Hovering a destructive button lightened its fill toward the page, taking the label to 4.32:1 in the
light theme — below the 4.5:1 WCAG 2.2 AA floor, on the shipped default. The hovered fill is now a
token per theme rather than an alpha utility, which is also what makes it checkable: the contrast
matrix resolves tokens, and `hover:bg-destructive/90` was not one.
