---
'@repo/web': minor
---

The diagram's logic lines no longer disappear behind bars, and the row is rebuilt around them
(ADR-0150, ADR-0151).

Links paint under bars, so a line running through a bar in its own row did not overlap it — it
vanished behind it. The router only ever checked the vertical corridor, and its own last-resort
route ran along the bar edge it was meant to avoid, on 58 of one imported programme's 68 gutter
runs. Lines now step around the bars in their own row, and the gutter between two rows carries
channels so two runs sharing it read as two lines: 105 hidden links become 47 on that programme.

The rest was a room problem, so the row gives the bar back most of its height. An activity is a
thin bar with a node at each end, its name above it and its dates below — and the row grows from
28 px to 52. The old row left five pixels of clear space above a bar, which is why four of the
diagram's seventeen cues were already drawing into the row above without anything reporting it.

Criticality keeps all three of its states without relying on colour (a filled node, a heavier ring,
a plain hairline; solid, dashed and plain outlines on a milestone), and the legend describes what
the canvas draws rather than the cue it replaced. Dates below a bar are shown where there is room
for them and withheld where there is not, instead of being printed over each other; adjacent names
share the gap between their bars rather than each claiming all of it.
