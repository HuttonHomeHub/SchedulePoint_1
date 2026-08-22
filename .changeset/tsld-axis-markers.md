---
'@repo/web': minor
---

The TSLD's date marks become axis markers in the ruler, so no date label covers an activity bar.

`Data date`, `Today` and the cursor date readout were painted as pills at a fixed screen y on the
scene canvas — chrome drawn onto a surface that scrolls — so a label printed over whichever lane the
planner had panned to the top. On a 1646 px screen the words `Data date` printed across the first
activity's name.

All three are now rendered in the existing 40 px ruler band, on two rows: the cursor readout above,
`Data date` and `Today` below. The vertical rules stay on the diagram, where a full-height line means
something at every lane. The diagram gains no chrome and loses none — the band was already there.

When the data date and today are too close for both words, `Data date` keeps its label and `Today`
keeps its dashed rule, which the legend already names.
