---
'@repo/web': minor
---

Alt with an arrow key now moves every selected activity on the diagram, not just the one under the
cursor. A held key is one save, and one Ctrl+Z puts the whole selection back (quick presses on the
same selection within half a second are a single undo step). A screen reader announces what moved,
for example "3 activities moved 2 days later; dates will update.", and is told when a selection
becomes plural that the arrow chord moves all of it. Moving the selection up is refused aloud when
any selected activity is already in the top lane, and a selection that includes a WBS summary says
so rather than failing at the server. A plural drag that lost the pen no longer announces a move
that did not happen, and its announcement now says how far the selection moved. The keyboard
shortcuts list describes the new behaviour.
