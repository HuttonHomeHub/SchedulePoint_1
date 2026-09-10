---
'@repo/web': minor
---

The command deck's captions go, and the rows do the grouping.

VIEW / FIND / AUTHOR / PLAN and the selection bar's SELECTION are deleted. Nothing is lost to a
screen reader: each was an `aria-hidden` span beside a group whose own accessible name already
carried the word, and those names are untouched.

The width they were spending is what pays for the pen the previous release put on that row.
Measured at 1280, the twelve commands on the authoring row fit their container with 195 pixels to
spare and the row still wrapped — the overflow was the captions, their dividers and the gaps
either side, not the commands. Deleting them takes that row back to a single line with the pen
still on it.

The command band is now 139 pixels at 1440, 1646 and 1920, and the activities row 51.
