---
'@repo/web': minor
---

Logic links now leave and enter the node glyphs at each end of a bar, the way NetPoint draws them.
Each link picks the shortest of up to eleven shapes that avoid other bars, and a second pass moves
a link off another's line where an equally clear shape exists. A link to a milestone arrives at the
triangle's centre from above or below. The old corridor router is retired.
