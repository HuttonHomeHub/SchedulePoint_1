---
'@repo/web': minor
---

The TSLD canvas can now draw the **data date** — the status line the whole progress model pivots
on — behind `VITE_CANVAS_DATA_DATE` (default **off**). When enabled: a solid 2px foreground-hue
vertical at day offset 0 with a `Data date` pill, distinguishable from the dashed Today line by
shape and weight rather than hue (WCAG 1.4.1); when the two lines round to the same pixel exactly
one draws, with a merged `Data date · today` pill. The mark gets a `View▾ ▸ Markers ▸ Data date
line` toggle, a legend entry and an export-legend entry (so an exported PNG/PDF shows and names
it), and the activities listbox gains a visually-hidden statement of the data date (and today,
when they differ) via `aria-describedby`. Flag-off, the canvas paints byte-for-byte the prior
frame — pinned by a dedicated parity suite.
