---
'@repo/web': minor
---

The plan toolbar now responds to the width it actually has. Four named layout bands are derived from
the row's own container (not a viewport media query, so a future dock or split pane cannot desync
them), with hysteresis so dragging a window edge does not re-lay the row out on every pixel.

Below the widest band, Zoom out/in, Fit to plan and Go to today move **into** the `Zoom ▾` menu under
a Viewport heading, each keeping its own shaded reason rather than being dropped. In the narrowest
band the `Go to date`, `Zoom`, `View`, `Filter` and `Summary` triggers become icon-only and the search
field takes its floor width, so both rows fit inside their container at every supported width down to
768 px — measured, not asserted.

Touch: under a coarse pointer every toolbar control widens from 32 px to 40 px without losing height.

Fixes a WCAG 2.2 Target Size failure that predates this work: all three split-button carets (Add
activity, Link, Isolate) rendered 22–23 px wide against a 24 px minimum.
