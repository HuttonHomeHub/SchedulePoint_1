---
'@repo/web': patch
---

The printed programme, the printed diagram and the exported picture are set in the product's own
typeface.

SchedulePoint is set in IBM Plex Sans. Six places set type by hand and had never received that
decision: both print stylesheets named `Inter` — a face this repository has no font file for, so
paper fell through to whatever the reader's machine defaulted to — and the four fonts in the
exported picture's title band named `system-ui`. The diagram inside an export was in the product's
face and the band around it was not, which is the one place the typeface is seen by someone other
than the planner who made it.

A structural gate now derives the family from the design token and fails on any hand-set font in the
canvas or a stylesheet, so the next typeface decision cannot miss these layers again. It records
what it cannot see, including the favicon.
