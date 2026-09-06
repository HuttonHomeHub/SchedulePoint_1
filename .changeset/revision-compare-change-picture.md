---
'@repo/api': minor
'@repo/web': minor
---

Say what changed between two revisions, in words and on the diagram.

A comparison already reported what entered and left the critical path and how
far the completion moved. It now also reports what somebody **edited**: added,
removed, renamed, re-coded, re-typed, re-durationed, re-dated and criticality
fall out of what a baseline already froze, and logic, constraints, calendar,
WBS parent, lane and progress needed the snapshot extended — because a baseline
froze the engine's output and almost none of its input.

Two things are worth knowing before reading a comparison. Those six new classes
are **permanently unavailable on any baseline captured before this release**: no
backfill is possible, because writing today's logic into a historic snapshot
would state as history a graph that baseline never saw, and the product says so
in words rather than reporting "no change". And the list is ordered by **time,
never by size** — a list sorted biggest-first, beside a completion that slipped,
is a ranking of blame, which is the causal claim this feature deliberately does
not make.

`View ▾ ▸ Compare on diagram` puts the same comparison on the picture, off by
default: where the changed bars were, what was removed — drawn in its recorded
lane, which is the only reason removed work can be drawn at all — and which
links changed. It states what it could not draw, because a diagram has no
"showing N of M", and it says that logic changes are listed in words under
Changes, because a link is not something the diagram can describe to a screen
reader.
