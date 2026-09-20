---
'@repo/web': minor
---

Draw the feasible window — the span a bar may legally occupy — in place of the float and drift tails.

The two tails were one fact drawn twice. Both centred on the same band, and their extremes were
already the window's: the drift tail's left edge is the early start, and a _corrected_ float tail's
right edge is the late finish. They become one hollow bracket with a cap at each end, drawn beneath
the bars so the bar occludes its middle and the span still reads as two flanking tails.

It closes `docs/TECH_DEBT.md` #348 by fixing it. The shipped float tail was drawn from the PLACED
finish using `totalFloat`, which is measured from the EARLY finish, so it overshot the late finish by
exactly the drift on every plan with a placement. The window's right edge derives from
`remainingFloat` instead — once, never independently from the late finish, which also makes a
rounding disagreement between the cap and the span's end unreachable rather than untested.

Two states that previously drew nothing at all are now visible. A placement past a ceiling puts the
right cap inside the bar; a placement earlier than logic allows — which the engine keeps rather than
clamping — puts the left cap inside it. Each inverts the draw order for that cap alone, and they are
independent.

A critical, unplaced bar now gets a zero-width bracket rather than no mark. That is the state most
bars on an existing plan are in, and a control that lights and does nothing is a dead end. The one
state that still draws nothing is a plan that has never been calculated, where there is no late
finish to bracket.

The toggle, its label and the legend are unchanged by this release and are the next slice.
