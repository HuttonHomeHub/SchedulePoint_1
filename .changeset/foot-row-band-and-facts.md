---
'@repo/web': patch
---

The foot of the plan workspace now matches the bands above it, and the plan's facts sit on two
lines without taking any more height.

The bottom row had no surface of its own at all — transparent, on the page, one grey hairline —
while the header and command deck are a navy card. It now paints exactly the same ground, and costs
no height doing it: the treatment is a surface scope rather than a card, so nothing about the box
model changes.

The object actions and the plan's facts also swap sides, so the buttons keep a fixed left edge
instead of shifting as the facts change width.

And bounding the facts to two lines hands 231 px back to the object bar, which finishes what the
previous fix could not: at 1440 the bar was still wrapping onto three lines and costing the diagram
76 px. It no longer wraps at any width measured.
