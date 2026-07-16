---
'@repo/web': patch
---

TSLD canvas: flag a **same-lane time overlap** (TECH_DEBT #24c). Auto-arrange never packs two
time-overlapping bars into one lane, but a manual lane drop (drag or `Alt+↑/↓`) could — with no cue.
A pure `laneOverlapIds` pass now marks both overlapping bars at the mapping seam; the painter draws a
stacked-squares badge above each (a shape cue, never colour-only — WCAG 1.4.1 — named in the legend),
and the accessible listbox line speaks "overlaps another activity in its lane". No API/engine change.
