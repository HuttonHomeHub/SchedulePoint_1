---
'@repo/web': minor
---

The landing's rows take what they need, and the boxes fill them.

`web-v0.134.0` capped each box at half the available height. That left **surplus in the top row
while the bottom row scrolled**: "Jump back in" holds at most five plans and "Needs your attention"
is usually a short inbox, while the bottom row carries the two eight-row lists this screen exists to
show. The top row now takes its content's height and the bottom row takes the rest.

Measured at 1646 × 1000: bottom-row boxes **399 → 517 px**, so a box shows **six rows instead of
four**, and the 118 px it gained is exactly the surplus the top row was holding. `<main>` still does
not scroll — 949 of 949 — which is the condition this whole change turns on.

Boxes also stretch to their row again, so the two in a row end level rather than raggedly. That
reverses a rule from the previous release, and the reason is worth stating: a screenshot then showed
a short box padding out to a 399 px card with 250 px of nothing in it, and the conclusion drawn was
"size to content, never stretch". The hole came from the **equal rows**, not from stretching. With
the rows sized to need there is no hole to avoid.
