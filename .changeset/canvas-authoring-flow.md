---
'@repo/web': minor
---

The canvas now says what it is doing while you author (ADR-0064 M1, `VITE_CANVAS_AUTHORING_FLOW`
default-on): a band above the diagram naming the armed tool, the click it expects and — mid-link —
which endpoint you already picked; a confirmation naming the direction that was created, with an
Undo; keyboard parity so the Link tool works without a pointer; an empty plan that names the first
gesture; and recalculation held while a two-click pick is open, so the bars cannot move between your
two clicks.
