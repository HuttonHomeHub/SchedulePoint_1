---
'@repo/web': minor
---

Every non-canvas screen's title, description and primary action are one decision. Nine screens
hand-rolled the same header row between them and the result was four different heading rhythms —
75, 83, 85 and 105 px from the top of the page, identical at 1280 and 1646, so no width resolved
them. They are now two: one for screens with a breadcrumb trail and one for screens without, each
exact, with the 28 px between them being the trail's own height.

It also gives a page description a measure for the first time. The archetype's heading column
shrink-wrapped to its content, so a 42-character description rendered 267 px wide and a
116-character one 736 px on screens sitting side by side. Every page description is now one width.
