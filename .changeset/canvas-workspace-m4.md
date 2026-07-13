---
'@repo/web': minor
---

feat(web): canvas-first plan workspace — M4 responsive single-pane (ADR-0030)

Make the canvas-first workspace usable on narrow viewports. At/above `md` it keeps the vertical
split (canvas + drag-resizable activity panel); **below `md` it switches to a Diagram / Activities
segmented view toggle** showing one pane at a time — the canvas can't usefully share a phone's
height with a table. Both panes stay mounted and are toggled with `hidden`, so switching preserves
the canvas viewport and the table scroll. Adds a small reusable `useMediaQuery` hook (structure-
changing queries only; pure styling stays on Tailwind `md:`/`lg:`). Still off by default behind
`VITE_CANVAS_WORKSPACE`; frontend only.
