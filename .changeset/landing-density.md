---
'@repo/web': minor
---

The organisation landing fits the window: tighter rows, and boxes that scroll instead of the page.

The workspace region was being asked for **1302 px of room in 949** at a 1000 px window, so the
landing scrolled. (The document never did — the shell is an `h-dvh` grid with `overflow: hidden`
and `<main>` is the scroll container, which is where the cap belongs.) Each box now takes a share
of the height and scrolls its own body, and `<main>` does not scroll at all.

**The tightening is what makes the cap worth having, and the two are one change rather than two.**
Measured first: a box's body is 313 px and the median row was 81, so a capped box would have held
**three** rows — fewer where a row carried flags and wrapped to 121. So a row's subject and its
context moved onto one line, the staleness caveat rides the sentence it qualifies instead of
sitting under it, and a plan's flags run inline rather than one per line. Median row **81 → 61 px**,
"Jump back in" **61 → 41**, a flagged row **121 → 101**, and a capped box now shows **four rows**
with the fifth partly visible.

A box states its total ("8 plans"), because content below the fold of a card cannot be told from
content that does not exist. Its body is keyboard-scrollable, which a scroll container is not by
default. Boxes size to content up to their share, so one holding a single plan is short rather than
a tall box with a hole in it. And below a window height that cannot give each box its heading plus
two rows, the floor wins and the page scrolls exactly as before — the fallback is the absence of
the constraint, not a second layout.

All seven questions the landing claims to answer stay above the fold at 1646 and 1920.

Two fixes came out of building it. `SectionCard`'s header carried `flex items-start
justify-between` over `CardHeader`'s own `flex flex-col` — different utility groups, so both
survive and the column wins, meaning the header has never been a row and its `action` has never sat
beside the title. Invisible until this milestone gave it a consumer. And the new `min-height` is
spelled on the spacing scale rather than as an arbitrary value, which the sizing ratchet was right
to insist on.
