---
'@repo/web': minor
---

Fix toolbar commands that could not be clicked, and stop the row lying about its width.

On a 1920×1080 monitor at 100% browser zoom, the plan workspace's Navigate row laid out 109 px wider
than the space it had, no overflow (`⋯`) button rendered at all, and **Legend** and **Keyboard
shortcuts** were painted outside the row with zero visible width — impossible to click with a mouse
or by touch, and reachable only by tabbing to them. At 1440 px the `⋯` button itself was one pixel
wide while holding the only route to fourteen commands; at 960 px it had no visible width on either
row. This failed WCAG 2.2 §2.5.8 Target Size (Minimum).

The cause was that the overflow calculation summed only the _controls_ and none of the row's own
spacing — the gaps between buttons and the dividers between groups — so it believed the row fitted
when it did not, and the surplus was paid by whatever sat furthest right falling off the edge.

Every command is now a real, clickable target at every supported width, on both rows, and the `⋯` is
the last thing to lose space rather than the first. Below Surface Pro landscape width the row now
scrolls rather than hiding controls. Demotion into the `⋯` also follows a stated priority instead of
left-to-right position, so the zoom controls stay on the bar and the reference links move first —
previously it was the other way round — and a two-state switch (Early | Visual, Diagram | Gantt) can
no longer end up with one half on the bar and the other in a menu.

**One deliberate, temporary regression:** because the row now measures itself honestly, it can no
longer afford text labels on every control at 1920 px, so more of the Navigate row is icon-only than
before. That is the correct behaviour for the space available, and it is not where this ends — the
next milestone reduces the row from 46 commands to about 24 without deleting any of them, which buys
the labels back honestly. A correct icon-only row was judged better than an unclickable labelled one.
