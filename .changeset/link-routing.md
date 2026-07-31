---
'@repo/web': minor
---

Route dependency links around the bars between their lanes instead of straight through them, and
make the direction arrowhead legible at Month zoom. The vertical corridor now steps aside when a bar
stands in it — a bounded, deterministic search with a two-corridor fallback through the inter-lane
gutter — so a line no longer appears to touch work it has nothing to do with. Behind
`VITE_CANVAS_LINK_ROUTING` (default on); flag-off draws the previous line point for point.
