---
'@repo/web': patch
---

fix(web): the routed link's gutter leg lands in screen space

`routeOrthogonal`'s last-resort route joins two vertical corridors with a short horizontal leg in
the inter-lane gutter, and computed that leg's y by **subtracting** `view.originY` where
`screenYOfLane` — the function that defines screen space — adds it, while the route's own endpoints
arrive already in screen space. The error is `2 × originY`, and `originY` is never zero in the
shipped product: 40 on first paint, 32 after Fit, accumulating negative after any downward pan.

Measured against the real painter before the fix: the fallback fires on 385 routes across two
plans, two viewports and two zooms, and **every one** of those legs sat exactly `−2 × originY` from
the gutter it names — 64 px out at rest, 1,000 px out panned. On a 2,160-activity plan panned down,
58 of 60 fired legs were drawn off-canvas. That is a planner's report of a link leaving the page and
coming back, produced by arithmetic rather than by how far apart the two activities are.

It survived because the repository's only two exercises of this path both pinned `originY: 0` — the
single value at which the two signs agree — and the unit case asserted the route's _shape_ rather
than where the leg landed. Both are fixed: the case is parameterised over `originY` and asserts the
value, derived from `screenYOfLane` rather than written as a literal.

The exported diagram and the printed programme compose the same scene, so they carried it too.
