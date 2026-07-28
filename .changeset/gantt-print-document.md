---
'@repo/web': minor
---

Add the printed programme for the Gantt view (ADR-0059 M4, behind `VITE_GANTT_VIEW`).

`Print` now follows the active view. With the Gantt showing it mounts a purpose-built print
document rather than styling the live view for paper — because the live panel virtualizes, and
printing it would emit a programme cropped to whichever rows happened to be scrolled into view.
The printed document renders every row, fits the whole span to the page, repeats the column
headings and the time ruler on each page via a native `<thead>`, forces the light palette, and
carries a legend so a greyscale photocopy is still readable.

The detached-container print convention the TSLD's image path already used is extracted to a
shared module and both surfaces now use it. Column text and ruler tick placement are likewise
shared, so the screen and the page cannot disagree about a date.

Flag-off is unchanged: `Print` still rasterises the diagram.
